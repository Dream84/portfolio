import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { createDatabase } from "../db/database.ts";
import { seedAll } from "../seed.ts";
import { queryAnalytics } from "../services/analyticsService.ts";

let db: Database;

beforeEach(async () => {
  db = await createDatabase();
  seedAll(db);
});

const base = {
  portfolioId: "family",
  dimension: "PORTFOLIO" as const,
  scope: "family",
  l1Key: "all",
  l2Key: "all",
  rangeKey: "6M" as const,
};

describe("任务 8 收益分析查询", () => {
  it("AC-053 默认近 6 个月应返回快照驱动的曲线数据", () => {
    const result = queryAnalytics(db, base);
    expect(result.ok).toBe(true);
    expect(result.insufficient).toBe(false);
    expect(result.series?.length).toBe(11);
    expect(result.series?.[0].date).toBe("2026-09-01");
    expect(result.series?.[10].value).toBeCloseTo(206666, 2);
  });

  it("AC-059 切换维度应重算占比口径", () => {
    const portfolio = queryAnalytics(db, base);
    expect(portfolio.shareRows).toHaveLength(4);
    const account = queryAnalytics(db, { ...base, dimension: "ACCOUNT", scope: "all" });
    expect(account.ok).toBe(true);
    expect(account.metrics?.marketValue).toBeCloseTo(220057.2, 2);
  });

  it("AC-060 无持仓维度应返回空态标识", () => {
    const result = queryAnalytics(db, { ...base, dimension: "ACCOUNT", scope: "pension" });
    expect(result.ok).toBe(true);
    expect(result.empty).toBe(true);
    expect(result.emptyMessage).toBe("所选维度暂无持仓");
  });

  it("AC-066 自定义日期非法应拒绝并返回逐字文案，合法则放行", () => {
    const bad = queryAnalytics(db, { ...base, rangeKey: "CUSTOM", start: "2026-09-18", end: "2026-04-01" });
    expect(bad.ok).toBe(false);
    expect(bad.message).toBe("请选择有效的日期范围");

    const good = queryAnalytics(db, { ...base, rangeKey: "CUSTOM", start: "2026-09-01", end: "2026-09-18" });
    expect(good.ok).toBe(true);
  });

  it("AC-067 一级与二级分类口径应分别聚合", () => {
    const l1 = queryAnalytics(db, { ...base, l1Key: "fund", l2Key: "all" });
    expect(l1.metrics?.marketValue).toBeCloseTo(21486, 2);

    const l2 = queryAnalytics(db, { ...base, l1Key: "fund", l2Key: "fund-bond" });
    expect(l2.metrics?.marketValue).toBeCloseTo(21486, 2);
    expect(l2.metrics?.returnRate).toBeCloseTo(2.31, 2);
    expect(l2.shareRows?.map((row) => row.key)).toEqual(["fund-bond", "fund-equity"]);
  });
});
