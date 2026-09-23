import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { createDatabase } from "../db/database.ts";
import { query } from "../db/database.ts";
import { deleteTrade, listTrades, saveTrade, undoDelete, updateTrade } from "../services/tradeService.ts";
import { transfer } from "../services/tradeService.ts";
import { saveCashAccount } from "../services/cashAccountService.ts";
import { seedAccounts } from "../seed.ts";

let db: Database;
let pid: string;
let cnyCash: string;

function cash(cashId: string): number {
  return Number(query(db, "SELECT amount_original FROM cash_account WHERE id=?", [cashId])[0].amount_original);
}

function holding(): { quantity: number; cost_price: number } {
  const rows = query(db, "SELECT quantity, cost_price FROM holding WHERE account_id='zhaoshang' AND symbol='SH600519'");
  if (!rows.length) return { quantity: 0, cost_price: 0 };
  return { quantity: Number(rows[0].quantity), cost_price: Number(rows[0].cost_price) };
}

beforeEach(async () => {
  db = await createDatabase();
  seedAccounts(db);
  pid = String(query(db, "SELECT id FROM portfolio LIMIT 1")[0].id);
  const created = saveCashAccount(db, { accountId: "zhaoshang", name: "批次B测试现金", currency: "CNY", amount: 50000 });
  cnyCash = created.id as string;
});

import { deleteTrade, undoDelete, updateTrade, listTrades } from "../services/tradeService.ts";

function buy() {
  return saveTrade(db, {
    portfolioId: pid,
    accountId: "zhaoshang",
    cashAccountId: cnyCash,
    symbol: "SH600519",
    name: "贵州茅台",
    tradeType: "BUY",
    tradeDate: "2026-09-18",
    amount: 0,
    quantity: 100,
    price: 400,
    fee: 5,
  });
}

describe("任务 11 流水编辑、删除与并发", () => {
  it("AC-038 版本号过期时拒绝并提示已被修改", () => {
    const created = buy();
    const ok = updateTrade(db, { id: created.id as string, version: 1, amount: 1 });
    expect(ok.ok).toBe(true);
    const stale = updateTrade(db, { id: created.id as string, version: 1, amount: 2 });
    expect(stale.ok).toBe(false);
    expect(stale.message).toContain("已被修改");
  });

  it("AC-039 删除后窗口内可撤销，现金与持仓完整还原", () => {
    const created = buy();
    const deleted = deleteTrade(db, { id: created.id as string });
    expect(deleted.ok).toBe(true);
    expect(cash(cnyCash)).toBe(50000);
    expect(holding().quantity).toBe(0);
    expect(listTrades(db, pid).some((row) => row.id === created.id)).toBe(false);
    const undone = undoDelete(db, created.id as string);
    expect(undone.ok).toBe(true);
    expect(cash(cnyCash)).toBe(9995);
    expect(holding().quantity).toBe(100);
  });

  it("AC-039 超过撤销窗口后拒绝撤销", () => {
    const created = buy();
    deleteTrade(db, { id: created.id as string });
    const late = new Date(Date.now() + 6 * 60 * 1000);
    const result = undoDelete(db, created.id as string, late);
    expect(result.ok).toBe(false);
    expect(result.message).toBe("撤销窗口已结束");
  });
});