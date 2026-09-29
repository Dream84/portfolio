import { randomUUID } from "node:crypto";
import type { Database } from "sql.js";
import { query, run } from "../db/database.ts";

export const THRESHOLD_DEFAULT = 0.15;
export const THRESHOLD_MIN = 0.05;
export const THRESHOLD_MAX = 0.5;

export function normalizeThreshold(value: unknown): { threshold: number; message?: string } {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < THRESHOLD_MIN || parsed > THRESHOLD_MAX) {
    return { threshold: THRESHOLD_DEFAULT, message: "异常样本阈值需在 5% 至 50% 之间，已回退默认值" };
  }
  return { threshold: parsed };
}

export function saveNav(
  db: Database,
  input: { symbol: string; navDate: string; unitNav: number; dividend?: number },
): { ok: boolean; id?: string; message?: string } {
  if (!(Number(input.unitNav) > 0)) return { ok: false, message: "净值需大于 0" };
  const id = randomUUID();
  run(db, "INSERT INTO nav (id, symbol, nav_date, unit_nav, dividend) VALUES (?,?,?,?,?) ON CONFLICT(symbol, nav_date) DO UPDATE SET unit_nav=excluded.unit_nav, dividend=excluded.dividend", [
    id,
    input.symbol,
    input.navDate,
    Number(input.unitNav),
    Number(input.dividend ?? 0),
  ]);
  return { ok: true, id };
}

export function refreshFundNav(
  db: Database,
  input: { symbol: string; today: string; published?: { navDate: string; unitNav: number; dividend?: number } },
): { ok: boolean; nav?: number; navDate?: string; message?: string; published: boolean } {
  const history = query(db, "SELECT nav_date, unit_nav FROM nav WHERE symbol=? ORDER BY nav_date DESC LIMIT 1", [input.symbol]);
  if (!input.published) {
    if (!history.length) {
      return { ok: false, published: false, message: "暂无可用净值" };
    }
    return {
      ok: true,
      published: false,
      nav: Number(history[0].unit_nav),
      navDate: String(history[0].nav_date),
      message: "当日净值未发布，展示上一净值",
    };
  }
  saveNav(db, { symbol: input.symbol, navDate: input.published.navDate, unitNav: input.published.unitNav, dividend: input.published.dividend });
  return { ok: true, published: true, nav: input.published.unitNav, navDate: input.published.navDate };
}

export type AdjustedSeries = {
  adjusted: Array<{ navDate: string; value: number }>;
  raw: Array<{ navDate: string; value: number; isAnomaly: boolean }>;
  filteredCount: number;
  message: string;
  usable: boolean;
};

export function adjustSeries(db: Database, symbol: string, thresholdInput?: unknown): AdjustedSeries {
  const { threshold } = normalizeThreshold(thresholdInput ?? THRESHOLD_DEFAULT);
  const rows = query(db, "SELECT nav_date, unit_nav, dividend FROM nav WHERE symbol=? ORDER BY nav_date", [symbol]);
  const raw = rows.map((row) => ({ navDate: String(row.nav_date), value: Number(row.unit_nav), dividend: Number(row.dividend ?? 0) }));
  const anomalies = new Set<number>();
  for (let i = 1; i < raw.length; i += 1) {
    const prev = raw[i - 1].value;
    if (prev <= 0) {
      anomalies.add(i);
      continue;
    }
    if (Math.abs(raw[i].value / prev - 1) > threshold) anomalies.add(i);
  }
  const factors: number[] = new Array(raw.length).fill(1);
  for (let i = raw.length - 2; i >= 0; i -= 1) {
    const next = raw[i + 1];
    if (next.value <= 0) {
      factors[i] = factors[i + 1];
      continue;
    }
    factors[i] = (factors[i + 1] * (next.value + next.dividend)) / next.value;
  }
  const adjusted = raw
    .map((row, index) => ({ navDate: row.navDate, value: Math.round(row.value * factors[index] * 10000) / 10000, index }))
    .filter((row) => !anomalies.has(row.index))
    .map((row) => ({ navDate: row.navDate, value: row.value }));
  const filteredCount = anomalies.size;
  const usable = adjusted.length > 0;
  const message = !raw.length
    ? "数据不可用"
    : filteredCount === 0
      ? "未发现异常样本"
      : usable
        ? `已过滤异常样本 ${filteredCount} 条`
        : "数据不可用";
  return {
    adjusted,
    raw: raw.map((row, index) => ({ navDate: row.navDate, value: row.value, isAnomaly: anomalies.has(index) })),
    filteredCount,
    message,
    usable,
  };
}
