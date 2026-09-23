import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { createDatabase } from "../db/database.ts";
import { login, logout, registerUser, requireSession } from "../auth/session.ts";
import { assertAccess } from "../services/accountService.ts";
import { seedAccounts } from "../seed.ts";

let db: Database;

beforeEach(async () => {
  db = await createDatabase();
  seedAccounts(db);
  registerUser(db, "admin", "Passw0rd123");
});

describe("任务 1 账号、会话与隔离", () => {
  it("AC-001 口令正确时建立会话，且口令不得明文存储", () => {
    const result = login(db, "admin", "Passw0rd123");
    expect(result.ok).toBe(true);
    expect(result.token).toBeTruthy();
    const stored = db.exec("SELECT password_hash FROM user")[0].values[0][0] as string;
    expect(stored).not.toContain("Passw0rd123");
  });

  it("AC-002 连续 5 次口令错误后账号锁定并返回解锁时间", () => {
    for (let i = 0; i < 5; i += 1) login(db, "admin", "wrong");
    const result = login(db, "admin", "wrong");
    expect(result.locked).toBe(true);
    expect(result.message).toContain("账号已锁定");
  });

  it("AC-003 / AC-004 会话过期或登出后不可再用", () => {
    const result = login(db, "admin", "Passw0rd123");
    logout(db, result.token as string);
    expect(requireSession(db, result.token as string).ok).toBe(false);
    const second = login(db, "admin", "Passw0rd123");
    const future = new Date(Date.now() + 13 * 3600 * 1000);
    expect(requireSession(db, second.token as string, future).ok).toBe(false);
  });

  it("AC-005 / AC-006 跨账号访问被拒绝并返回无权访问", () => {
    const owner = login(db, "admin", "Passw0rd123");
    registerUser(db, "member", "Passw0rd456");
    const other = login(db, "member", "Passw0rd456");
    const denied = assertAccess(db, other.token as string, owner.userId as string);
    expect(denied.ok).toBe(false);
    expect(denied.message).toBe("无权访问该数据");
    expect(assertAccess(db, owner.token as string, owner.userId as string).ok).toBe(true);
  });
});
