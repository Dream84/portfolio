import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { createDatabase } from "../db/database.ts";
import { query, run } from "../db/database.ts";
import { saveCashAccount } from "../services/cashAccountService.ts";
import { saveTrade, transfer } from "../services/tradeService.ts";
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

describe("任务 10 收支与转账", () => {
  it("AC-034 工资收入后现金增加", () => {
    const result = saveTrade(db, {
      portfolioId: pid,
      accountId: "zhaoshang",
      cashAccountId: cnyCash,
      tradeType: "INCOME",
      tradeDate: "2026-09-20",
      amount: 8000,
    });
    expect(result.ok).toBe(true);
    expect(cash(cnyCash)).toBe(58000);
  });

  it("AC-035 金额为 0 时拒绝并返回逐字文案", () => {
    const result = saveTrade(db, {
      portfolioId: pid,
      accountId: "zhaoshang",
      cashAccountId: cnyCash,
      tradeType: "INCOME",
      tradeDate: "2026-09-20",
      amount: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toBe("请输入大于 0 的金额");
  });

  it("AC-036 转账生成两条关联流水且两边余额同步", () => {
    const target = saveCashAccount(db, { accountId: "zhaoshang", name: "批次B转入账户", currency: "CNY", amount: 100 });
    const result = transfer(db, {
      portfolioId: pid,
      accountId: "zhaoshang",
      fromCashAccountId: cnyCash,
      toCashAccountId: target.id as string,
      amount: 1000,
      tradeDate: "2026-09-20",
    });
    expect(result.ok).toBe(true);
    expect(result.records).toHaveLength(2);
    expect(cash(cnyCash)).toBe(49000);
    expect(cash(target.id as string)).toBe(1100);
  });

  it("AC-037 转账金额超过可用余额时拒绝", () => {
    const target = saveCashAccount(db, { accountId: "zhaoshang", name: "批次B不足账户", currency: "CNY", amount: 0 });
    const result = transfer(db, {
      portfolioId: pid,
      accountId: "zhaoshang",
      fromCashAccountId: cnyCash,
      toCashAccountId: target.id as string,
      amount: 999999,
      tradeDate: "2026-09-20",
    });
    expect(result.ok).toBe(false);
    expect(result.message).toBe("转账金额超过可用余额");
  });

  it("AC-037 转出与转入为同一账户时拒绝", () => {
    const result = transfer(db, {
      portfolioId: pid,
      accountId: "zhaoshang",
      fromCashAccountId: cnyCash,
      toCashAccountId: cnyCash,
      amount: 100,
      tradeDate: "2026-09-20",
    });
    expect(result.ok).toBe(false);
    expect(result.message).toBe("转出与转入账户不能相同");
  });
});
