import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { createDatabase, query, run } from "../db/database.ts";
import { CACHE_SECONDS, cachedDataTime, refreshQuotes } from "../services/quoteService.ts";
import { listFetchLogs } from "../services/logService.ts";

let db: Database;

beforeEach(async () => {
  db = await createDatabase();
  run(db, "INSERT INTO provider (id, name, kind, priority, enabled, timeout_seconds, url) VALUES ('src-quote-a','腾讯行情','QUOTE',1,1,3,'https://qt.gtimg.cn/')", []);
  run(db, "INSERT INTO quote (symbol, kind, price, price_time, is_cache) VALUES ('SH600519','PRICE',1500,'2026-09-23T15:00:00Z',0)", []);
  run(db, "INSERT INTO quote (symbol, kind, price, price_time, is_cache) VALUES ('000001.OF','NAV',1.234,'2026-09-23T00:00:00Z',0)", []);
});

describe("任务 13 批量刷新、缓存与限流", () => {
  it("AC-043 一次刷新更新全部场内标的且排除场外基金", async () => {
    const result = await refreshQuotes(db, { fetcher: async () => ({ price: 1600, changePct: 1.2 }) });
    expect(result.ok).toBe(true);
    expect(result.updated).toEqual(["SH600519"]);
    expect(result.skippedFunds).toEqual([]);
    expect(Number(query(db, "SELECT price FROM quote WHERE symbol='SH600519'")[0].price)).toBe(1600);
    expect(listFetchLogs(db).length).toBe(0);
  });

  it("AC-043 无可刷新标的时返回逐字文案", async () => {
    run(db, "DELETE FROM quote WHERE kind='PRICE'", []);
    const result = await refreshQuotes(db, { fetcher: async () => ({ price: 1 }) });
    expect(result.ok).toBe(false);
    expect(result.message).toBe("暂无可刷新的场内标的");
  });

  it("AC-045 缓存有效期内复用缓存并提示数据未过期", async () => {
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return { price: 1600 };
    };
    const rateState = { lastRequestAt: 0 };
    await refreshQuotes(db, { fetcher, rateState });
    const second = await refreshQuotes(db, { fetcher, rateState });
    expect(calls).toBe(1);
    expect(second.cached).toEqual(["SH600519"]);
    expect(second.message).toBe("数据未过期");
    const state = cachedDataTime(db, "SH600519");
    expect(state.dataTime).toBeTruthy();
    expect(state.isCache).toBe(false);
  });

  it("AC-045 触发限流时等待至下一允许时间并提示等待秒数", async () => {
    const now = new Date("2026-09-24T10:00:00Z");
    const rateState = { lastRequestAt: now.getTime() - 300 };
    const result = await refreshQuotes(db, { fetcher: async () => ({ price: 1600 }), now, rateState });
    expect(result.code).toBe("RATE_LIMITED");
    expect(result.waitSeconds).toBeGreaterThanOrEqual(1);
    expect(result.message).toContain("请等待");
    expect(listFetchLogs(db, "ERROR").length).toBe(1);
  });

  it("缓存有效期默认 30 秒", () => {
    expect(CACHE_SECONDS).toBe(30);
  });
});
