/**
 * Suggestion Learning Store (Phase 2)
 * -----------------------------------
 * Local-first telemetry + personal dictionary + lazy n-gram model loader,
 * mirroring how Gboard learns on-device first and syncs later:
 *
 *  1. ACCEPT / REJECT events update per-key learned weights (localStorage).
 *     Weights re-rank the strip live via `getGDSuggestions(..., { weights })`
 *     and can suppress openers an officer keeps rejecting.
 *  2. Personal dictionary phrases (star button on the strip) persist locally
 *     and sync to `/api/suggestions/phrases` when online.
 *  3. Events queue in an outbox and flush (batched, debounced) to
 *     `/api/suggestions/events` -> Prisma `SuggestionEvent` for station-wide
 *     analytics. Offline-safe: failed flushes stay queued.
 *  4. A mined n-gram model (`/suggestions/ngrams.json`, produced by
 *     `npm run mine:suggestions`) is fetched once, cached in localStorage and
 *     used for Gboard-style next-word predictions.
 *
 * SSR-safe: every entry point is a no-op outside the browser.
 */
import type { GDSuggestionOptions } from "@/lib/gdSuggestions";

const LS_KEY = "haryana_police_cms_suggest_v1";
const NGRAM_CACHE_KEY = "haryana_police_cms_ngram_v1";
const NGRAM_URL = "/suggestions/ngrams.json";
const USER_KEY = "haryana_police_cms_user";
const REMOTE_SUGGESTIONS_ENABLED = process.env.NEXT_PUBLIC_SUGGESTIONS_REMOTE === "true";

const MAX_TELEMETRY = 4000;
const MAX_PHRASES = 200;
const MAX_OUTBOX = 200;
const FLUSH_DELAY_MS = 4000;
const MAX_MODEL_WORDS = 4000;
const MAX_HINDI_PERSONAL = 200;
const MAX_HINDI_SUPPRESSED = 500;
const MAX_HARVESTED_COUNTS = 3000;
/** Times a suggested Hindi correction must be accepted to become silent. */
const HINDI_PROMOTE_AFTER = 2;
/** Times it must be rejected (with no accept) to stop being offered. */
const HINDI_SUPPRESS_AFTER = 2;

export type SuggestionEventKind = "accept" | "reject" | "dismiss" | "save" | "remove";

interface TelemetryEntry {
  /** times the officer accepted this key */
  a: number;
  /** times the officer rejected/dismissed this key */
  r: number;
}

export interface PhraseEntry {
  id: string;
  text: string;
  ts: number;
}

interface OutboxEntry {
  id: string;
  kind: SuggestionEventKind;
  text: string;
  field?: string;
  ts: number;
}

interface Persisted {
  v: 1;
  telemetry: Record<string, TelemetryEntry>;
  phrases: PhraseEntry[];
  harvestedWords?: string[];
  harvestedPhrases?: string[];
  /** Document frequency of harvested words (Phase 3 corpus suggestions). */
  harvestedWordCounts?: Record<string, number>;
  /** Hindi auto-correct: corrections the officer accepted HINDI_PROMOTE_AFTER times. */
  hindiPersonal?: Record<string, string>;
  /** Hindi auto-correct: corrections the officer rejected HINDI_SUPPRESS_AFTER times. */
  hindiSuppressed?: Record<string, boolean>;
  outbox: OutboxEntry[];
}

interface NgramModel {
  v?: number;
  generatedAt?: string;
  words?: Record<string, number>;
  next1?: Record<string, string[]>;
  next2?: Record<string, string[]>;
}

const emptyPersisted = (): Persisted => ({
  v: 1,
  telemetry: {},
  phrases: [],
  harvestedWords: [],
  harvestedPhrases: [],
  harvestedWordCounts: {},
  hindiPersonal: {},
  hindiSuppressed: {},
  outbox: [],
});

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function loadPersisted(): Persisted {
  if (!isBrowser()) return emptyPersisted();
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return emptyPersisted();
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      v: 1,
      telemetry: parsed.telemetry && typeof parsed.telemetry === "object" ? parsed.telemetry : {},
      phrases: Array.isArray(parsed.phrases) ? parsed.phrases : [],
      harvestedWords: Array.isArray(parsed.harvestedWords) ? parsed.harvestedWords : [],
      harvestedPhrases: Array.isArray(parsed.harvestedPhrases) ? parsed.harvestedPhrases : [],
      harvestedWordCounts:
        parsed.harvestedWordCounts && typeof parsed.harvestedWordCounts === "object"
          ? parsed.harvestedWordCounts
          : {},
      hindiPersonal:
        parsed.hindiPersonal && typeof parsed.hindiPersonal === "object" ? parsed.hindiPersonal : {},
      hindiSuppressed:
        parsed.hindiSuppressed && typeof parsed.hindiSuppressed === "object"
          ? parsed.hindiSuppressed
          : {},
      outbox: Array.isArray(parsed.outbox) ? parsed.outbox : [],
    };
  } catch {
    return emptyPersisted();
  }
}

function savePersisted(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(persisted));
  } catch {
    // storage full / private mode - keep going with in-memory state
  }
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function getUserId(): string | undefined {
  if (!isBrowser()) return undefined;
  try {
    return window.localStorage.getItem(USER_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

let persisted: Persisted = emptyPersisted();
let model: NgramModel | null = null;
let modelLoaded = false;
let loadPromise: Promise<void> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let lifecycleHooksInstalled = false;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // one bad subscriber must not break the others
    }
  });
}

/* --------------------------------------------------------------------------
 *  Public store
 * ----------------------------------------------------------------------- */

export const suggestionStore = {
  /** Subscribe to any change (weights, phrases, model arrival). */
  subscribe(cb: () => void): () => void {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  },

  /**
   * One-time (per session) bootstrap: read telemetry, use the cached n-gram
   * model for instant predictions, then refresh the model in the background
   * and flush any queued events.
   */
  ensureLoaded(): Promise<void> {
    if (!isBrowser()) return Promise.resolve();
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      persisted = loadPersisted();

      // Instant first paint from the cached model (if a previous visit fetched it).
      try {
        const cached = window.localStorage.getItem(NGRAM_CACHE_KEY);
        if (cached) {
          model = JSON.parse(cached) as NgramModel;
          modelLoaded = true;
          notify();
        }
      } catch {
        // ignore corrupt cache
      }

      installLifecycleHooks();

      if (REMOTE_SUGGESTIONS_ENABLED) {
        // Background refresh + sync (only when optional remote endpoints/assets are enabled).
        try {
          const res = await fetch(NGRAM_URL, { cache: "no-cache" });
          if (res.ok) {
            const fresh = (await res.json()) as NgramModel;
            model = fresh;
            modelLoaded = true;
            try {
              window.localStorage.setItem(NGRAM_CACHE_KEY, JSON.stringify(fresh));
            } catch {
              // cache is best-effort (it can be large)
            }
            notify();
          }
        } catch {
          // offline: keep serving the cached model
        }

        void suggestionStore.syncPhrases();
        void suggestionStore.flushOutbox();
      }

      void suggestionStore.syncHarvestedVocabulary();
    })();

    return loadPromise;
  },

  isModelLoaded(): boolean {
    return modelLoaded;
  },

  /**
   * Imports vocabulary words & multi-word phrases extracted from uploaded documents
   * and case records into the persistent local suggestion dictionary.
   * `counts` (document frequency per word) powers the Hindi corpus suggestions.
   */
  importHarvestedVocabulary(
    words: string[] = [],
    phrases: string[] = [],
    counts: Record<string, number> = {}
  ): void {
    if (!isBrowser()) return;
    const existingWords = new Set(persisted.harvestedWords || []);
    const existingPhrases = new Set(persisted.harvestedPhrases || []);
    const existingCounts = { ...(persisted.harvestedWordCounts || {}) };

    let changed = false;
    for (const w of words) {
      const clean = w.trim();
      if (clean && !existingWords.has(clean)) {
        existingWords.add(clean);
        changed = true;
      }
    }

    for (const p of phrases) {
      const clean = p.trim();
      if (clean && !existingPhrases.has(clean)) {
        existingPhrases.add(clean);
        changed = true;
      }
    }

    for (const [word, count] of Object.entries(counts)) {
      const clean = word.trim();
      const n = Math.floor(count);
      if (clean && n > 0 && existingCounts[clean] !== n) {
        existingCounts[clean] = n;
        changed = true;
      }
    }

    if (changed) {
      persisted.harvestedWords = Array.from(existingWords).slice(0, 3000);
      persisted.harvestedPhrases = Array.from(existingPhrases).slice(0, 1000);
      const countEntries = Object.entries(existingCounts)
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_HARVESTED_COUNTS);
      persisted.harvestedWordCounts = Object.fromEntries(countEntries);
      savePersisted();
      notify();
    }
  },

  /**
   * Fetches the latest harvested words & phrases extracted from all uploaded
   * case documents stored in the evidence vault.
   */
  async syncHarvestedVocabulary(): Promise<void> {
    if (!isBrowser()) return;
    try {
      const res = await fetch("/api/suggestions/harvest");
      if (res.ok) {
        const data = await res.json();
        if (data.success && (data.words || data.phrases)) {
          suggestionStore.importHarvestedVocabulary(
            data.words || [],
            data.phrases || [],
            data.counts || {}
          );
        }
      }
    } catch {
      // offline: continue with cached harvested vocabulary
    }
  },

  /**
   * Hindi auto-correct learning (Phase 2): an accepted suggestion raises the
   * `hi:<normalized-word>` telemetry key; after HINDI_PROMOTE_AFTER accepts it
   * is promoted to a personal SILENT correction for this officer.
   */
  recordHindiAccept(normalizedWrong: string, replacement: string): void {
    if (!normalizedWrong || !replacement) return;
    const t = persisted.telemetry[`hi:${normalizedWrong}`] ?? { a: 0, r: 0 };
    t.a += 1;
    persisted.telemetry[`hi:${normalizedWrong}`] = t;
    trimTelemetry();
    if (t.a >= HINDI_PROMOTE_AFTER) {
      persisted.hindiPersonal = persisted.hindiPersonal ?? {};
      persisted.hindiPersonal[normalizedWrong] = replacement;
      const keys = Object.keys(persisted.hindiPersonal);
      if (keys.length > MAX_HINDI_PERSONAL) {
        for (const k of keys.slice(0, keys.length - MAX_HINDI_PERSONAL)) {
          delete persisted.hindiPersonal[k];
        }
      }
      // A promoted word is no longer suppressed.
      if (persisted.hindiSuppressed) delete persisted.hindiSuppressed[normalizedWrong];
    }
    pushOutbox("accept", `hi:${normalizedWrong}`, "hindi-autocorrect");
    savePersisted();
    notify();
  },

  /**
   * Hindi auto-correct learning (Phase 2): an explicitly rejected suggestion
   * lowers the key; after HINDI_SUPPRESS_AFTER rejects (with no accept) the
   * correction stops being offered for this officer.
   */
  recordHindiReject(normalizedWrong: string): void {
    if (!normalizedWrong) return;
    const t = persisted.telemetry[`hi:${normalizedWrong}`] ?? { a: 0, r: 0 };
    t.r += 1;
    persisted.telemetry[`hi:${normalizedWrong}`] = t;
    trimTelemetry();
    if (t.r >= HINDI_SUPPRESS_AFTER && t.a === 0) {
      persisted.hindiSuppressed = persisted.hindiSuppressed ?? {};
      persisted.hindiSuppressed[normalizedWrong] = true;
      const keys = Object.keys(persisted.hindiSuppressed);
      if (keys.length > MAX_HINDI_SUPPRESSED) {
        for (const k of keys.slice(0, keys.length - MAX_HINDI_SUPPRESSED)) {
          delete persisted.hindiSuppressed[k];
        }
      }
    }
    pushOutbox("reject", `hi:${normalizedWrong}`, "hindi-autocorrect");
    savePersisted();
    notify();
  },

  /**
   * Snapshot of the Hindi learning state + corpus, consumed by
   * useHindiReportAutocorrect on every word completion.
   */
  getHindiCorrectionBias(): {
    promoted: Record<string, string>;
    suppressed: Record<string, boolean>;
    corpus: { word: string; count: number }[];
  } {
    const corpus = Object.entries(persisted.harvestedWordCounts || {})
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 1500);
    return {
      promoted: { ...(persisted.hindiPersonal || {}) },
      suppressed: { ...(persisted.hindiSuppressed || {}) },
      corpus,
    };
  },

  /**
   * Snapshot for the engine: mined word-frequency prior, overridden by the
   * officer's learned accept/reject weights, the officer's saved dictionary
   * phrases, and the raw vocabulary harvested from uploaded documents.
   *
   * `personalPhrases` deliberately contains ONLY what the officer saved
   * themselves - raw document harvest goes out in the separate
   * `harvestedPhrases` / `harvestedWords` buckets so the engine can keep
   * OCR-noisy terms from dominating mid-word completions.
   *
   * @param context Text before the caret; when supplied, mined next-word
   *                predictions for that context are included.
   */
  getEngineOptions(context?: string): GDSuggestionOptions {
    const weights: Record<string, number> = {};

    // Mined corpus frequencies give fresh installs a sensible prior.
    const words = model?.words ?? {};
    let n = 0;
    for (const [w, c] of Object.entries(words)) {
      if (n++ >= MAX_MODEL_WORDS) break;
      weights[w] = 1 + Math.min(0.6, Math.log10(1 + c) * 0.18);
    }

    // Learned telemetry overrides the mined prior.
    for (const [k, t] of Object.entries(persisted.telemetry)) {
      weights[k] = clamp(1 + t.a * 0.6 - t.r * 0.5, 0.1, 8);
    }

    // Give high prior to harvested vocabulary from uploaded files
    for (const hw of persisted.harvestedWords || []) {
      const norm = hw.toLowerCase().trim();
      if (!weights[norm]) weights[norm] = 1.6;
    }
    for (const hp of persisted.harvestedPhrases || []) {
      const norm = hp.toLowerCase().trim();
      if (!weights[norm]) weights[norm] = 2.0;
    }

    const personalPhrases = persisted.phrases.map((p) => p.text);

    return {
      weights,
      personalPhrases,
      harvestedPhrases: [...(persisted.harvestedPhrases || [])],
      harvestedWords: [...(persisted.harvestedWords || [])],
      nextWords: context ? suggestionStore.getNextWords(context) : [],
    };
  },

  /**
   * Gboard-style next-word candidates for the text before the caret.
   * Uses the mined bigram/trigram model; after a space we predict the next
   * word, mid-token we return candidates for the previous word so the engine
   * can filter them by the typed prefix.
   */
  getNextWords(context: string): string[] {
    if (!model || !context) return [];
    const trailingSpace = /\s$/.test(context);
    const parts = context
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean);
    if (parts.length === 0) return [];
    if (!trailingSpace) parts.pop(); // drop the partial token being typed
    if (parts.length === 0) return [];

    const last1 = parts[parts.length - 1];
    const last2 = parts.length >= 2 ? `${parts[parts.length - 2]} ${last1}` : "";
    const list = (last2 && model.next2?.[last2]) || model.next1?.[last1] || [];
    return list.slice(0, 5);
  },

  /** Records an accepted suggestion (raises the key's learned weight). */
  recordAccept(key: string, field?: string): void {
    if (!key) return;
    const t = persisted.telemetry[key] ?? { a: 0, r: 0 };
    t.a += 1;
    persisted.telemetry[key] = t;
    trimTelemetry();
    pushOutbox("accept", key, field);
    savePersisted();
    notify();
  },

  /**
   * Records a rejected or dismissed suggestion (lowers the key's learned
   * weight - the core Gboard feedback loop that purges bad suggestions).
   */
  recordReject(key: string, field?: string, kind: "reject" | "dismiss" = "reject"): void {
    if (!key) return;
    const t = persisted.telemetry[key] ?? { a: 0, r: 0 };
    t.r += 1;
    persisted.telemetry[key] = t;
    trimTelemetry();
    pushOutbox(kind, key, field);
    savePersisted();
    notify();
  },

  listPhrases(): PhraseEntry[] {
    return [...persisted.phrases];
  },

  /** Star-to-dictionary: persists a phrase locally, then syncs best-effort. */
  savePhrase(text: string, field?: string): PhraseEntry | null {
    const trimmed = text.trim().replace(/\s+/g, " ");
    if (!trimmed) return null;
    const existing = persisted.phrases.find((p) => p.text === trimmed);
    if (existing) return existing;
    const entry: PhraseEntry = { id: uid(), text: trimmed, ts: Date.now() };
    persisted.phrases.unshift(entry);
    if (persisted.phrases.length > MAX_PHRASES) persisted.phrases.length = MAX_PHRASES;
    pushOutbox("save", trimmed, field);
    savePersisted();
    notify();
    const userId = getUserId();
    if (userId) {
      void fetch("/api/suggestions/phrases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, text: trimmed }),
      }).catch(() => {
        // offline - the local dictionary still works
      });
    }
    return entry;
  },

  removePhrase(id: string): void {
    const idx = persisted.phrases.findIndex((p) => p.id === id);
    if (idx === -1) return;
    const removed = persisted.phrases[idx];
    persisted.phrases.splice(idx, 1);
    pushOutbox("remove", removed.text);
    savePersisted();
    notify();
    const userId = getUserId();
    if (userId && removed) {
      void fetch("/api/suggestions/phrases", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, text: removed.text }),
      }).catch(() => {
        // offline - server copy reconciles on next sync
      });
    }
  },

  /** Merges server-side phrases into the local dictionary (offline-safe). */
  async syncPhrases(): Promise<void> {
    const userId = getUserId();
    if (!userId) return;
    try {
      const res = await fetch(`/api/suggestions/phrases?userId=${encodeURIComponent(userId)}`);
      if (!res.ok) return;
      const body = (await res.json()) as { phrases?: { id: string; text: string }[] };
      const seen = new Set(persisted.phrases.map((p) => p.text));
      let changed = false;
      for (const s of body.phrases ?? []) {
        if (!s?.text || seen.has(s.text)) continue;
        persisted.phrases.push({ id: s.id || uid(), text: s.text, ts: Date.now() });
        seen.add(s.text);
        changed = true;
      }
      if (persisted.phrases.length > MAX_PHRASES) persisted.phrases.length = MAX_PHRASES;
      if (changed) {
        savePersisted();
        notify();
      }
    } catch {
      // offline - local phrases still work
    }
  },

  /** Batches queued events to the server; failures stay queued for retry. */
  async flushOutbox(): Promise<void> {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (persisted.outbox.length === 0) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const batch = persisted.outbox.slice(0, 100);
    try {
      const res = await fetch("/api/suggestions/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          userId: getUserId(),
          events: batch.map((e) => ({ kind: e.kind, text: e.text, field: e.field })),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      persisted.outbox = persisted.outbox.slice(batch.length);
      savePersisted();
    } catch {
      // keep everything queued; retried on the next activity/visibility change
    }
  },
};

/* --------------------------------------------------------------------------
 *  Module helpers
 * ----------------------------------------------------------------------- */

function pushOutbox(kind: SuggestionEventKind, text: string, field?: string): void {
  persisted.outbox.push({ id: uid(), kind, text, field, ts: Date.now() });
  if (persisted.outbox.length > MAX_OUTBOX) {
    persisted.outbox = persisted.outbox.slice(-MAX_OUTBOX);
  }
  scheduleFlush();
}

function scheduleFlush(): void {
  if (!isBrowser() || flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void suggestionStore.flushOutbox();
  }, FLUSH_DELAY_MS);
}

function trimTelemetry(): void {
  const keys = Object.keys(persisted.telemetry);
  if (keys.length <= MAX_TELEMETRY) return;
  // Evict the least informative entries first (small accept+reject counts).
  keys.sort((a, b) => {
    const ta = persisted.telemetry[a];
    const tb = persisted.telemetry[b];
    return ta.a + ta.r - (tb.a + tb.r);
  });
  for (const k of keys.slice(0, keys.length - MAX_TELEMETRY)) {
    delete persisted.telemetry[k];
  }
}

function installLifecycleHooks(): void {
  if (lifecycleHooksInstalled || !isBrowser()) return;
  lifecycleHooksInstalled = true;
  window.addEventListener("online", () => {
    void suggestionStore.flushOutbox();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void suggestionStore.flushOutbox();
  });
  window.addEventListener("pagehide", () => {
    void suggestionStore.flushOutbox();
  });
}

