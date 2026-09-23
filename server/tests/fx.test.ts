import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { createDatabase } from "../db/database.ts";
import { convertCash, saveFxRate } from "../services/fxService.ts";
import { saveCashAccount } from "../services/cashAccountService.ts";
import { seedAccounts } from "../seed.ts";

let db: Database;

beforeEach(async () => {
  db = await createDatabase();
  seedAccounts(db);
});

describe("任务 4 外币现金与汇率折算", () => {
  it("AC-068 美元现金按汇率折合人民币", () => {
    const result = convertCash(db, { currency: "USD", amount: 2000, rate: 6.6956 });
    expect(result.cny).toBeCloseTo(13391.2, 2);
  });

  it("AC-068 汇率缺失时使用最近一次成功汇率并标注来源", () => {
    saveFxRate(db, "HKD", 0.86, "2026-09-17 15:00");
    const result = convertCash(db, { currency: "HKD", amount: 1000 });
    expect(result.source).toBe("LAST_SUCCESS");
    expect(result.cny).toBeCloseTo(860, 2);
  });

  it("AC-069 手工覆盖汇率后按手工值折算并标记来源", () => {
    const result = saveCashAccount(db, {
      accountId: "zhaoshang",
      name: "美元现金（手工汇率）",
      currency: "USD",
      amount: 2000,
      rate: 6.7,
      rateTime: "2026-09-21 14:32",
      overridden: true,
    });
    expect(result.ok).toBe(true);
    expect(result.cny).toBeCloseTo(13400, 2);
    const row = db.exec("SELECT fx_overridden, fx_rate FROM cash_account WHERE name='美元现金（手工汇率）'")[0].values[0];
    expect(Number(row[0])).toBe(1);
    expect(Number(row[1])).toBeCloseTo(6.7, 4);
  });
});
