import { randomUUID } from "node:crypto";
import type { Database } from "sql.js";
import { query, run } from "../db/database.ts";
import { buildSummary } from "./valuationService.ts";

export type SnapshotRow = {
  id: string;
  accountId: string;
  snapshotDate: string;
  dimensionType: string;
  totalValue: number;
  netInvestment: number;
  cumulativeReturn: number;
};

export type GenerateResult = { ok: boolean; id?: string; message?: string };

export function generateSnapshot(
  db: Database,
  input: { accountId: string; date: string; dimensionType?: string },
): GenerateResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return { ok: false, message: `快照日期格式非法：${input.date}` };
  }
  const dimensionType = input.dimensionType ?? "PORTFOLIO";
  const summary = buildSummary(db, input.accountId);
  const netInvestment = round2(summary.totalCost + summary.cashValue);
  const cumulativeReturn = netInvestment > 0 ? round4(((summary.totalValue - netInvestment) / netInvestment) * 100) : 0;

  run(db, "DELETE FROM snapshot WHERE account_id=? AND snapshot_date=? AND dimension_type=?", [
    input.accountId,
    input.date,
    dimensionType,
  ]);
  const id = randomUUID();
  run(
    db,
    "INSERT INTO snapshot (id, account_id, snapshot_date, dimension_type, total_value, net_investment, cumulative_return) VALUES (?,?,?,?,?,?,?)",
    [id, input.accountId, input.date, dimensionType, summary.totalValue, netInvestment, cumulativeReturn],
  );
  return { ok: true, id };
}

export function listSnapshots(db: Database, accountId: string, dimensionType = "PORTFOLIO"): SnapshotRow[] {
  return query(
    db,
    "SELECT * FROM snapshot WHERE account_id=? AND dimension_type=? ORDER BY snapshot_date",
    [accountId, dimensionType],
  ).map((row) => ({
    id: String(row.id),
    accountId: String(row.account_id),
    snapshotDate: String(row.snapshot_date),
    dimensionType: String(row.dimension_type),
    totalValue: Number(row.total_value),
    netInvestment: Number(row.net_investment),
    cumulativeReturn: Number(row.cumulative_return),
  }));
}

export function findMissingDates(
  db: Database,
  accountId: string,
  dates: string[],
  dimensionType = "PORTFOLIO",
): string[] {
  const existing = new Set(listSnapshots(db, accountId, dimensionType).map((row) => row.snapshotDate));
  return dates.filter((date) => !existing.has(date));
}

export function regenerateSnapshots(
  db: Database,
  input: { accountId: string; dates: string[] },
): { ok: boolean; regenerated: string[]; failed: string[] } {
  const regenerated: string[] = [];
  const failed: string[] = [];
  for (const date of input.dates) {
    const result = generateSnapshot(db, { accountId: input.accountId, date });
    if (result.ok) regenerated.push(date);
    else failed.push(date);
  }
  return { ok: failed.length === 0, regenerated, failed };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
