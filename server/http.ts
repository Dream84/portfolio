import http from "node:http";
import type { Database } from "sql.js";
import { buildBreakdown, buildSummary } from "./services/valuationService.ts";
import { addCategory, listCategories, removeCategory } from "./services/categoryService.ts";
import { listHoldings, saveHolding } from "./services/holdingService.ts";
import { listAccountsOfPortfolio } from "./seed.ts";
import { query } from "./db/database.ts";
import { queryAnalytics } from "./services/analyticsService.ts";
import { generateSnapshot, regenerateSnapshots } from "./services/snapshotService.ts";
import { handleShellRoute } from "./routes/shellRoutes.ts";

type Payload = Record<string, unknown>;

function send(res: http.ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(text);
}

async function readBody(req: http.IncomingMessage): Promise<Payload> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Payload;
}

export function createServer(db: Database): http.Server {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const portfolioId = url.searchParams.get("portfolioId") ?? "family";
    try {
      if (req.method === "GET" && url.pathname === "/api/summary") {
        const summary = buildSummary(db, portfolioId);
        return send(res, 200, {
          ...summary,
          accounts: listAccountsOfPortfolio(db, portfolioId),
          holdings: listHoldings(db, portfolioId),
        });
      }
      if (req.method === "GET" && url.pathname === "/api/breakdown") {
        return send(res, 200, { rows: buildBreakdown(db, portfolioId) });
      }
      if (req.method === "GET" && url.pathname === "/api/categories") {
        return send(res, 200, { categories: listCategories(db) });
      }
      if (req.method === "GET" && url.pathname === "/api/analytics") {
        const result = queryAnalytics(db, {
          portfolioId,
          dimension: (url.searchParams.get("dimension") as "PORTFOLIO" | "ACCOUNT") ?? "PORTFOLIO",
          scope: url.searchParams.get("scope") ?? "family",
          l1Key: url.searchParams.get("l1Key") ?? "all",
          l2Key: url.searchParams.get("l2Key") ?? "all",
          rangeKey: (url.searchParams.get("rangeKey") as "6M" | "1Y" | "3Y" | "5Y" | "CUSTOM") ?? "6M",
          start: url.searchParams.get("start") ?? undefined,
          end: url.searchParams.get("end") ?? undefined,
        });
        return send(res, result.ok ? 200 : 400, result);
      }
      if (req.method === "POST" && url.pathname === "/api/snapshots/generate") {
        const body = await readBody(req);
        const result = generateSnapshot(db, {
          accountId: (body.accountId as string) ?? portfolioId,
          date: body.date as string,
        });
        return send(res, result.ok ? 200 : 400, result);
      }
      if (req.method === "POST" && url.pathname === "/api/snapshots/regenerate") {
        const body = await readBody(req);
        const result = regenerateSnapshots(db, {
          accountId: (body.accountId as string) ?? portfolioId,
          dates: (body.dates as string[]) ?? [],
        });
        return send(res, result.ok ? 200 : 409, result);
      }
      if (req.method === "GET" && url.pathname === "/api/quotes") {
        const rows = query(db, "SELECT symbol, kind, price, price_time, is_cache FROM quote ORDER BY symbol");
        return send(res, 200, {
          quotes: rows.map((row) => ({
            symbol: String(row.symbol),
            kind: String(row.kind),
            price: Number(row.price),
            priceTime: String(row.price_time),
            stale: Number(row.is_cache) === 1,
          })),
        });
      }
      if (req.method === "GET" && url.pathname === "/api/holdings") {
        return send(res, 200, { holdings: listHoldings(db, portfolioId) });
      }
      if (req.method === "POST" && url.pathname === "/api/holdings") {
        const body = await readBody(req);
        const result = saveHolding(db, {
          id: body.id as string | undefined,
          portfolioId: (body.portfolioId as string) ?? portfolioId,
          accountId: body.accountId as string,
          symbol: body.symbol as string,
          name: body.name as string,
          categoryKey: body.categoryKey as string,
          quantity: body.quantity as number,
          costPrice: body.costPrice as number,
          costOverridden: Boolean(body.costOverridden),
        });
        return send(res, result.ok ? 200 : 400, result);
      }
      if (req.method === "POST" && url.pathname === "/api/categories/remove") {
        const body = await readBody(req);
        const result = removeCategory(db, body.key as string);
        return send(res, result.ok ? 200 : 409, result);
      }
      if (req.method === "POST" && url.pathname === "/api/categories") {
        const body = await readBody(req);
        const result = addCategory(db, {
          key: body.key as string,
          name: body.name as string,
          level: body.level as "L1" | "L2",
          parentKey: (body.parentKey as string | null) ?? null,
        });
        return send(res, result.ok ? 200 : 400, result);
      }
      if (await handleShellRoute(db, req, res, url, send, readBody)) return undefined;
      return send(res, 404, { message: "接口不存在" });
    } catch (error) {
      return send(res, 500, { message: error instanceof Error ? error.message : String(error) });
    }
  });
}
