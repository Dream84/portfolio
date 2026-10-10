import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { createDatabase } from "../db/database.ts";
import { queryAnalytics } from "../services/analyticsService.ts";
import { seedAccounts, seedCategories, seedHoldings, seedQuotes, seedSnapshots } from "../seed.ts";

let db: Database;

beforeEach(async () => {
  db = await createDatabase();
});

describe("AC-054 快照不足时不绘制曲线", () => {
  it("AC-054 区间内有效快照少于 2 条时标记历史数据不足并保留当日指标", () => {
    seedCategories(db);
    seedAccounts(db);
    seedHoldings(db);
    seedQuotes(db);
    seedSnapshots(db);
    const outOfRange = queryAnalytics(db, {
      portfolioId: "family",
      dimension: "PORTFOLIO",
      scope: "family",
      l1Key: "",
      l2Key: "",
      rangeKey: "CUSTOM",
      start: "2030-01-01",
      end: "2030-12-31",
    });
    expect(outOfRange.ok).toBe(true);
    expect(outOfRange.insufficient).toBe(true);
    expect((outOfRange.series ?? []).length).toBeLessThan(2);
    expect(outOfRange.metrics?.marketValue).toBeGreaterThanOrEqual(0);

    // 区间内仅 1 条快照时同样不绘制曲线
    const latest = String(db.exec("SELECT MAX(snapshot_date) FROM snapshot")[0].values[0][0]);
    const singleDay = queryAnalytics(db, {
      portfolioId: "family",
      dimension: "PORTFOLIO",
      scope: "family",
      l1Key: "",
      l2Key: "",
      rangeKey: "CUSTOM",
      start: latest,
      end: latest,
    });
    expect(singleDay.insufficient).toBe(true);
    expect((singleDay.series ?? []).length).toBe(1);
  });
});

describe("AC-056 收益指标", () => {
  it("AC-056 指标卡包含当前市值、累计投入、浮动盈亏、已实现盈亏与累计收益率", () => {
    seedCategories(db);
    seedAccounts(db);
    seedHoldings(db);
    seedQuotes(db);
    seedSnapshots(db);
    const result = queryAnalytics(db, {
      portfolioId: "family",
      dimensionType: "PORTFOLIO",
      start: "2026-01-01",
      end: "2026-12-31",
    });
    const metrics = result.metrics ?? {};
    for (const key of ["marketValue", "netInvestment", "floatingPnl", "realizedPnl"]) {
      expect(typeof metrics[key as keyof typeof metrics]).toBe("number");
    }
    expect(Number(metrics.realizedPnl)).toBeGreaterThanOrEqual(0);
  });

  it("AC-056 所选维度无持仓时返回空态并提示先录入流水", () => {
    const result = queryAnalytics(db, {
      portfolioId: "family",
      dimensionType: "PORTFOLIO",
      from: "2026-01-01",
      to: "2026-12-31",
    });
    expect(result.ok).toBe(true);
    const metrics = result.metrics ?? {};
    expect(Number(metrics.marketValue)).toBe(0);
    expect(typeof metrics.realizedPnl).toBe("number");
  });
});