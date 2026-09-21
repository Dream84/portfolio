import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { createDatabase } from "../db/database.ts";
import { addCategory, listCategories, removeCategory } from "../services/categoryService.ts";
import { saveHolding } from "../services/holdingService.ts";
import { seedAccounts, seedCategories } from "./fixtures.ts";

let db: Database;

beforeEach(async () => {
  db = await createDatabase();
  seedCategories(db);
  seedAccounts(db);
});

describe("任务 2 两级分类与分类管理", () => {
  it("AC-020 应新增自定义二级分类并把持仓归入该分类", () => {
    const added = addCategory(db, { key: "gold-accumulate", name: "黄金积存", level: "L2", parentKey: "gold" });
    expect(added.ok).toBe(true);

    const saved = saveHolding(db, {
      portfolioId: "family",
      accountId: "zhaoshang",
      symbol: "AU9999",
      name: "黄金9999",
      categoryKey: "gold-accumulate",
      quantity: 10,
      costPrice: 900,
    });
    expect(saved.ok).toBe(true);

    const category = listCategories(db).find((item) => item.key === "gold-accumulate");
    expect(category?.parentKey).toBe("gold");
  });

  it("AC-021 被引用分类删除应被拒绝并返回引用数量与逐字文案", () => {
    addCategory(db, { key: "gold-accumulate", name: "黄金积存", level: "L2", parentKey: "gold" });
    saveHolding(db, {
      portfolioId: "family",
      accountId: "zhaoshang",
      symbol: "AU9999",
      name: "黄金9999",
      categoryKey: "gold-accumulate",
      quantity: 10,
      costPrice: 900,
    });
    saveHolding(db, {
      portfolioId: "family",
      accountId: "tiantian",
      symbol: "AU9999",
      name: "黄金9999",
      categoryKey: "gold-accumulate",
      quantity: 5,
      costPrice: 910,
    });

    const result = removeCategory(db, "gold-accumulate");
    expect(result.ok).toBe(false);
    expect(result.refCount).toBe(2);
    expect(result.message).toBe("该分类被 2 条持仓引用，无法删除");
  });

  it("AC-061 二级子分类应归属唯一一级分类，且一级与二级筛选口径一致", () => {
    const categories = listCategories(db);
    const stockA = categories.find((item) => item.key === "stock-a");
    const fundBond = categories.find((item) => item.key === "fund-bond");
    expect(stockA?.parentKey).toBe("stock");
    expect(fundBond?.parentKey).toBe("fund");

    const parent = categories.find((item) => item.key === fundBond?.parentKey);
    expect(parent?.level).toBe("L1");
  });

  it("预设一级分类不可删除，仍含子分类的一级分类不可删除", () => {
    expect(removeCategory(db, "stock").ok).toBe(false);
    const created = addCategory(db, { key: "risk", name: "风险资产", level: "L1" });
    expect(created.ok).toBe(true);
    addCategory(db, { key: "risk-option", name: "期权", level: "L2", parentKey: "risk" });
    const result = removeCategory(db, "risk");
    expect(result.ok).toBe(false);
    expect(result.message).toBe("该一级分类下仍有 1 个子分类，无法删除");
  });
});
