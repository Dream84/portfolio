import type { Database } from "sql.js";
import * as repo from "../repositories/categoryRepo.ts";
import { countByCategoryKey } from "../repositories/holdingRepo.ts";

export const CHART_COLORS = [
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "chart-6",
  "chart-7",
  "chart-8",
];

export type ServiceResult = { ok: boolean; field?: string; message?: string; refCount?: number };

export function listCategories(db: Database) {
  return repo.listCategories(db);
}

export function addCategory(
  db: Database,
  input: { key: string; name: string; level: "L1" | "L2"; parentKey?: string | null },
): ServiceResult {
  if (repo.findCategoryByName(db, input.name)) {
    return { ok: false, field: "name", message: "分类名称已存在" };
  }
  if (input.level === "L2") {
    const parent = input.parentKey ? repo.findCategory(db, input.parentKey) : null;
    if (!parent || parent.level !== "L1") {
      return { ok: false, field: "parentKey", message: "二级分类必须归属一个已存在的一级分类" };
    }
  }
  const existing = repo.listCategories(db);
  const colorToken = CHART_COLORS[existing.length % CHART_COLORS.length];
  repo.insertCategory(db, {
    key: input.key,
    name: input.name,
    level: input.level,
    parentKey: input.level === "L2" ? (input.parentKey ?? null) : null,
    preset: false,
    colorToken,
    sortOrder: existing.length + 1,
  });
  return { ok: true };
}

export function removeCategory(db: Database, key: string): ServiceResult {
  const target = repo.findCategory(db, key);
  if (!target) {
    return { ok: false, message: "分类不存在" };
  }
  if (target.preset) {
    return { ok: false, message: `${target.name} 为预设分类，不可删除` };
  }
  const children = repo.countChildren(db, key);
  if (children > 0) {
    return { ok: false, message: `该一级分类下仍有 ${children} 个子分类，无法删除` };
  }
  const refCount = countByCategoryKey(db, key);
  if (refCount > 0) {
    return { ok: false, refCount, message: `该分类被 ${refCount} 条持仓引用，无法删除` };
  }
  repo.deleteCategory(db, key);
  return { ok: true };
}
