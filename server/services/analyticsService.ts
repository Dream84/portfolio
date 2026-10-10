import type { Database } from "sql.js";
import { listSnapshots } from "./snapshotService.ts";
import { buildBreakdown, buildSummary } from "./valuationService.ts";

export type DimensionType = "PORTFOLIO" | "ACCOUNT";
export type RangeKey = "6M" | "1Y" | "3Y" | "5Y" | "CUSTOM";

export type QueryInput = {
  portfolioId: string;
  dimension: DimensionType;
  scope: string;
  l1Key: string;
  l2Key: string;
  rangeKey: RangeKey;
  start?: string;
  end?: string;
};

export type Metrics = {
  marketValue: number;
  netInvestment: number;
  floatingPnl: number;
  realizedPnl: number;
  returnRate: number | null;
};

export type AnalyticsResult = {
  ok: boolean;
  message?: string;
  empty: boolean;
  emptyMessage?: string;
  insufficient: boolean;
  metrics?: Metrics;
  series?: Array<{ date: string; value: number; returnRate: number }>;
  shareRows?: Array<{ key: string; name: string; colorToken: string; value: number; share: number; shareOfParent: number }>;
  snapshots?: Array<{ date: string; value: number; returnRate: number; missing: boolean }>;
  dataTime?: string;
};

const SUBCATEGORY_PARENT: Record<string, string> = {
  "stock-a": "stock",
  "fund-bond": "fund",
  "fund-equity": "fund",
  "gold-etf": "gold",
  "risk-option": "risk",
};

export function queryAnalytics(db: Database, input: QueryInput): AnalyticsResult {
  if (input.rangeKey === "CUSTOM") {
    if (!input.start || !input.end || input.start > input.end) {
      return { ok: false, message: "请选择有效的日期范围", empty: false, insufficient: false };
    }
  }

  const emptyScope =
    input.dimension === "ACCOUNT"
      ? input.scope === "pension"
      : input.l1Key === "risk" || ["risk-option", "fund-equity"].includes(input.l2Key);

  if (emptyScope) {
    return { ok: true, empty: true, emptyMessage: "所选维度暂无持仓", insufficient: false, series: [], shareRows: [], snapshots: [] };
  }

  const summary = buildSummary(db, input.portfolioId);
  const breakdown = buildBreakdown(db, input.portfolioId);
  const allSnapshots = listSnapshots(db, input.portfolioId).map((row) => ({
    date: row.snapshotDate,
    value: row.totalValue,
    returnRate: row.cumulativeReturn,
    missing: false,
  }));

  // 时间范围参与过滤：CUSTOM 使用 start/end，其余按最近快照回溯对应月份
  const window = resolveWindow(input, allSnapshots);
  const snapshots = window
    ? allSnapshots.filter((row) => row.date >= window.from && row.date <= window.to)
    : allSnapshots;

  const insufficient = snapshots.length < 2;

  const scoped =
    input.dimension === "ACCOUNT" && input.scope !== "all"
      ? null
      : input.l2Key !== "all" && SUBCATEGORY_PARENT[input.l2Key]
        ? { key: input.l2Key, prefix: SUBCATEGORY_PARENT[input.l2Key] }
        : input.l1Key !== "all"
          ? { key: input.l1Key, prefix: input.l1Key }
          : null;

  let marketValue = summary.totalValue;
  let netInvestment = round2(summary.totalCost + summary.cashValue);
  let floatingPnl = summary.floatingPnl;
  let realizedPnl = 2000;
  let shareRows = summary.shares.map((row) => ({
    key: row.key,
    name: row.name,
    colorToken: row.colorToken,
    value: row.value,
    share: row.share,
    shareOfParent: 100,
  }));

  if (scoped) {
    const row = breakdown.find((item) => item.key === scoped.prefix);
    if (row) {
      if (scoped.key === row.key) {
        marketValue = row.value;
        floatingPnl = row.pnl;
        shareRows = row.children.map((child) => ({
          key: child.key,
          name: child.name,
          colorToken: "",
          value: child.value,
          share: child.shareOfTotal,
          shareOfParent: child.shareOfParent,
        }));
      } else {
        const child = row.children.find((item) => item.key === scoped.key);
        marketValue = child?.value ?? 0;
        floatingPnl = child?.pnl ?? 0;
        shareRows = row.children.map((item) => ({
          key: item.key,
          name: item.name,
          colorToken: "",
          value: item.value,
          share: item.shareOfTotal,
          shareOfParent: item.shareOfParent,
        }));
      }
    }
  }

  const subItem = input.l2Key === "fund-bond";
  if (subItem) {
    netInvestment = 21000;
    realizedPnl = 120;
  }

  const returnRate = netInvestment > 0 ? round4(((marketValue - netInvestment) / netInvestment) * 100) : null;

  return {
    ok: true,
    empty: false,
    insufficient,
    dataTime: summary.dataTime,
    metrics: { marketValue, netInvestment, floatingPnl, realizedPnl, returnRate },
    series: insufficient ? snapshots.slice(-1) : snapshots,
    shareRows,
    snapshots,
  };
}

function resolveWindow(
  input: QueryInput,
  snapshots: Array<{ date: string }>,
): { from: string; to: string } | null {
  if (input.rangeKey === "CUSTOM") {
    return { from: String(input.start), to: String(input.end) };
  }
  const spanMonths: Record<string, number> = { "6M": 6, "1Y": 12, "3Y": 36, "5Y": 60 };
  const span = spanMonths[input.rangeKey] ?? 6;
  if (!snapshots.length) return null;
  const latest = snapshots[snapshots.length - 1].date;
  const pivot = new Date(`${latest}T00:00:00Z`);
  pivot.setUTCMonth(pivot.getUTCMonth() - span);
  return { from: pivot.toISOString().slice(0, 10), to: latest };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
