import { randomUUID } from "node:crypto";
import type { Database } from "sql.js";
import { query, run } from "../db/database.ts";

export function writeAudit(
  db: Database,
  input: { actor: string; action: string; target?: string; before?: unknown; after?: unknown },
  now = new Date(),
): void {
  run(db, "INSERT INTO audit (id, actor, action, target, before_value, after_value, created_at) VALUES (?,?,?,?,?,?,?)", [
    randomUUID(),
    input.actor,
    input.action,
    input.target ?? null,
    input.before === undefined ? null : JSON.stringify(input.before),
    input.after === undefined ? null : JSON.stringify(input.after),
    now.toISOString(),
  ]);
}

export function listAudit(db: Database, action?: string): Array<Record<string, unknown>> {
  const sql = action ? "SELECT * FROM audit WHERE action=? ORDER BY created_at" : "SELECT * FROM audit ORDER BY created_at";
  return action ? query(db, sql, [action]) : query(db, sql);
}

export function auditCount(db: Database, action?: string): number {
  return listAudit(db, action).length;
}
