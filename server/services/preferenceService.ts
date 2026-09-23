import type { Database } from "sql.js";
import { query, run } from "../db/database.ts";

export const THEMES = ["LIGHT", "DARK"] as const;

export function getTheme(db: Database): string {
  const rows = query(db, "SELECT value FROM preference WHERE key='theme'");
  return rows.length ? String(rows[0].value) : "LIGHT";
}

export function setTheme(db: Database, theme: string, actor = "system"): { ok: boolean; theme: string; message?: string } {
  if (!THEMES.includes(theme as (typeof THEMES)[number])) {
    return { ok: false, theme: getTheme(db), message: "主题取值无效，已恢复默认主题" };
  }
  run(db, "INSERT INTO preference (key, value) VALUES ('theme', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [
    theme,
  ]);
  return { ok: true, theme };
}
