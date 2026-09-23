import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Database } from "sql.js";
import { query, run } from "../db/database.ts";
import { writeAudit } from "./auditService.ts";

export const RETENTION_DAYS = 7;

export function runBackup(db: Database, dir: string, now = new Date()): { ok: boolean; filePath?: string; message?: string } {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const stamp = now.toISOString().slice(0, 10).replace(/-/g, "");
    const filePath = path.join(dir, `backup-${stamp}-${randomUUID().slice(0, 8)}.sqlite`);
    fs.writeFileSync(filePath, Buffer.from(db.export()));
    run(db, "INSERT INTO backup (id, file_path, created_at) VALUES (?,?,?)", [randomUUID(), filePath, now.toISOString()]);
    writeAudit(db, { actor: "system", action: "BACKUP", target: filePath }, now);
    pruneBackups(db, dir, now);
    return { ok: true, filePath };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export function pruneBackups(db: Database, dir: string, now = new Date()): string[] {
  const removed: string[] = [];
  for (const row of query(db, "SELECT * FROM backup")) {
    const createdAt = new Date(String(row.created_at));
    const ageDays = (now.getTime() - createdAt.getTime()) / 86400000;
    if (ageDays > RETENTION_DAYS) {
      try {
        fs.rmSync(String(row.file_path), { force: true });
      } catch {
        // 文件已不存在时忽略
      }
      run(db, "DELETE FROM backup WHERE id=?", [row.id]);
      removed.push(String(row.file_path));
    }
  }
  return removed;
}

export function listBackups(db: Database): Array<Record<string, unknown>> {
  return query(db, "SELECT * FROM backup ORDER BY created_at");
}
