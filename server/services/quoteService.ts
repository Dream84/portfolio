import type { Database } from "sql.js";
import { query, run } from "../db/database.ts";
import { resolveProvider } from "./providerService.ts";
import { writeFetchLog } from "./logService.ts";

export const CACHE_SECONDS = 30;
export const RATE_LIMIT_MS = 1000;
export const FAILURE_HINT_THRESHOLD = 3;

export type RefreshOutcome = {
  ok: boolean;
  code?: string;
  message?: string;
  updated: string[];
  cached: string[];
  failed: string[];
  skippedFunds: string[];
  waitSeconds?: number;
};

export type Fetcher = (input: { symbol: string; url: string }) => Promise<{ price: number; changePct?: number; dataTime?: string }>;

export async function refreshQuotes(
  db: Database,
  input: { fetcher: Fetcher; now?: Date; rateState?: { lastRequestAt: number } },
): Promise<RefreshOutcome> {
  const now = input.now ?? new Date();
  const rateState = input.rateState ?? { lastRequestAt: 0 };
  const symbols = query(db, "SELECT symbol, kind FROM quote WHERE kind='PRICE'");
  const funds = symbols.filter((row) => String(row.kind) === "NAV").map((row) => String(row.symbol));
  const targets = symbols.filter((row) => String(row.kind) === "PRICE").map((row) => String(row.symbol));
  if (!targets.length) {
    return { ok: false, code: "EMPTY_SYMBOL_LIST", message: "暂无可刷新的场内标的", updated: [], cached: [], failed: [], skippedFunds: funds };
  }
  const provider = resolveProvider(db, "QUOTE");
  if (!provider) {
    return { ok: false, code: "SOURCE_UNAVAILABLE", message: "请至少启用一个数据源", updated: [], cached: [], failed: [], skippedFunds: funds };
  }
  const outcome: RefreshOutcome = { ok: true, updated: [], cached: [], failed: [], skippedFunds: funds };
  const pending: Array<{ symbol: string; row: Record<string, unknown> | null }> = [];
  for (const symbol of targets) {
    const state = query(db, "SELECT * FROM refresh_state WHERE symbol=?", [symbol]);
    const row = state.length ? state[0] : null;
    const expiresAt = row?.expires_at ? new Date(String(row.expires_at)) : null;
    if (expiresAt && expiresAt > now) {
      outcome.cached.push(symbol);
      continue;
    }
    pending.push({ symbol, row });
  }
  if (!pending.length) {
    outcome.message = "数据未过期";
    return outcome;
  }
  // 限流以一次刷新批量为单位：同一批内对上游只发起一轮请求
  const elapsed = now.getTime() - rateState.lastRequestAt;
  if (rateState.lastRequestAt && elapsed < RATE_LIMIT_MS) {
    outcome.code = "RATE_LIMITED";
    outcome.waitSeconds = Math.ceil((RATE_LIMIT_MS - elapsed) / 1000);
    outcome.message = `请求频率受限，请等待 ${outcome.waitSeconds} 秒`;
    for (const item of pending) {
      writeFetchLog(db, { level: "ERROR", symbol: item.symbol, message: outcome.message }, now);
    }
    return outcome;
  }
  rateState.lastRequestAt = now.getTime();

  for (const { symbol, row } of pending) {
    try {
      const quoted = await input.fetcher({ symbol, url: String(provider.url) });
      run(db, "INSERT INTO quote (symbol, kind, price, price_time, is_cache) VALUES (?, 'PRICE', ?, ?, 0) ON CONFLICT(symbol) DO UPDATE SET price=excluded.price, price_time=excluded.price_time, is_cache=0", [
        symbol,
        quoted.price,
        quoted.dataTime ?? now.toISOString(),
      ]);
      run(
        db,
        "INSERT INTO refresh_state (symbol, last_request_at, expires_at, is_cache, data_time, failure_reason, consecutive_failures) VALUES (?,?,?,0,?,NULL,0) ON CONFLICT(symbol) DO UPDATE SET last_request_at=excluded.last_request_at, expires_at=excluded.expires_at, is_cache=0, data_time=excluded.data_time, failure_reason=NULL, consecutive_failures=0",
        [symbol, now.toISOString(), new Date(now.getTime() + CACHE_SECONDS * 1000).toISOString(), quoted.dataTime ?? now.toISOString()],
      );
      outcome.updated.push(symbol);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const failures = Number(row?.consecutive_failures ?? 0) + 1;
      run(
        db,
        "INSERT INTO refresh_state (symbol, last_request_at, expires_at, is_cache, data_time, failure_reason, consecutive_failures) VALUES (?,?,?,1,?,?,?) ON CONFLICT(symbol) DO UPDATE SET is_cache=1, failure_reason=excluded.failure_reason, consecutive_failures=excluded.consecutive_failures",
        [symbol, now.toISOString(), null, row?.data_time ?? null, reason, failures],
      );
      writeFetchLog(db, { level: "ERROR", symbol, message: reason }, now);
      outcome.failed.push(symbol);
      outcome.code = "UPSTREAM_ERROR";
      outcome.message = reason;
      if (failures >= FAILURE_HINT_THRESHOLD) {
        outcome.message = `已连续 ${FAILURE_HINT_THRESHOLD} 次刷新失败，请检查本机网络与数据源配置`;
      }
    }
  }
  if (!outcome.failed.length && !outcome.updated.length && outcome.cached.length) outcome.message = "数据未过期";
  return outcome;
}

export function cachedDataTime(db: Database, symbol: string): { dataTime: string | null; isCache: boolean; reason: string | null } {
  const rows = query(db, "SELECT data_time, is_cache, failure_reason FROM refresh_state WHERE symbol=?", [symbol]);
  if (!rows.length) return { dataTime: null, isCache: false, reason: null };
  return {
    dataTime: rows[0].data_time ? String(rows[0].data_time) : null,
    isCache: Number(rows[0].is_cache) === 1,
    reason: rows[0].failure_reason ? String(rows[0].failure_reason) : null,
  };
}