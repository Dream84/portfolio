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

function initHolding() {
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
  });
}

describe("任务 9 分红与手续费口径", () => {
  it("AC-032 现金分红后现金增加且份额不变", () => {
    initHolding();
    const result = saveTrade(db, {
      portfolioId: pid,
      accountId: "zhaoshang",
      cashAccountId: cnyCash,
      symbol: "SH600519",
      tradeType: "DIVIDEND_CASH",
      tradeDate: "2026-09-20",
      amount: 200,
    });
    expect(result.ok).toBe(true);
    expect(cash(cnyCash)).toBeCloseTo(10195, 2);
    expect(holding().quantity).toBe(100);
  });

  it("AC-033 红利再投缺少折算价格时拒绝且份额不变", () => {
    initHolding();
    const result = saveTrade(db, {
      portfolioId: pid,
      accountId: "zhaoshang",
      symbol: "SH600519",
      tradeType: "DIVIDEND_REINVEST",
      tradeDate: "2026-09-20",
      amount: 100,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toBe("请填写大于 0 的折算价格");
    expect(holding().quantity).toBe(100);
  });

  it("AC-033 红利再投成功后增加份额并摊薄成本", () => {
    initHolding();
    const result = saveTrade(db, {
      portfolioId: pid,
      accountId: "zhaoshang",
      symbol: "SH600519",
      tradeType: "DIVIDEND_REINVEST",
      tradeDate: "2026-09-20",
      amount: 100,
      price: 20,
    });
    expect(result.ok).toBe(true);
    const position = holding();
    expect(position.quantity).toBe(105);
    expect(position.cost_price).toBeCloseTo((100 * 400.05 + 100) / 105, 4);
  });

  it("AC-040 手续费选择冲减收益时不计入单位成本", () => {
    const result = saveTrade(db, {
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
      feeMode: "OFFSET_PNL",
    });
    expect(result.ok).toBe(true);
    expect(holding().cost_price).toBeCloseTo(400, 4);
  });
});
