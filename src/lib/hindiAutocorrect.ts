/**
 * Hindi auto-correct matcher (pure, DOM-free - unit-testable).
 * -------------------------------------------------------------
 * The DOM plumbing lives in useHindiReportAutocorrect; everything that only
 * needs strings and code points belongs here:
 *
 * - normalizeHindi(): collapses Unicode spelling variants (nukta pairs and
 *   candrabindu/anusvara) for DICTIONARY LOOKUP ONLY. Officer text is never
 *   rewritten with the normalized form.
 * - lookupHindiCorrection(): decides silent vs suggested vs none for a word.
 * - Character-class helpers shared by the hook (word chars, boundary chars,
 *   quote quarantine).
 */

import { HINDI_CORRECTIONS } from "./hindiAutocorrectData";

/**
 * Devanagari block characters that may legally form a single word:
 * letters, matras, anusvara/candrabindu, nukta forms, plus ZWJ/ZWNJ.
 * Dandas (U+0964/U+0965) are deliberately excluded - they end words.
 */
export const HINDI_WORD_CHAR_RE = /^[\u0900-\u0963\u0971-\u097F\u200C\u200D]+$/u;

/**
 * Characters that legally end a word in Hindi reports: whitespace, dandas,
 * sentence punctuation and the separators an officer may type right after a
 * word (hyphen, slash, closing brackets).
 */
export const HINDI_BOUNDARY_CHAR_RE = /^[ \u00A0\u0964\u0965,.!?;:\-/)\]}]$/u;

/**
 * Unicode variant collapsing used ONLY for dictionary matching.
 * - NFD splits precomposed nukta letters, the nukta mark is dropped
 *   (क/ज/फ/ड/ढ with nukta match their plain forms).
 * - Candrabindu (ँ) collapses to anusvara (ं) - the two are interchangeable
 *   typos of each other in fast typing.
 * - NFC at the end keeps the result comparable to composed dictionary keys.
 */
export function normalizeHindi(word: string): string {
  return word
    .normalize("NFD")
    .replace(/\u093C/g, "")
    .replace(/\u0901/g, "\u0902")
    .normalize("NFC");
}

export type HindiCorrectionLevel = "silent" | "suggested";

export interface HindiCorrection {
  level: HindiCorrectionLevel;
  replacement: string;
}

const silentMap = new Map<string, string>();
const suggestedMap = new Map<string, string>();
for (const entry of HINDI_CORRECTIONS) {
  if (entry.level === "off" || entry.wrong === entry.right) continue;
  const key = normalizeHindi(entry.wrong);
  if (!key) continue;
  const target = entry.level === "silent" ? silentMap : suggestedMap;
  if (!target.has(key)) target.set(key, entry.right);
}

/**
 * Per-officer learning state, fed from the suggestion store (Phase 2).
 * - `promoted`: corrections the officer accepted repeatedly become personal
 *   silent entries and outrank the shared dictionary.
 * - `suppressed`: corrections the officer rejected repeatedly stop appearing.
 */
export interface HindiCorrectionBias {
  promoted: Record<string, string>;
  suppressed: Record<string, boolean>;
}

/**
 * Resolves a completed word against the dictionary + the officer's personal
 * bias.
 * Returns null when nothing should happen - including when the officer typed
 * the corrected form itself (the lookup must never rewrite a word into
 * itself just because a variant key collides).
 */
export function lookupHindiCorrection(word: string, bias?: HindiCorrectionBias): HindiCorrection | null {
  if (!word) return null;
  const key = normalizeHindi(word);
  if (!key) return null;
  if (bias?.suppressed?.[key]) return null;
  const promoted = bias?.promoted?.[key];
  if (promoted && promoted !== word) {
    return { level: "silent", replacement: promoted };
  }
  const replacement = silentMap.get(key) ?? suggestedMap.get(key);
  if (!replacement || replacement === word) return null;
  return { level: silentMap.has(key) ? "silent" : "suggested", replacement };
}

/** True when live text continues right after the completed word (mid-sentence insert). */
export function isFollowedByWordChar(textAfter: string): boolean {
  return /^[\p{L}\p{M}\p{N}]/u.test(textAfter);
}

/** True when the word is glued to a preceding letter (not a word start). */
export function isPrecededByWordChar(textBefore: string): boolean {
  return /[\p{L}\p{M}\p{N}\u200C\u200D]$/u.test(textBefore);
}

/**
 * True when the surrounding block contains quotation marks - quoted speech
 * (witness statements etc.) is treated as verbatim even when it is not marked
 * with the verbatim protection, so autocorrect stays out of it entirely.
 */
export function blockContainsQuote(blockText: string): boolean {
  return /["'\u201C\u201D\u2018\u2019\u00AB\u00BB\u300C\u300D]/u.test(blockText);
}

/** True when `b` can be reached from `a` with exactly one insertion/deletion/substitution. */
export function isOneEditAway(a: string, b: string): boolean {
  if (a === b) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; // deletion from a
    else if (a.length < b.length) j++; // insertion into a
    else {
      i++; // substitution
      j++;
    }
  }
  if (i < a.length || j < b.length) edits++;
  return edits === 1;
}

const DEVANAGARI_RUN_RE = /[\u0900-\u0963\u0971-\u097F\u200C\u200D]/;

export interface HindiCorpusEntry {
  word: string;
  count: number;
}

export interface HindiCorpusOptions {
  /** Minimum length for the typed word AND the candidate (noise guard). */
  minLength?: number;
  /** Candidate must appear at least this often in the officer's corpus. */
  minCount?: number;
}

/**
 * Gboard-style "did you mean" powered by the officer's own document corpus
 * (Phase 3): the typed Devanagari word is not in the dictionary, but a word
 * that is one edit away occurs noticeably more often in their case files.
 *
 * The result is ALWAYS a suggestion - never a silent replacement - because a
 * fuzzy correction on a legal document must be confirmed by the officer.
 */
export function suggestHindiFromCorpus(
  word: string,
  corpus: HindiCorpusEntry[],
  options: HindiCorpusOptions = {}
): HindiCorrection | null {
  const minLength = options.minLength ?? 4;
  const minCount = options.minCount ?? 2;
  if (!word || word.length < minLength || !DEVANAGARI_RUN_RE.test(word)) return null;
  const key = normalizeHindi(word);
  if (!key) return null;
  const typedCount = corpus.find((c) => normalizeHindi(c.word) === key)?.count ?? 0;
  let best: HindiCorpusEntry | null = null;
  for (const candidate of corpus) {
    if (!candidate.word || candidate.count < minCount) continue;
    if (candidate.word.length < minLength || !DEVANAGARI_RUN_RE.test(candidate.word)) continue;
    const candidateKey = normalizeHindi(candidate.word);
    if (!candidateKey || candidateKey === key) continue;
    if (candidate.count <= typedCount) continue;
    if (!isOneEditAway(key, candidateKey)) continue;
    if (!best || candidate.count > best.count) best = candidate;
  }
  if (!best) return null;
  return { level: "suggested", replacement: best.word };
}

/** Exposed for tests / tooling. */
export const __hindiAutocorrectTesting = {
  silentMap,
  suggestedMap,
  HINDI_CORRECTIONS,
};
