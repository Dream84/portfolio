import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { createDatabase } from "../db/database.ts";
import { listBackups, pruneBackups, runBackup } from "../services/backupService.ts";
import { auditCount } from "../services/auditService.ts";
import { seedAccounts } from "../seed.ts";

let db: Database;
let dir: string;

beforeEach(async () => {
  db = await createDatabase();
  seedAccounts(db);
  dir = path.join(os.tmpdir(), `myportfolio-backup-${Date.now()}`);
});

describe("任务 5 备份恢复与审计", () => {
  it("AC-013 自动备份生成文件并写入审计", () => {
    const result = runBackup(db, dir);
    expect(result.ok).toBe(true);
    expect(fs.existsSync(result.filePath as string)).toBe(true);
    expect(listBackups(db)).toHaveLength(1);
    expect(auditCount(db, "BACKUP")).toBe(1);
  });

  it("AC-014 超过保留期的备份被清理", () => {
    runBackup(db, dir);
    const later = new Date(Date.now() + 8 * 86400000);
    const removed = pruneBackups(db, dir, later);
    expect(removed).toHaveLength(1);
    expect(listBackups(db)).toHaveLength(0);
  });
});
