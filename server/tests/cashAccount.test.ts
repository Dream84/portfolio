import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { createDatabase } from "../db/database.ts";
import { saveCashAccount, listCashAccounts } from "../services/cashAccountService.ts";
import { seedAccounts } from "../seed.ts";

let db: Database;

beforeEach(async () => {
  db = await createDatabase();
  seedAccounts(db);
});

describe("任务 3 账户与现金账户", () => {
  it("AC-009 保存现金账户并返回折合金额", () => {
    const result = saveCashAccount(db, { accountId: "zhaoshang", name: "工行卡现金", currency: "CNY", amount: 10000 });
    expect(result.ok).toBe(true);
    expect(result.cny).toBe(10000);
    expect(listCashAccounts(db).length).toBe(3);
  });

  it("AC-010 初始余额为负时拒绝并返回逐字文案", () => {
    const result = saveCashAccount(db, { accountId: "zhaoshang", name: "工行卡现金", currency: "CNY", amount: -1 });
    expect(result.ok).toBe(false);
    expect(result.message).toBe("请输入不小于 0 的金额");
  });

  it("AC-008 名称重复时拒绝保存", () => {
    saveCashAccount(db, { accountId: "zhaoshang", name: "工行卡现金", currency: "CNY", amount: 100 });
    const again = saveCashAccount(db, { accountId: "zhaoshang", name: "工行卡现金", currency: "CNY", amount: 200 });
    expect(again.ok).toBe(false);
    expect(again.message).toBe("现金账户名称已存在");
  });
});
