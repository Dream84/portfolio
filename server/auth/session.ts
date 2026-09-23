import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type { Database } from "sql.js";
import { query, run } from "../db/database.ts";

export const SESSION_HOURS = 12;
export const IDLE_HOURS = 2;
export const MAX_FAILED = 5;
export const LOCK_MINUTES = 5;

export function hashPassword(password: string, salt?: string): string {
  const useSalt = salt ?? randomBytes(16).toString("hex");
  const hash = scryptSync(password, useSalt, 32).toString("hex");
  return `${useSalt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  const candidate = scryptSync(password, salt, 32);
  return timingSafeEqual(Buffer.from(hash, "hex"), candidate);
}

export function registerUser(db: Database, accountName: string, password: string): { ok: boolean; id?: string; message?: string } {
  const exists = query(db, "SELECT id FROM user WHERE account_name=?", [accountName]);
  if (exists.length) return { ok: false, message: "账号名已存在" };
  if (accountName.length < 3 || accountName.length > 32) return { ok: false, message: "账号名需 3 至 32 位" };
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return { ok: false, message: "口令需不少于 8 位且包含字母与数字" };
  }
  const id = randomUUID();
  run(db, "INSERT INTO user (id, account_name, password_hash, status, failed_count) VALUES (?,?,?,'ACTIVE',0)", [
    id,
    accountName,
    hashPassword(password),
  ]);
  return { ok: true, id };
}

export function login(
  db: Database,
  accountName: string,
  password: string,
  now = new Date(),
): { ok: boolean; token?: string; userId?: string; locked?: boolean; message?: string; remaining?: number } {
  const rows = query(db, "SELECT * FROM user WHERE account_name=?", [accountName]);
  if (!rows.length) return { ok: false, message: "账号或口令不正确", remaining: MAX_FAILED };
  const user = rows[0];
  const lockedUntil = user.locked_until ? String(user.locked_until) : "";
  if (lockedUntil && new Date(lockedUntil) > now) {
    return { ok: false, locked: true, message: `账号已锁定，解锁时间 ${lockedUntil}` };
  }
  if (!verifyPassword(password, String(user.password_hash))) {
    const failed = Number(user.failed_count) + 1;
    if (failed >= MAX_FAILED) {
      const unlock = new Date(now.getTime() + LOCK_MINUTES * 60 * 1000).toISOString();
      run(db, "UPDATE user SET status='LOCKED', failed_count=?, locked_until=? WHERE id=?", [failed, unlock, user.id]);
      return { ok: false, locked: true, message: `账号已锁定，解锁时间 ${unlock}` };
    }
    run(db, "UPDATE user SET failed_count=? WHERE id=?", [failed, user.id]);
    return { ok: false, message: "账号或口令不正确", remaining: MAX_FAILED - failed };
  }
  run(db, "UPDATE user SET status='ACTIVE', failed_count=0, locked_until=NULL WHERE id=?", [user.id]);
  const token = randomUUID();
  const expires = new Date(now.getTime() + SESSION_HOURS * 3600 * 1000).toISOString();
  run(db, "INSERT INTO session (token, user_id, created_at, last_active_at, expires_at) VALUES (?,?,?,?,?)", [
    token,
    user.id,
    now.toISOString(),
    now.toISOString(),
    expires,
  ]);
  return { ok: true, token, userId: String(user.id) };
}

export function requireSession(
  db: Database,
  token: string,
  now = new Date(),
): { ok: boolean; userId?: string; message?: string } {
  const rows = query(db, "SELECT * FROM session WHERE token=?", [token]);
  if (!rows.length) return { ok: false, message: "会话已过期，请重新登录" };
  const row = rows[0];
  const expiresAt = new Date(String(row.expires_at));
  const lastActive = new Date(String(row.last_active_at));
  const idleMs = now.getTime() - lastActive.getTime();
  if (expiresAt <= now || idleMs > IDLE_HOURS * 3600 * 1000) {
    run(db, "DELETE FROM session WHERE token=?", [token]);
    return { ok: false, message: "会话已过期，请重新登录" };
  }
  run(db, "UPDATE session SET last_active_at=? WHERE token=?", [now.toISOString(), token]);
  return { ok: true, userId: String(row.user_id) };
}

export function logout(db: Database, token: string): void {
  run(db, "DELETE FROM session WHERE token=?", [token]);
}
