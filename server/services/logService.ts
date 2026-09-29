import { randomUUID } from "node:crypto";
import type { Database } from "sql.js";
import { query, run } from "../db/database.ts";

export function writeFetchLog(
  db: Database,
  input: { level: "INFO" | "ERROR"; symbol?: string; message: string },
  now = new Date(),
): void {
  run(db, "INSERT INTO fetch_log (id, level, symbol, message, created_at) VALUES (?,?,?,?,?)", [
    randomUUID(),
    input.level,
    input.symbol ?? null,
    input.message,
    now.toISOString(),
  ]);
}

export function listFetchLogs(db: Database, level?: string): Array<Record<string, unknown>> {
  return level
    ? query(db, "SELECT * FROM fetch_log WHERE level=? ORDER BY created_at", [level])
    : query(db, "SELECT * FROM fetch_log ORDER BY created_at");
}
