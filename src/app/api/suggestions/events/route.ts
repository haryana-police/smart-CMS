import path from "node:path";
import { readRuntimeJson, writeRuntimeJson } from "@/lib/runtimeJsonStore";
import { apiAccess } from "@/lib/apiSecurity";
import { NextResponse } from "next/server";

/**
 * Suggestion telemetry endpoint (GD-04 fix).
 * The client outbox (`src/lib/suggestionStore.ts`) batches accept/reject/
 * dismiss/save/remove events here for station-wide analytics. Previously this
 * route did not exist, so every flush was a silent 404 and queued events were
 * dropped once the outbox cap was hit.
 *
 * Storage follows the established runtime-JSON pattern (ImportedJsonDocument
 * jsonb table via runtimeJsonStore) — no Prisma migration required. The store
 * is capped; the oldest events roll off first.
 */
const MAX_EVENTS = 5000;
const MAX_BATCH = 100;
const ALLOWED_KINDS = new Set(["accept", "reject", "dismiss", "save", "remove"]);

interface StoredSuggestionEvent {
  id: string;
  officerId: string;
  kind: string;
  text: string;
  field?: string;
  ts: string;
}

interface IncomingSuggestionEvent {
  kind: string;
  text: string;
  field?: string;
}

interface TelemetryStore {
  events: StoredSuggestionEvent[];
}

const EMPTY_STORE = (): TelemetryStore => ({ events: [] });

function telemetryPath(): string {
  // runtimeJsonStore resolves paths relative to the prisma data directory.
  return path.join(process.cwd(), "prisma", "suggestion-telemetry.json");
}

async function readTelemetry(): Promise<TelemetryStore> {
  try {
    const store = await readRuntimeJson<TelemetryStore>(telemetryPath());
    if (store && Array.isArray(store.events)) return store;
    return EMPTY_STORE();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return EMPTY_STORE();
    throw error;
  }
}

function isValidEvent(event: unknown): event is IncomingSuggestionEvent {
  if (!event || typeof event !== "object") return false;
  const record = event as { kind?: unknown; text?: unknown; field?: unknown };
  return (
    typeof record.kind === "string" &&
    ALLOWED_KINDS.has(record.kind) &&
    typeof record.text === "string" &&
    record.text.length <= 400 &&
    (record.field === undefined || typeof record.field === "string")
  );
}

export async function POST(req: Request) {
  const apiUser = await apiAccess(req);
  if (apiUser instanceof Response) return apiUser;
  try {
    const body = await req.json();
    const incoming: unknown[] = Array.isArray(body?.events) ? body.events : [];
    const accepted = incoming.slice(0, MAX_BATCH).filter(isValidEvent).map(
      (event, index): StoredSuggestionEvent => ({
        id: `sgv_${Date.now().toString(36)}_${index}_${Math.random().toString(36).slice(2, 7)}`,
        officerId: String(body?.userId || apiUser.id || ""),
        kind: event.kind,
        text: event.text,
        field: typeof event.field === "string" ? event.field : undefined,
        ts: new Date().toISOString(),
      }),
    );

    if (accepted.length === 0) {
      return NextResponse.json({ success: false, error: "No valid events provided." }, { status: 400 });
    }

    const store = await readTelemetry();
    store.events.push(...accepted);
    if (store.events.length > MAX_EVENTS) {
      store.events = store.events.slice(store.events.length - MAX_EVENTS);
    }
    await writeRuntimeJson(telemetryPath(), store);

    return NextResponse.json({ success: true, stored: accepted.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to record suggestion events.";
    console.error("Error in /api/suggestions/events:", err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const apiUser = await apiAccess(req);
  if (apiUser instanceof Response) return apiUser;
  // Lightweight health/count endpoint so dashboards can confirm telemetry flow.
  try {
    const store = await readTelemetry();
    return NextResponse.json({ success: true, count: store.events.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to read suggestion telemetry.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
