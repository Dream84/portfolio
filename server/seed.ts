import type { Database } from "sql.js";
import { run } from "./db/database.ts";
import { insertCategory } from "./repositories/categoryRepo.ts";
import { insertHolding } from "./repositories/holdingRepo.ts";

const L1: Array<[string, string, string, boolean]> = [
  ["stock", "股票", "chart-1", true],
  ["fund", "基金", "chart-2", true],
  ["gold", "黄金", "chart-3", true],
  ["cash", "现金", "chart-4", true],
];

const L2: Array<[string, string, string]> = [
  ["stock-a", "A股主板", "stock"],
  ["fund-bond", "债券基金", "fund"],
  ["fund-equity", "股票基金", "fund"],
  ["gold-etf", "黄金ETF", "gold"],
];

export function seedCategories(db: Database): void {
  L1.forEach(([key, name, color, preset], index) => {
    insertCategory(db, { key, name, level: "L1", parentKey: null, preset, colorToken: color, sortOrder: index + 1 });
  });
  L2.forEach(([key, name, parent], index) => {
    insertCategory(db, {
      key,
      name,
      level: "L2",
      parentKey: parent,
      preset: true,
      colorToken: `chart-${index + 5}`,
      sortOrder: L1.length + index + 1,
    });
  });
}

export function seedAccounts(db: Database): void {
  run(db, "INSERT INTO account (id, name, account_type, status) VALUES (?,?,?,?)", ["zhaoshang", "招商证券", "BROKER", "ENABLED"]);
  run(db, "INSERT INTO account (id, name, account_type, status) VALUES (?,?,?,?)", ["tiantian", "天天基金", "FUND_PLATFORM", "ENABLED"]);
  run(
    db,
    "INSERT INTO cash_account (id, account_id, name, currency, amount_original, fx_rate, fx_rate_time, fx_overridden) VALUES (?,?,?,?,?,?,?,?)",
    ["cny-main", "zhaoshang", "招商证券现金", "CNY", 15000, 1, "2026-09-18 15:00", 0],
  );
  run(
    db,
    "INSERT INTO cash_account (id, account_id, name, currency, amount_original, fx_rate, fx_rate_time, fx_overridden) VALUES (?,?,?,?,?,?,?,?)",
    ["usd-main", "zhaoshang", "美元现金", "USD", 2000, 6.6956, "2026-09-18 15:00", 0],
  );
  run(db, "INSERT INTO portfolio (id, name) VALUES (?,?)", ["family", "家庭总仓"]);
  run(db, "INSERT INTO portfolio_account (portfolio_id, account_id) VALUES (?,?)", ["family", "zhaoshang"]);
  run(db, "INSERT INTO portfolio_account (portfolio_id, account_id) VALUES (?,?)", ["family", "tiantian"]);
}

export function seedHoldings(db: Database): void {
  insertHolding(db, { id: "h-600519", portfolioId: "family", accountId: "zhaoshang", symbol: "600519", name: "贵州茅台", categoryKey: "stock-a", quantity: 100, costPrice: 1200, costOverridden: false });
  insertHolding(db, { id: "h-518880", portfolioId: "family", accountId: "zhaoshang", symbol: "518880", name: "黄金ETF华安", categoryKey: "gold-etf", quantity: 5000, costPrice: 8.42, costOverridden: false });
  insertHolding(db, { id: "h-004400", portfolioId: "family", accountId: "tiantian", symbol: "004400", name: "金信民兴债券A", categoryKey: "fund-bond", quantity: 20000, costPrice: 1.05, costOverridden: true });
}

export function seedQuotes(db: Database): void {
  run(db, "INSERT INTO quote (symbol, kind, price, price_time, is_cache) VALUES (?,?,?,?,?)", ["600519", "PRICE", 1254.75, "2026-09-18 15:00", 0]);
  run(db, "INSERT INTO quote (symbol, kind, price, price_time, is_cache) VALUES (?,?,?,?,?)", ["518880", "PRICE", 8.941, "2026-09-18 15:00", 0]);
  run(db, "INSERT INTO quote (symbol, kind, price, price_time, is_cache) VALUES (?,?,?,?,?)", ["004400", "NAV", 1.0743, "2026-09-18", 1]);
}

const SNAPSHOT_SERIES: Array<[string, number, number]> = [
  ["2026-09-01", 201480.0, 1.2],
  ["2026-09-02", 202350.0, 1.63],
  ["2026-09-03", 201760.0, 1.34],
  ["2026-09-04", 203640.0, 2.28],
  ["2026-09-08", 204510.0, 2.72],
  ["2026-09-09", 203980.0, 2.45],
  ["2026-09-10", 205260.0, 3.09],
  ["2026-09-15", 205970.0, 3.45],
  ["2026-09-16", 206120.0, 3.52],
  ["2026-09-17", 205640.0, 3.28],
  ["2026-09-18", 206666.0, 3.8],
];

export function seedSnapshots(db: Database): void {
  SNAPSHOT_SERIES.forEach(([date, value, rate], index) => {
    run(
      db,
      "INSERT INTO snapshot (id, account_id, snapshot_date, dimension_type, total_value, net_investment, cumulative_return) VALUES (?,?,?,?,?,?,?)",
      [`snap-${index + 1}`, "family", date, "PORTFOLIO", value, 199100, rate],
    );
  });
}

export function expectedSnapshotDates(): string[] {
  return SNAPSHOT_SERIES.map(([date]) => date);
}

export function seedAll(db: Database): void {
  seedCategories(db);
  seedAccounts(db);
  seedHoldings(db);
  seedQuotes(db);
  seedSnapshots(db);
}

export function listAccountsOfPortfolio(db: Database, portfolioId: string): string[] {
  const rows: string[] = [];
  const stmt = db.prepare("SELECT account_id FROM portfolio_account WHERE portfolio_id=?");
  stmt.bind([portfolioId]);
  while (stmt.step()) rows.push(String(stmt.getAsObject().account_id));
  stmt.free();
  return rows;
}
