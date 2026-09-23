import { randomUUID } from "node:crypto";
import type { Database } from "sql.js";
import { query, run } from "../db/database.ts";
import { convertCash } from "./fxService.ts";
import { writeAudit } from "./auditService.ts";

export type SaveCashResult = { ok: boolean; id?: string; message?: string; cny?: number };

export function saveCashAccount(
  db: Database,
  input: {
    id?: string;
    accountId: string;
    name: string;
    currency: string;
    amount: number;
    rate?: number;
    rateTime?: string;
    overridden?: boolean;
    actor?: string;
  },
): SaveCashResult {
  if (!(Number(input.amount) >= 0)) return { ok: false, field: "amount", message: "请输入不小于 0 的金额" };
  const duplicated = query(db, "SELECT id FROM cash_account WHERE name=?", [input.name]);
  if (duplicated.length && duplicated[0].id !== input.id) {
    return { ok: false, field: "name", message: "现金账户名称已存在" };
  }
  const converted = convertCash(db, {
    currency: input.currency,
    amount: Number(input.amount),
    rate: input.rate,
    rateTime: input.rateTime,
    overridden: input.overridden,
  });
  const id = input.id ?? randomUUID();
  run(db, "DELETE FROM cash_account WHERE id=?", [id]);
  run(
    db,
    "INSERT INTO cash_account (id, account_id, name, currency, amount_original, fx_rate, fx_rate_time, fx_overridden) VALUES (?,?,?,?,?,?,?,?)",
    [id, input.accountId, input.name, input.currency, Number(input.amount), converted.rate, converted.rateTime, input.overridden ? 1 : 0],
  );
  writeAudit(db, {
    actor: input.actor ?? "system",
    action: "CASH_ACCOUNT_SAVE",
    target: id,
    after: { name: input.name, currency: input.currency, amount: input.amount, rate: converted.rate },
  });
  return { ok: true, id, cny: converted.cny };
}

export function listCashAccounts(db: Database): Array<Record<string, unknown>> {
  return query(db, "SELECT * FROM cash_account ORDER BY name");
}

export function cashTotalCny(db: Database): number {
  const rows = query(db, "SELECT amount_original, fx_rate FROM cash_account");
  return Math.round(rows.reduce((sum, row) => sum + Number(row.amount_original) * Number(row.fx_rate), 0) * 100) / 100;
}
