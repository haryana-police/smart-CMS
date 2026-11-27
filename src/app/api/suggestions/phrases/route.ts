import path from "node:path";
import { readRuntimeJson, writeRuntimeJson } from "@/lib/runtimeJsonStore";
import { apiAccess } from "@/lib/apiSecurity";
import { NextResponse } from "next/server";

/**
 * Officer personal-dictionary endpoint (GD-04 fix).
 * The AutoSuggest star-to-dictionary flow (`src/lib/suggestionStore.ts`) syncs
 * saved phrases here so an officer's dictionary follows them across devices:
 * - GET    ?userId=… → { phrases: [{ id, text }] }
 * - POST   { text }  → add (idempotent by text)
 * - DELETE { text }  → remove
 *
 * The signed-in session user is always authoritative for the dictionary key
 * (body/query userId is only a compatibility fallback). Storage follows the
 * established runtime-JSON pattern (ImportedJsonDocument jsonb table) — no
 * Prisma migration required. Each officer's list is capped.
 */
const MAX_PHRASES_PER_USER = 200;

interface PhraseEntry {
  id: string;
  text: string;
  ts: number;
}

interface PhraseStore {
  users: Record<string, PhraseEntry[]>;
}

const EMPTY_STORE = (): PhraseStore => ({ users: {} });

function phrasesPath(): string {
  // runtimeJsonStore resolves paths relative to the prisma data directory.
  return path.join(process.cwd(), "prisma", "suggestion-phrases.json");
}

async function readStore(): Promise<PhraseStore> {
  try {
    const store = await readRuntimeJson<PhraseStore>(phrasesPath());
    if (store && store.users && typeof store.users === "object") return store;
    return EMPTY_STORE();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return EMPTY_STORE();
    throw error;
  }
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 200) : "";
}

function listFor(store: PhraseStore, officerId: string): PhraseEntry[] {
  return store.users[officerId] || (store.users[officerId] = []);
}

export async function GET(req: Request) {
  const apiUser = await apiAccess(req);
  if (apiUser instanceof Response) return apiUser;
  try {
    const { searchParams } = new URL(req.url);
    const officerId = apiUser.id || searchParams.get("userId") || "";
    if (!officerId) return NextResponse.json({ success: true, phrases: [] });
    const store = await readStore();
    return NextResponse.json({ success: true, phrases: listFor(store, officerId) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to read saved phrases.";
    console.error("Error in /api/suggestions/phrases GET:", err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const apiUser = await apiAccess(req);
  if (apiUser instanceof Response) return apiUser;
  try {
    const body = await req.json();
    const text = normalizeText(body?.text);
    if (!text) return NextResponse.json({ success: false, error: "Phrase text required." }, { status: 400 });

    const officerId = apiUser.id || body?.userId || "";
    if (!officerId) return NextResponse.json({ success: false, error: "Officer identity missing." }, { status: 400 });

    const store = await readStore();
    const phrases = listFor(store, officerId);
    if (!phrases.some((p) => p.text === text)) {
      phrases.unshift({ id: `phr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, text, ts: Date.now() });
      if (phrases.length > MAX_PHRASES_PER_USER) phrases.length = MAX_PHRASES_PER_USER;
      await writeRuntimeJson(phrasesPath(), store);
    }
    return NextResponse.json({ success: true, phrases });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to save phrase.";
    console.error("Error in /api/suggestions/phrases POST:", err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const apiUser = await apiAccess(req);
  if (apiUser instanceof Response) return apiUser;
  try {
    const body = await req.json();
    const text = normalizeText(body?.text);
    const officerId = apiUser.id || body?.userId || "";
    if (!officerId) return NextResponse.json({ success: false, error: "Officer identity missing." }, { status: 400 });

    const store = await readStore();
    const phrases = listFor(store, officerId);
    const index = phrases.findIndex((p) => p.text === text);
    if (index !== -1) {
      phrases.splice(index, 1);
      await writeRuntimeJson(phrasesPath(), store);
    }
    return NextResponse.json({ success: true, phrases });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to remove phrase.";
    console.error("Error in /api/suggestions/phrases DELETE:", err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
