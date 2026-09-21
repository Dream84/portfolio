import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { createDatabase } from "../db/database.ts";
import { buildBreakdown, buildSummary, cashValueCny } from "../services/valuationService.ts";
import { seedAll } from "./fixtures.ts";

let db: Database;

beforeEach(async () => {
  db = await createDatabase();
  seedAll(db);
});

describe("任务 4 估值与占比", () => {
  it("AC-022 资产总额应为持仓市值加现金折合金额，占比合计为 100.00%", () => {
    const summary = buildSummary(db, "family");
    expect(summary.totalValue).toBeCloseTo(220057.2, 2);
    expect(summary.shareTotal).toBeCloseTo(100, 2);
    expect(cashValueCny(db, "family")).toBeCloseTo(28391.2, 2);
  });

  it("INV-1 资产总额等于各一级分类金额之和", () => {
    const summary = buildSummary(db, "family");
    const shareSum = summary.shares.reduce((sum, item) => sum + item.value, 0);
    expect(Number(shareSum.toFixed(2))).toBeCloseTo(summary.totalValue, 2);
  });

  it("AC-023 使用缓存数据时应标记降级并返回数据时间", () => {
    const summary = buildSummary(db, "family");
    expect(summary.stale).toBe(true);
    expect(summary.staleCount).toBe(1);
    expect(summary.dataTime).toBe("2026-09-18 15:00");
  });

  it("AC-024 占比只按一级分类汇总，不出现二级分类", () => {
    const summary = buildSummary(db, "family");
    const keys = summary.shares.map((item) => item.key);
    expect(keys.sort()).toEqual(["cash", "fund", "gold", "stock"]);
    expect(keys).not.toContain("fund-bond");
  });

  it("AC-063 子项占一级分类比合计为 100.00%，一级总收益等于子项合计", () => {
    const rows = buildBreakdown(db, "family");
    const fund = rows.find((item) => item.key === "fund");
    expect(fund).toBeDefined();
    const shareSum = fund?.children.reduce((sum, child) => sum + child.shareOfParent, 0) ?? 0;
    expect(Number(shareSum.toFixed(2))).toBe(100);
    const childPnl = fund?.children.reduce((sum, child) => sum + child.pnl, 0) ?? 0;
    expect(Number(childPnl.toFixed(2))).toBeCloseTo(fund?.pnl ?? 0, 2);
  });
});
