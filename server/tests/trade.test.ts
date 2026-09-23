import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { createDatabase } from "../db/database.ts";
import { query, run } from "../db/database.ts";
import { saveCashAccount } from "../services/cashAccountService.ts";
import { saveTrade } from "../services/tradeService.ts";
import { seedAccounts } from "../seed.ts";

let db: Database;
let pid: string;
let cnyCash: string;

function cash(cashId: string): number {
  return Number(query(db, "SELECT amount_original FROM cash_account WHERE id=?", [cashId])[0].amount_original);
}

function holding(): { quantity: number; cost_price: number } {
  const rows = query(db, "SELECT quantity, cost_price FROM holding WHERE account_id='zhaoshang' AND symbol='SH600519'");
  return { quantity: Number(rows[0].quantity), cost_price: Number(rows[0].cost_price) };
}

beforeEach(async () => {
  db = await createDatabase();
  seedAccounts(db);
  pid = String(query(db, "SELECT id FROM portfolio LIMIT 1")[0].id);
  const created = saveCashAccount(db, { accountId: "zhaoshang", name: "批次B测试现金", currency: "CNY", amount: 50000 });
  cnyCash = created.id as string;
});

function buy(extra: Record<string, unknown> = {}) {
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
    feeMode: "INTO_COST",
    ...extra,
  } as never);
}

describe("任务 8 买入、卖出与成本结转", () => {
  it("AC-028 买入后现金与持仓同步更新，手续费计入成本", () => {
    const result = buy();
    expect(result.ok).toBe(true);
    expect(cash(cnyCash)).toBe(9995);
    const position = holding();
    expect(position.quantity).toBe(100);
    expect(position.cost_price).toBeCloseTo(400.05, 4);
  });

  it("AC-029 现金不足时整笔拒绝且现金与持仓不变", () => {
    const result = buy({ quantity: 1000 });
    expect(result.ok).toBe(false);
    expect(result.message).toBe("现金账户余额不足");
    expect(cash(cnyCash)).toBe(50000);
    expect(query(db, "SELECT * FROM holding WHERE symbol='SH600519'").length).toBe(0);
  });

  it("AC-030 卖出后剩余份额与已实现收益正确", () => {
    buy();
    const result = saveTrade(db, {
      portfolioId: pid,
      accountId: "zhaoshang",
      cashAccountId: cnyCash,
      symbol: "SH600519",
      name: "贵州茅台",
      tradeType: "SELL",
      tradeDate: "2026-09-19",
      amount: 0,
      quantity: 40,
      price: 500,
      fee: 2,
    });
    expect(result.ok).toBe(true);
    expect(result.realizedPnl).toBeCloseTo(3996, 2);
    expect(holding().quantity).toBe(60);
    expect(cash(cnyCash)).toBeCloseTo(29993, 2);
  });

  it("AC-031 卖出份额超过持仓时拒绝并给出提示", () => {
    buy();
    const result = saveTrade(db, {
      portfolioId: pid,
      accountId: "zhaoshang",
      cashAccountId: cnyCash,
      symbol: "SH600519",
      tradeType: "SELL",
      tradeDate: "2026-09-19",
      amount: 0,
      quantity: 1000,
      price: 500,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toBe("卖出份额超过可用份额");
  });

  it("AC-027 成交日期晚于当前日期时拒绝", () => {
    const result = buy({ tradeDate: "2099-01-01" });
    expect(result.ok).toBe(false);
    expect(result.message).toBe("成交日期不得晚于当前日期");
  });
});
