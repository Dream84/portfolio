import type { Database } from "sql.js";
import { query } from "../db/database.ts";
import { requireSession } from "../auth/session.ts";

export type AccessResult = { ok: boolean; userId?: string; message?: string };

export function assertAccess(
  db: Database,
  token: string,
  ownerUserId: string,
  now = new Date(),
): AccessResult {
  const session = requireSession(db, token, now);
  if (!session.ok) return { ok: false, message: session.message };
  if (session.userId !== ownerUserId) return { ok: false, message: "无权访问该数据" };
  return { ok: true, userId: session.userId };
}

export function listAccountsOfUser(db: Database, userId: string): Array<Record<string, unknown>> {
  return query(db, "SELECT * FROM account WHERE user_id=?", [userId]);
}
