import type { Database } from "sql.js";
import { query, run, type Row } from "../db/database.ts";

export type CategoryRow = {
  key: string;
  name: string;
  level: "L1" | "L2";
  parentKey: string | null;
  preset: boolean;
  colorToken: string;
  sortOrder: number;
};

const map = (row: Row): CategoryRow => ({
  key: String(row.key),
  name: String(row.name),
  level: String(row.level) as "L1" | "L2",
  parentKey: row.parent_key === null ? null : String(row.parent_key),
  preset: Number(row.preset) === 1,
  colorToken: String(row.color_token),
  sortOrder: Number(row.sort_order),
});

export function listCategories(db: Database): CategoryRow[] {
  return query(db, "SELECT * FROM category ORDER BY sort_order, key").map(map);
}

export function findCategory(db: Database, key: string): CategoryRow | null {
  const rows = query(db, "SELECT * FROM category WHERE key=?", [key]);
  return rows.length ? map(rows[0]) : null;
}

export function findCategoryByName(db: Database, name: string): CategoryRow | null {
  const rows = query(db, "SELECT * FROM category WHERE name=?", [name]);
  return rows.length ? map(rows[0]) : null;
}

export function insertCategory(db: Database, category: CategoryRow): void {
  run(
    db,
    "INSERT INTO category (key, name, level, parent_key, preset, color_token, sort_order) VALUES (?,?,?,?,?,?,?)",
    [
      category.key,
      category.name,
      category.level,
      category.parentKey,
      category.preset ? 1 : 0,
      category.colorToken,
      category.sortOrder,
    ],
  );
}

export function deleteCategory(db: Database, key: string): void {
  run(db, "DELETE FROM category WHERE key=?", [key]);
}

export function countChildren(db: Database, key: string): number {
  const rows = query(db, "SELECT COUNT(*) AS c FROM category WHERE parent_key=?", [key]);
  return rows.length ? Number(rows[0].c) : 0;
}
