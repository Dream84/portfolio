import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { createDatabase, query, run } from "../db/database.ts";
import { cachedDataTime, refreshQuotes } from "../services/quoteService.ts";
import { listFetchLogs } from "../services/logService.ts";

let db: Database;
let rateState: { lastRequestAt: number };

beforeEach(async () => {
  db = await createDatabase();
  run(db, "INSERT INTO provider (id, name, kind, priority, enabled, timeout_seconds, url) VALUES ('src-quote-a','腾讯行情','QUOTE',1,1,3,'https://qt.gtimg.cn/')", []);
  run(db, "INSERT INTO quote (symbol, kind, price, price_time, is_cache) VALUES ('SH600519','PRICE',1500,'2026-09-23T15:00:00Z',0)", []);
  rateState = { lastRequestAt: 0 };
});

describe("任务 14 刷新失败降级与日志", () => {
  it("AC-047 上游失败时保留最近成功数据并标注数据时间与原因", async () => {
    const first = await refreshQuotes(db, { fetcher: async () => ({ price: 1600, dataTime: "2026-09-24T01:30:00Z" }), rateState });
    expect(first.updated).toEqual(["SH600519"]);
    const failed = await refreshQuotes(db, {
      fetcher: async () => {
        throw new Error("请求超时");
      },
      now: new Date(Date.now() + 60000),
      rateState,
    });
    expect(failed.failed).toEqual(["SH600519"]);
    expect(failed.message).toBe("请求超时");
    const state = cachedDataTime(db, "SH600519");
    expect(state.isCache).toBe(true);
    expect(state.dataTime).toBe("2026-09-24T01:30:00Z");
    expect(state.reason).toBe("请求超时");
    expect(Number(query(db, "SELECT price FROM quote WHERE symbol='SH600519'")[0].price)).toBe(1600);
  });

  it("AC-048 连续失败 3 次后提示检查网络与数据源配置并写入日志", async () => {
    const failing = async () => {
      throw new Error("请求超时");
    };
    for (let i = 0; i < 3; i += 1) {
      await refreshQuotes(db, { fetcher: failing, now: new Date(Date.now() + i * 60000), rateState });
    }
    const third = await refreshQuotes(db, { fetcher: failing, now: new Date(Date.now() + 3 * 60000), rateState });
    expect(third.message).toBe("已连续 3 次刷新失败，请检查本机网络与数据源配置");
    expect(listFetchLogs(db, "ERROR").length).toBeGreaterThanOrEqual(3);
  });

  it("AC-047 降级不阻断其他标的功能", async () => {
    run(db, "INSERT INTO quote (symbol, kind, price, price_time, is_cache) VALUES ('SZ000001','PRICE',12,'2026-09-23T15:00:00Z',0)", []);
    const result = await refreshQuotes(db, {
      fetcher: async (input) => {
        if (input.symbol === "SH600519") throw new Error("请求超时");
        return { price: 13 };
      },
      rateState,
    });
    expect(result.updated).toEqual(["SZ000001"]);
    expect(result.failed).toEqual(["SH600519"]);
  });
});
