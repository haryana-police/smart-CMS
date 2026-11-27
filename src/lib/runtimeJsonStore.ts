import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";
import type { FIRCaseDiaryItem } from "@/types";

type CaseRegister = "complaints" | "firs";
const caseTables = { complaints: '"ComplaintRecord"', firs: '"FirRecord"' } as const;

/**
 * PostgreSQL jsonb cannot store the NUL escape (\u0000 → SQLSTATE 22P05,
 * DETAIL "\u0000 cannot be converted to text") nor unpaired surrogate escapes
 * (SQLSTATE 22P02). One poisoned string field must never crash an entire
 * runtime-store write, so strip NULs and replace unpaired surrogates with the
 * replacement character in every string value before serializing.
 */
function jsonSafeString(value: unknown, indent?: string | number): string {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item !== "string") return item;
    let text = item.replace(/\u0000/g, "");
    if (/[\uD800-\uDFFF]/.test(text)) {
      text = text.replace(
        /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
        "\uFFFD",
      );
    }
    return text;
  }, indent);
}

export async function readCaseRecords<T>(
  register: CaseRegister,
  file: string,
  db: Prisma.TransactionClient = prisma,
): Promise<T[]> {
  if (!usesPostgresStore()) return readRuntimeJson<T[]>(file);
  if (register === "firs") {
    const rows = await db.$queryRaw<{ payload: T }[]>`
      SELECT CASE WHEN jsonb_typeof(fir.payload->'caseDiaries') = 'array'
        THEN jsonb_set(fir.payload, '{caseDiaries}', COALESCE(diaries.notes, '[]'::jsonb))
        ELSE fir.payload END AS payload
      FROM "FirRecord" fir
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(note.payload ORDER BY note.position) AS notes
        FROM "FirCaseDiary" note WHERE note."firId" = fir.id
      ) diaries ON TRUE
      ORDER BY fir.position`;
    return rows.map(row => row.payload);
  }
  const rows = await db.$queryRawUnsafe<{ payload: T }[]>(
    `SELECT payload FROM ${caseTables[register]} ORDER BY position`,
  );
  return rows.map(row => row.payload);
}

export async function withCaseRecordTransaction<T>(
  register: CaseRegister,
  update: (db: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async db => {
    // Serialize number allocation and version checks across app instances.
    await db.$executeRawUnsafe(`LOCK TABLE ${caseTables[register]} IN SHARE ROW EXCLUSIVE MODE`);
    return update(db);
  }, { timeout: 15000 });
}

export async function writeCaseRecords(
  register: CaseRegister,
  file: string,
  records: { id: string; caseDiaries?: FIRCaseDiaryItem[] }[],
  db?: Prisma.TransactionClient,
  officerId?: string,
) {
  if (!db) return writeRuntimeJson(file, records);
  const table = caseTables[register];
  const payloads = register === "firs"
    ? records.map(record => Array.isArray(record.caseDiaries) ? { ...record, caseDiaries: [] } : record)
    : records;
  await db.$executeRawUnsafe(
    `INSERT INTO ${table} AS existing (id, position, payload)
     SELECT record->>'id', ordinal, record
     FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS entries(record, ordinal)
     ON CONFLICT (id) DO UPDATE SET position = EXCLUDED.position, payload = EXCLUDED.payload
     WHERE (existing.position, existing.payload) IS DISTINCT FROM (EXCLUDED.position, EXCLUDED.payload)`,
    jsonSafeString(payloads),
  );
  if (register !== "firs") return;
  const notes = jsonSafeString(records.flatMap(fir => (fir.caseDiaries || []).map(
    (note, index) => ({ firId: fir.id, id: note.id, position: index + 1, payload: note }),
  )));
  await db.$executeRaw`
    WITH incoming AS (
      SELECT * FROM jsonb_to_recordset(${notes}::jsonb) AS data("firId" text, id text, position bigint, payload jsonb)
    )
    INSERT INTO "FirCaseDiaryEvent" ("firId", "diaryId", "officerId", "action")
    SELECT COALESCE(incoming."firId", old."firId"), COALESCE(incoming.id, old.id), ${officerId ?? null},
      CASE WHEN incoming.id IS NULL THEN 'DELETE' WHEN old.id IS NULL THEN 'CREATE' ELSE 'UPDATE' END
    FROM incoming FULL JOIN "FirCaseDiary" old USING ("firId", id)
    WHERE incoming.payload IS DISTINCT FROM old.payload`;
  await db.$executeRaw`
    DELETE FROM "FirCaseDiary" old WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_to_recordset(${notes}::jsonb) AS data("firId" text, id text)
      WHERE data."firId" = old."firId" AND data.id = old.id
    )`;
  await db.$executeRaw`
    INSERT INTO "FirCaseDiary" AS old ("firId", id, position, payload)
    SELECT "firId", id, position, payload
    FROM jsonb_to_recordset(${notes}::jsonb) AS data("firId" text, id text, position bigint, payload jsonb)
    ON CONFLICT ("firId", id) DO UPDATE SET position = EXCLUDED.position, payload = EXCLUDED.payload
    WHERE (old.position, old.payload) IS DISTINCT FROM (EXCLUDED.position, EXCLUDED.payload)`;
}

function databaseKey(file: string) {
  const key = path.relative(path.join(process.cwd(), "prisma"), file);
  if (path.isAbsolute(key) || key === ".." || key.startsWith(".." + path.sep)) {
    throw new Error("Runtime JSON path must be inside the Prisma data directory.");
  }
  return key.split(path.sep).join("/");
}

export function usesPostgresStore() {
  return true;
}

export async function readRuntimeJson<T>(file: string, db: Prisma.TransactionClient = prisma): Promise<T> {
  if (!usesPostgresStore()) return JSON.parse(await fs.readFile(file, "utf8")) as T;
  const key = databaseKey(file);
  const [row] = await db.$queryRaw<{ payload: T }[]>`
    SELECT payload FROM "ImportedJsonDocument" WHERE path = ${key}
  `;
  if (!row) {
    throw Object.assign(new Error(`Runtime store missing: ${key}`), { code: "ENOENT" });
  }
  return row.payload;
}

export async function writeRuntimeJson(file: string, value: unknown) {
  const json = jsonSafeString(value, 2);
  if (usesPostgresStore()) {
    const key = databaseKey(file);
    await prisma.$executeRaw`
      INSERT INTO "ImportedJsonDocument" (path, payload) VALUES (${key}, ${json}::jsonb)
      ON CONFLICT (path) DO UPDATE SET payload = EXCLUDED.payload
    `;
    return;
  }
  const temp = file + "." + randomUUID() + ".tmp";
  try {
    await fs.writeFile(temp, json, { mode: 0o600 });
    await fs.rename(temp, file);
  } finally {
    await fs.unlink(temp).catch(() => {});
  }
}

export async function listRuntimeJson(directory: string, recursive = false): Promise<string[]> {
  if (!usesPostgresStore()) {
    const files = await fs.readdir(directory, { withFileTypes: true, recursive })
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return [];
        throw error;
      });
    return files.filter((file) => file.isFile() && file.name.endsWith(".json"))
      .map((file) => path.join(file.parentPath, file.name));
  }
  const prefix = databaseKey(directory) + "/";
  const rows = await prisma.$queryRaw<{ path: string }[]>`
    SELECT path FROM "ImportedJsonDocument" WHERE starts_with(path, ${prefix}) ORDER BY path
  `;
  return rows.filter((row) => recursive || !row.path.slice(prefix.length).includes("/"))
    .map((row) => path.join(process.cwd(), "prisma", row.path));
}

export async function removeRuntimeJson(file: string) {
  if (!usesPostgresStore()) {
    await fs.rm(file, { force: true });
    return;
  }
  await prisma.$executeRaw`DELETE FROM "ImportedJsonDocument" WHERE path = ${databaseKey(file)}`;
}
