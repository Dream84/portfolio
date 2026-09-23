import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { createDatabase } from "../db/database.ts";
import { getTheme, setTheme } from "../services/preferenceService.ts";

let db: Database;

beforeEach(async () => {
  db = await createDatabase();
});

describe("任务 7 主题与本机偏好", () => {
  it("AC-064 默认浅色，切换到暗色后保持", () => {
    expect(getTheme(db)).toBe("LIGHT");
    expect(setTheme(db, "DARK").ok).toBe(true);
    expect(getTheme(db)).toBe("DARK");
  });

  it("AC-065 非法主题回退浅色并返回逐字文案", () => {
    const result = setTheme(db, "NEON");
    expect(result.ok).toBe(false);
    expect(result.message).toBe("主题取值无效，已恢复默认主题");
    expect(result.theme).toBe("LIGHT");
  });
});
