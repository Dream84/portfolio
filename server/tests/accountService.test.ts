import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { createDatabase } from "../db/database.ts";
import { listAccountsWithLabel, saveAccount } from "../services/accountService.ts";

let db: Database;

beforeEach(async () => {
  db = await createDatabase();
});

describe("AC-007 账户维护", () => {
  it("AC-007 账户列表为空时给出空状态提示文案", () => {
    const result = listAccountsWithLabel(db);
    expect(result.rows).toHaveLength(0);
    expect(result.emptyMessage).toBe("暂无账户，请先新增账户");
  });

  it("AC-007 新增券商账户后列表新增 1 行且类型显示为券商", () => {
    const saved = saveAccount(db, { name: "华泰证券", accountType: "BROKER" });
    expect(saved.ok).toBe(true);
    expect(saved.message).toBe("账户已保存");
    const list = listAccountsWithLabel(db);
    expect(list.rows).toHaveLength(1);
    expect(list.rows[0].name).toBe("华泰证券");
    expect(list.rows[0].typeLabel).toBe("券商");
    expect(list.rows[0].status).toBe("ENABLED");
  });

  it("AC-007 停用账户需二次确认，确认后状态变更", () => {
    saveAccount(db, { name: "华泰证券", accountType: "BROKER" });
    const denied = saveAccount(db, { name: "华泰证券", accountType: "BROKER", status: "DISABLED" });
    expect(denied.ok).toBe(false);
    expect(denied.needConfirm).toBe(true);
    expect(denied.message).toBe("停用账户需二次确认");
    const confirmed = saveAccount(db, { name: "华泰证券", accountType: "BROKER", status: "DISABLED", confirmDisable: true });
    expect(confirmed.ok).toBe(true);
    expect(listAccountsWithLabel(db).rows[0].status).toBe("DISABLED");
  });
});
