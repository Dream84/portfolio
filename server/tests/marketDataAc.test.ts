import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { createDatabase, query, run } from "../db/database.ts";
import { refreshQuotes } from "../services/quoteService.ts";
import { getRefreshInterval, setRefreshInterval } from "../services/providerService.ts";

let db: Database;

beforeEach(async () => {
  db = await createDatabase();
  run(db, "INSERT INTO provider (id, name, kind, priority, enabled, timeout_seconds, url) VALUES ('src-quote-a','腾讯行情','QUOTE',1,1,3,'https://qt.gtimg.cn/')", []);
  run(db, "INSERT INTO quote (symbol, kind, price, price_time, is_cache) VALUES ('600519','PRICE',1254.75,'2026-09-18 15:00',0)", []);
  run(db, "INSERT INTO quote (symbol, kind, price, price_time, is_cache) VALUES ('518880','PRICE',8.941,'2026-09-18 15:00',0)", []);
  run(db, "INSERT INTO quote (symbol, kind, price, price_time, is_cache) VALUES ('004400','NAV',1.0743,'2026-09-18',1)", []);
});

describe("AC-044 批量刷新范围", () => {
  it("AC-044 组合含 2 个场内标的与 1 只场外基金时只更新场内标的，场外基金净值日期不变", async () => {
    const result = await refreshQuotes(db, { fetcher: async () => ({ price: 1300 }) });
    expect(result.ok).toBe(true);
    expect(result.updated).toHaveLength(2);
    expect(result.updated).not.toContain("004400");
    const fund = query(db, "SELECT price, price_time, is_cache FROM quote WHERE symbol='004400'")[0];
    expect(Number(fund.price)).toBe(1.0743);
    expect(String(fund.price_time)).toBe("2026-09-18");
    expect(Number(fund.is_cache)).toBe(1);
  });
});

describe("AC-046 自动刷新周期", () => {
  it("AC-046 默认 60 秒，最小值 30 秒可用，非法值回退默认并提示", () => {
    expect(getRefreshInterval(db).seconds).toBe(60);
    expect(setRefreshInterval(db, 30).seconds).toBe(30);
    const fallback = setRefreshInterval(db, 5);
    expect(fallback.seconds).toBe(60);
    expect(fallback.message).toBe("自动刷新周期不得小于 30 秒，已回退默认值");
    expect(getRefreshInterval(db).seconds).toBe(60);
  });
});
