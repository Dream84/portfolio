import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { createDatabase, run } from "../db/database.ts";
import { getRefreshInterval, normalizeTimeout, probeProvider, resolveProvider, saveProvider, setRefreshInterval } from "../services/providerService.ts";

let db: Database;

beforeEach(async () => {
  db = await createDatabase();
  run(db, "INSERT INTO provider (id, name, kind, priority, enabled, timeout_seconds, url) VALUES ('src-quote-a','腾讯行情','QUOTE',1,1,3,'https://qt.gtimg.cn/')", []);
  run(db, "INSERT INTO provider (id, name, kind, priority, enabled, timeout_seconds, url) VALUES ('src-quote-b','新浪财经','QUOTE',2,1,3,'https://hq.sinajs.cn/')", []);
  run(db, "INSERT INTO provider (id, name, kind, priority, enabled, timeout_seconds, url) VALUES ('src-nav-a','天天基金','NAV',1,1,3,'https://fund.eastmoney.com/')", []);
});

describe("任务 12 数据源配置与连通性检测", () => {
  it("AC-041 全部禁用时拒绝保存并保留至少一个启用源", () => {
    const first = saveProvider(db, { name: "腾讯行情", kind: "QUOTE", enabled: false, id: "src-quote-a" });
    expect(first.ok).toBe(true);
    const second = saveProvider(db, { name: "新浪财经", kind: "QUOTE", enabled: false, id: "src-quote-b" });
    expect(second.ok).toBe(true);
    const third = saveProvider(db, { name: "天天基金", kind: "NAV", enabled: false, id: "src-nav-a" });
    expect(third.ok).toBe(false);
    expect(third.message).toBe("请至少启用一个数据源");
  });

  it("AC-042 提交自定义数据源地址被拒绝", () => {
    const result = saveProvider(db, { name: "可疑源", kind: "QUOTE", url: "https://evil.example.com/quote" });
    expect(result.ok).toBe(false);
    expect(result.message).toBe("不支持自定义数据源地址");
  });

  it("AC-041 连通性检测失败时给出原因与检测时间", async () => {
    const result = await probeProvider(db, "src-quote-a", async () => {
      throw new Error("连接超时");
    });
    expect(result.ok).toBe(false);
    expect(result.message).toBe("数据源不可用：连接超时");
    expect(result.checkedAt).toBeTruthy();
  });

  it("AC-041 主源失败时按优先级选择备用源", () => {
    run(db, "UPDATE provider SET enabled=0 WHERE id='src-quote-a'", []);
    expect(String((resolveProvider(db, "QUOTE") ?? {}).id)).toBe("src-quote-b");
  });

  it("AC-045 自动刷新周期小于 30 秒时回退默认并提示", () => {
    const result = setRefreshInterval(db, 10);
    expect(result.seconds).toBe(60);
    expect(result.message).toBe("自动刷新周期不得小于 30 秒，已回退默认值");
    expect(getRefreshInterval(db).seconds).toBe(60);
  });

  it("AC-041 超时值超出 1 至 10 秒时回退默认并提示", () => {
    expect(normalizeTimeout(30).timeoutSeconds).toBe(3);
    expect(normalizeTimeout(30).message).toBe("超时值需在 1 至 10 秒之间，已回退默认值");
    expect(normalizeTimeout(5).timeoutSeconds).toBe(5);
  });
});
