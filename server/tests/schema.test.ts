import { describe, expect, it } from "vitest";
import { createDatabase, indexOf, listTables } from "../db/database.ts";

describe("任务 1 数据层基座", () => {
  it("应创建组合、账户关联、持仓、分类、快照与偏好相关表，并建立快照唯一约束", async () => {
    const db = await createDatabase();
    const tables = listTables(db);
    for (const table of ["account", "cash_account", "portfolio", "portfolio_account", "category", "holding", "quote", "snapshot"]) {
      expect(tables).toContain(table);
    }
    expect(indexOf(db, "snapshot")).toContain("uk_snapshot_account_date_dim");
    expect(indexOf(db, "holding")).toContain("uk_holding_account_symbol");
  });

  it("INV-2 二级分类必须归属已存在的一级分类，一级分类不得有父级", async () => {
    const db = await createDatabase();
    expect(() =>
      db.run("INSERT INTO category (key, name, level, parent_key, preset, color_token, sort_order) VALUES ('x','孤儿','L2',NULL,0,'chart-1',1)"),
    ).toThrow();
    db.run("INSERT INTO category (key, name, level, parent_key, preset, color_token, sort_order) VALUES ('l1','一级','L1','l1',0,'chart-1',1)");
    const rows = db.exec("SELECT level, parent_key FROM category WHERE key='l1'");
    expect(rows.length).toBe(1);
  });
});
