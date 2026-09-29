import type http from "node:http";
import type { Database } from "sql.js";
import { login, logout } from "../auth/session.ts";
import { query } from "../db/database.ts";
import { listCashAccounts, saveCashAccount, cashTotalCny } from "../services/cashAccountService.ts";
import { deleteTrade, listTrades, saveTrade, transfer, undoDelete, updateTrade } from "../services/tradeService.ts";
import { listProviders, probeProvider, saveProvider, setRefreshInterval, getRefreshInterval } from "../services/providerService.ts";
import { refreshQuotes } from "../services/quoteService.ts";
import { adjustSeries, refreshFundNav, saveNav } from "../services/navService.ts";
import { listFetchLogs } from "../services/logService.ts";
import { getTheme, setTheme } from "../services/preferenceService.ts";
import { listBackups, runBackup } from "../services/backupService.ts";

type Payload = Record<string, unknown>;
type Send = (res: http.ServerResponse, status: number, body: unknown) => void;

const rateState = { lastRequestAt: 0 };

export async function handleShellRoute(
  db: Database,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  send: Send,
  readBody: (req: http.IncomingMessage) => Promise<Payload>,
): Promise<boolean> {
  const path = url.pathname;

  if (req.method === "POST" && path === "/api/auth/login") {
    const body = await readBody(req);
    const result = login(db, String(body.accountName ?? ""), String(body.password ?? ""));
    return bool(send, res, result, 200, 401);
  }
  if (req.method === "POST" && path === "/api/auth/logout") {
    const body = await readBody(req);
    logout(db, String(body.token ?? ""));
    return bool(send, res, { ok: true }, 200, 200);
  }
  if (req.method === "GET" && path === "/api/accounts") {
    return bool(send, res, { rows: query(db, "SELECT id, name, account_type, status FROM account ORDER BY name") }, 200, 200);
  }
  if (req.method === "GET" && path === "/api/cash-accounts") {
    return bool(send, res, { rows: listCashAccounts(db), totalCny: cashTotalCny(db) }, 200, 200);
  }
  if (req.method === "POST" && path === "/api/cash-accounts") {
    const body = await readBody(req);
    const result = saveCashAccount(db, {
      accountId: String(body.accountId ?? ""),
      name: String(body.name ?? ""),
      currency: String(body.currency ?? "CNY"),
      amount: Number(body.amount ?? 0),
      rate: body.rate === undefined || body.rate === "" ? undefined : Number(body.rate),
      rateTime: body.rateTime ? String(body.rateTime) : undefined,
      overridden: Boolean(body.overridden),
    });
    return bool(send, res, result, 200, 400);
  }
  if (req.method === "GET" && path === "/api/trades") {
    return bool(send, res, { rows: listTrades(db, url.searchParams.get("portfolioId") ?? "family") }, 200, 200);
  }
  if (req.method === "POST" && path === "/api/trades") {
    const body = await readBody(req);
    const result = saveTrade(db, {
      portfolioId: String(body.portfolioId ?? "family"),
      accountId: String(body.accountId ?? ""),
      cashAccountId: body.cashAccountId ? String(body.cashAccountId) : undefined,
      symbol: body.symbol ? String(body.symbol) : undefined,
      name: body.name ? String(body.name) : undefined,
      tradeType: String(body.tradeType ?? "BUY") as never,
      tradeDate: String(body.tradeDate ?? ""),
      amount: Number(body.amount ?? 0),
      quantity: body.quantity === undefined || body.quantity === "" ? undefined : Number(body.quantity),
      price: body.price === undefined || body.price === "" ? undefined : Number(body.price),
      fee: body.fee === undefined || body.fee === "" ? 0 : Number(body.fee),
      feeMode: (body.feeMode as never) ?? "INTO_COST",
    });
    return bool(send, res, result, 200, 400);
  }
  if (req.method === "POST" && path === "/api/trades/transfer") {
    const body = await readBody(req);
    const result = transfer(db, {
      portfolioId: String(body.portfolioId ?? "family"),
      accountId: String(body.accountId ?? ""),
      fromCashAccountId: String(body.fromCashAccountId ?? ""),
      toCashAccountId: String(body.toCashAccountId ?? ""),
      amount: Number(body.amount ?? 0),
      tradeDate: String(body.tradeDate ?? ""),
    });
    return bool(send, res, result, 200, 400);
  }
  if (req.method === "POST" && path === "/api/trades/update") {
    const body = await readBody(req);
    const result = updateTrade(db, { id: String(body.id ?? ""), version: Number(body.version ?? 1), amount: Number(body.amount ?? 0) });
    return bool(send, res, result, 200, 409);
  }
  if (req.method === "POST" && path === "/api/trades/delete") {
    const body = await readBody(req);
    const result = deleteTrade(db, { id: String(body.id ?? "") });
    return bool(send, res, result, 200, 400);
  }
  if (req.method === "POST" && path === "/api/trades/undo") {
    const body = await readBody(req);
    const result = undoDelete(db, String(body.id ?? ""));
    return bool(send, res, result, 200, 400);
  }
  if (req.method === "GET" && path === "/api/providers") {
    const interval = getRefreshInterval(db);
    return bool(send, res, { rows: listProviders(db), refreshIntervalSeconds: interval.seconds, message: interval.message }, 200, 200);
  }
  if (req.method === "POST" && path === "/api/providers") {
    const body = await readBody(req);
    const result = saveProvider(db, {
      id: body.id ? String(body.id) : undefined,
      name: String(body.name ?? ""),
      kind: String(body.kind ?? "QUOTE"),
      priority: Number(body.priority ?? 1),
      enabled: Boolean(body.enabled),
      timeoutSeconds: body.timeoutSeconds === undefined ? undefined : Number(body.timeoutSeconds),
    });
    return bool(send, res, result, 200, 400);
  }
  if (req.method === "POST" && path === "/api/providers/probe") {
    const body = await readBody(req);
    const rows = query(db, "SELECT url, timeout_seconds FROM provider WHERE id=?", [String(body.id ?? "")]);
    const timeout = Number(rows.length ? rows[0].timeout_seconds : 3) * 1000;
    const target = rows.length ? String(rows[0].url) : "";
    const result = await probeProvider(
      db,
      String(body.id ?? ""),
      async () => {
        if (!target) throw new Error("数据源地址为空");
        await fetch(target, { signal: AbortSignal.timeout(timeout) });
      },
    );
    return bool(send, res, result, 200, 200);
  }
  if (req.method === "POST" && path === "/api/providers/interval") {
    const body = await readBody(req);
    const result = setRefreshInterval(db, Number(body.seconds ?? 60));
    return bool(send, res, result, 200, 200);
  }
  if (req.method === "POST" && path === "/api/refresh/quotes") {
    const result = await refreshQuotes(db, {
      fetcher: async ({ url: target }) => {
        const response = await fetch(target, { signal: AbortSignal.timeout(3000) });
        if (!response.ok) throw new Error(`上游返回 ${response.status}`);
        return { price: 0, dataTime: new Date().toISOString() };
      },
      rateState,
    });
    return bool(send, res, { ...result, logs: listFetchLogs(db, "ERROR").slice(-5) }, 200, 200);
  }
  if (req.method === "POST" && path === "/api/funds/nav") {
    const body = await readBody(req);
    const symbol = String(body.symbol ?? "000001.OF");
    if (body.unitNav) {
      saveNav(db, { symbol, navDate: String(body.navDate ?? ""), unitNav: Number(body.unitNav) });
    }
    const result = refreshFundNav(db, { symbol, today: String(body.today ?? new Date().toISOString().slice(0, 10)) });
    const series = adjustSeries(db, symbol);
    return bool(send, res, { ...result, series: { filteredCount: series.filteredCount, message: series.message } }, 200, 200);
  }
  if (req.method === "GET" && path === "/api/logs") {
    return bool(send, res, { rows: listFetchLogs(db) }, 200, 200);
  }
  if (req.method === "GET" && path === "/api/preference") {
    return bool(send, res, { theme: getTheme(db) }, 200, 200);
  }
  if (req.method === "POST" && path === "/api/preference") {
    const body = await readBody(req);
    const result = setTheme(db, String(body.theme ?? ""));
    return bool(send, res, result, 200, 400);
  }
  if (req.method === "GET" && path === "/api/backups") {
    return bool(send, res, { rows: listBackups(db) }, 200, 200);
  }
  if (req.method === "POST" && path === "/api/backups") {
    const result = runBackup(db, String((await readBody(req)).dir ?? "data/backups"));
    return bool(send, res, result, 200, 400);
  }
  return false;
}

function bool(send: Send, res: http.ServerResponse, result: { ok: boolean }, okStatus: number, failStatus: number): boolean {
  send(res, result.ok ? okStatus : failStatus, result);
  return true;
}
