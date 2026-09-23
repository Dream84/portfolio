import type { Database } from "sql.js";
import { query, run } from "../db/database.ts";

export type ConvertResult = {
  cny: number;
  rate: number;
  rateTime: string;
  overridden: boolean;
  source: string;
};

export function convertCash(
  db: Database,
  input: { currency: string; amount: number; rate?: number; rateTime?: string; overridden?: boolean },
): ConvertResult {
  if (input.currency === "CNY") {
    return { cny: round2(input.amount), rate: 1, rateTime: input.rateTime ?? "", overridden: false, source: "BASE" };
  }
  let rate = input.rate ?? 0;
  let rateTime = input.rateTime ?? "";
  let source = input.overridden ? "MANUAL" : "SOURCE";
  if (!rate) {
    const rows = query(db, "SELECT rate, rate_time FROM fx_rate WHERE currency=? ORDER BY rate_time DESC LIMIT 1", [
      input.currency,
    ]);
    if (rows.length) {
      rate = Number(rows[0].rate);
      rateTime = String(rows[0].rate_time);
      source = "LAST_SUCCESS";
    }
  }
  if (!rate) {
    return { cny: 0, rate: 0, rateTime, overridden: false, source: "MISSING" };
  }
  return { cny: round2(input.amount * rate), rate, rateTime, overridden: Boolean(input.overridden), source };
}

export function saveFxRate(db: Database, currency: string, rate: number, rateTime: string): void {
  run(db, "INSERT INTO fx_rate (currency, rate, rate_time) VALUES (?,?,?)", [currency, rate, rateTime]);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
