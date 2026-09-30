import type { Database } from "sql.js";
import { query, run } from "../db/database.ts";
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

export const ACCOUNT_TYPES = ["BROKER", "BANK", "FUND_PLATFORM", "OTHER"] as const;
export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  BROKER: "券商",
  BANK: "银行",
  FUND_PLATFORM: "基金平台",
  OTHER: "其他",
};
export const ACCOUNT_EMPTY_MESSAGE = "暂无账户，请先新增账户";

export function listAccountsWithLabel(db: Database): {
  rows: Array<Record<string, unknown> & { typeLabel: string }>;
  emptyMessage: string | null;
} {
  const rows = query(db, "SELECT id, name, account_type, status FROM account ORDER BY name").map((row) => ({
    ...row,
    typeLabel: ACCOUNT_TYPE_LABELS[String(row.account_type)] ?? "其他",
  }));
  return { rows, emptyMessage: rows.length ? null : ACCOUNT_EMPTY_MESSAGE };
}

export function saveAccount(
  db: Database,
  input: { id?: string; name: string; accountType: string; status?: string; confirmDisable?: boolean },
): { ok: boolean; id?: string; message?: string; needConfirm?: boolean } {
  const name = input.name.trim();
  if (!name) return { ok: false, field: "name", message: "请输入账户名称" };
  if (!ACCOUNT_TYPES.includes(input.accountType as never)) {
    return { ok: false, field: "accountType", message: "账户类型无效" };
  }
  const status = input.status === "DISABLED" ? "DISABLED" : "ENABLED";
  const existing = input.id
    ? query(db, "SELECT status FROM account WHERE id=?", [input.id])
    : query(db, "SELECT status FROM account WHERE name=?", [name]);
  const previouslyEnabled = existing.length ? String(existing[0].status) === "ENABLED" : false;
  if (status === "DISABLED" && previouslyEnabled && !input.confirmDisable) {
    return { ok: false, needConfirm: true, message: "停用账户需二次确认" };
  }
  const id = input.id ?? `acc-${name}`;
  run(
    db,
    "INSERT INTO account (id, name, account_type, status) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, account_type=excluded.account_type, status=excluded.status",
    [id, name, input.accountType, status],
  );
  return { ok: true, id, message: "账户已保存" };
}