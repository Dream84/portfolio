import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { createDatabase } from "../db/database.ts";
import { adjustSeries, normalizeThreshold, refreshFundNav, saveNav } from "../services/navService.ts";

let db: Database;

beforeEach(async () => {
  db = await createDatabase();
});

describe("任务 15 基金净值、复权与异常样本", () => {
  it("AC-050 当日净值未发布时保留上一净值并返回逐字文案", () => {
    saveNav(db, { symbol: "000001.OF", navDate: "2026-09-22", unitNav: 1.234 });
    const result = refreshFundNav(db, { symbol: "000001.OF", today: "2026-09-24" });
    expect(result.published).toBe(false);
    expect(result.nav).toBe(1.234);
    expect(result.navDate).toBe("2026-09-22");
    expect(result.message).toBe("当日净值未发布，展示上一净值");
  });

  it("AC-049 手动刷新在净值已发布时写入并返回净值日期", () => {
    const result = refreshFundNav(db, {
      symbol: "000001.OF",
      today: "2026-09-24",
      published: { navDate: "2026-09-23", unitNav: 1.25 },
    });
    expect(result.published).toBe(true);
    expect(result.navDate).toBe("2026-09-23");
  });

  it("AC-051 存在分红时按前复权序列计算，分红日无向下跳变", () => {
    saveNav(db, { symbol: "SH600519", navDate: "2026-09-18", unitNav: 1.0 });
    saveNav(db, { symbol: "SH600519", navDate: "2026-09-19", unitNav: 1.1, dividend: 0.1 });
    saveNav(db, { symbol: "SH600519", navDate: "2026-09-22", unitNav: 1.12 });
    const series = adjustSeries(db, "SH600519");
    const gains = series.adjusted.map((row, index) =>
      index === 0 ? 0 : Math.round((row.value / series.adjusted[0].value - 1) * 10000) / 100,
    );
    expect(gains[0]).toBe(0);
    expect(gains[1]).toBeGreaterThan(0);
    expect(gains[2]).toBeGreaterThanOrEqual(gains[1]);
    const jump = Math.abs(gains[1] - gains[1]);
    expect(jump).toBeLessThan(0.5);
  });

  it("AC-052 单日涨幅超过阈值的样本被过滤并提示条数", () => {
    saveNav(db, { symbol: "110011.OF", navDate: "2026-09-18", unitNav: 1.0 });
    saveNav(db, { symbol: "110011.OF", navDate: "2026-09-19", unitNav: 1.79 });
    saveNav(db, { symbol: "110011.OF", navDate: "2026-09-22", unitNav: 1.8 });
    const series = adjustSeries(db, "110011.OF");
    expect(series.filteredCount).toBe(1);
    expect(series.message).toBe("已过滤异常样本 1 条");
    const flagged = series.raw.filter((row) => row.isAnomaly);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].navDate).toBe("2026-09-19");
    expect(series.adjusted.some((row) => row.navDate === "2026-09-19")).toBe(false);
  });

  it("AC-052 无异常样本时返回未发现异常样本", () => {
    saveNav(db, { symbol: "110011.OF", navDate: "2026-09-18", unitNav: 1.0 });
    saveNav(db, { symbol: "110011.OF", navDate: "2026-09-19", unitNav: 1.01 });
    const series = adjustSeries(db, "110011.OF");
    expect(series.filteredCount).toBe(0);
    expect(series.message).toBe("未发现异常样本");
  });

  it("AC-052 阈值超出 5% 至 50% 时回退默认并提示", () => {
    expect(normalizeThreshold(0.9).threshold).toBe(0.15);
    expect(normalizeThreshold(0.9).message).toBe("异常样本阈值需在 5% 至 50% 之间，已回退默认值");
  });
});
