import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { createDatabase } from "../db/database.ts";
import { listHoldings, saveHolding } from "../services/holdingService.ts";
import { seedAccounts, seedCategories } from "./fixtures.ts";

let db: Database;

beforeEach(async () => {
  db = await createDatabase();
  seedCategories(db);
  seedAccounts(db);
});

describe("任务 3 持仓录入与编辑", () => {
  it("AC-016 应保存持仓并支持成本手工覆盖标记", () => {
    const result = saveHolding(db, {
      portfolioId: "family",
      accountId: "zhaoshang",
      symbol: "600519",
      name: "贵州茅台",
      categoryKey: "stock-a",
      quantity: 100,
      costPrice: 1200,
      costOverridden: true,
    });
    expect(result.ok).toBe(true);
    const holdings = listHoldings(db, "family");
    expect(holdings).toHaveLength(1);
    expect(holdings[0].costOverridden).toBe(true);
  });

  it("AC-017 份额为负时应拒绝并返回字段与逐字文案", () => {
    const result = saveHolding(db, {
      portfolioId: "family",
      accountId: "zhaoshang",
      symbol: "600519",
      name: "贵州茅台",
      categoryKey: "stock-a",
      quantity: -5,
      costPrice: 1200,
    });
    expect(result.ok).toBe(false);
    expect(result.field).toBe("quantity");
    expect(result.message).toBe("请输入大于 0 的数字");
    expect(listHoldings(db, "family")).toHaveLength(0);
  });

  it("AC-019 同账户重复标的应拒绝保存", () => {
    saveHolding(db, {
      portfolioId: "family",
      accountId: "zhaoshang",
      symbol: "600519",
      name: "贵州茅台",
      categoryKey: "stock-a",
      quantity: 100,
      costPrice: 1200,
    });
    const result = saveHolding(db, {
      portfolioId: "family",
      accountId: "zhaoshang",
      symbol: "600519",
      name: "贵州茅台",
      categoryKey: "stock-a",
      quantity: 200,
      costPrice: 1100,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toBe("该账户已存在此标的持仓");
    expect(listHoldings(db, "family")).toHaveLength(1);
  });

  it("持仓必须归属二级子分类", () => {
    const result = saveHolding(db, {
      portfolioId: "family",
      accountId: "zhaoshang",
      symbol: "000001",
      name: "平安银行",
      categoryKey: "stock",
      quantity: 100,
      costPrice: 11,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toBe("持仓必须归属二级子分类");
  });
});
