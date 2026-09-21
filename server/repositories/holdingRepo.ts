import type { Database } from "sql.js";
import { query, run, type Row } from "../db/database.ts";

export type HoldingRow = {
  id: string;
  portfolioId: string;
  accountId: string;
  symbol: string;
  name: string;
  categoryKey: string;
  quantity: number;
  costPrice: number;
  costOverridden: boolean;
};

const map = (row: Row): HoldingRow => ({
  id: String(row.id),
  portfolioId: String(row.portfolio_id),
  accountId: String(row.account_id),
  symbol: String(row.symbol),
  name: String(row.name),
  categoryKey: String(row.category_key),
  quantity: Number(row.quantity),
  costPrice: Number(row.cost_price),
  costOverridden: Number(row.cost_overridden) === 1,
});

export function insertHolding(db: Database, holding: HoldingRow): void {
  run(
    db,
    "INSERT INTO holding (id, portfolio_id, account_id, symbol, name, category_key, quantity, cost_price, cost_overridden) VALUES (?,?,?,?,?,?,?,?,?)",
    [
      holding.id,
      holding.portfolioId,
      holding.accountId,
      holding.symbol,
      holding.name,
      holding.categoryKey,
      holding.quantity,
      holding.costPrice,
      holding.costOverridden ? 1 : 0,
    ],
  );
}

export function updateHolding(db: Database, holding: HoldingRow): void {
  run(
    db,
    "UPDATE holding SET name=?, category_key=?, quantity=?, cost_price=?, cost_overridden=? WHERE id=?",
    [
      holding.name,
      holding.categoryKey,
      holding.quantity,
      holding.costPrice,
      holding.costOverridden ? 1 : 0,
      holding.id,
    ],
  );
}

export function findByPortfolio(db: Database, portfolioId: string): HoldingRow[] {
  return query(db, "SELECT * FROM holding WHERE portfolio_id=? ORDER BY symbol", [portfolioId]).map(map);
}

export function findByAccountSymbol(db: Database, accountId: string, symbol: string): HoldingRow | null {
  const rows = query(db, "SELECT * FROM holding WHERE account_id=? AND symbol=?", [accountId, symbol]);
  return rows.length ? map(rows[0]) : null;
}

export function findById(db: Database, id: string): HoldingRow | null {
  const rows = query(db, "SELECT * FROM holding WHERE id=?", [id]);
  return rows.length ? map(rows[0]) : null;
}

export function countByCategoryKey(db: Database, categoryKey: string): number {
  const rows = query(db, "SELECT COUNT(*) AS c FROM holding WHERE category_key=?", [categoryKey]);
  return rows.length ? Number(rows[0].c) : 0;
}
