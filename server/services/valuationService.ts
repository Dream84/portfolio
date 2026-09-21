import type { Database } from "sql.js";
import { query, type Row } from "../db/database.ts";
import * as holdingRepo from "../repositories/holdingRepo.ts";
import * as categoryRepo from "../repositories/categoryRepo.ts";

export type QuoteInfo = { price: number; priceTime: string; stale: boolean; kind: string };

export type CategoryShare = {
  key: string;
  name: string;
  colorToken: string;
  value: number;
  share: number;
  pnl: number;
};

export type BreakdownChild = {
  key: string;
  name: string;
  value: number;
  pnl: number;
  shareOfTotal: number;
  shareOfParent: number;
};

export type BreakdownRow = {
  key: string;
  name: string;
  value: number;
  pnl: number;
  shareOfTotal: number;
  children: BreakdownChild[];
};

export type Summary = {
  totalValue: number;
  totalCost: number;
  floatingPnl: number;
  cashValue: number;
  dataTime: string;
  stale: boolean;
  staleCount: number;
  shares: CategoryShare[];
  shareTotal: number;
};

export function findQuote(db: Database, symbol: string): QuoteInfo | null {
  const rows = query(db, "SELECT * FROM quote WHERE symbol=?", [symbol]);
  if (!rows.length) return null;
  const row: Row = rows[0];
  return {
    price: Number(row.price),
    priceTime: String(row.price_time),
    stale: Number(row.is_cache) === 1,
    kind: String(row.kind),
  };
}

export function cashValueCny(db: Database, portfolioId: string): number {
  const rows = query(
    db,
    "SELECT c.amount_original, c.fx_rate FROM cash_account c JOIN portfolio_account pa ON pa.account_id = c.account_id WHERE pa.portfolio_id=?",
    [portfolioId],
  );
  const total = rows.reduce((sum, row) => sum + Number(row.amount_original) * Number(row.fx_rate), 0);
  return round2(total);
}

export function buildSummary(db: Database, portfolioId: string): Summary {
  const holdings = holdingRepo.findByPortfolio(db, portfolioId);
  const categories = categoryRepo.listCategories(db);

  const l1Of = (categoryKey: string) => {
    const target = categories.find((item) => item.key === categoryKey);
    if (!target) return null;
    return target.level === "L1" ? target : categories.find((item) => item.key === target.parentKey) ?? null;
  };

  const map = new Map<string, CategoryShare>();
  let totalCost = 0;
  let staleCount = 0;
  let dataTime = "";

  for (const holding of holdings) {
    const quote = findQuote(db, holding.symbol);
    if (!quote) continue;
    const value = holding.quantity * quote.price;
    totalCost += holding.quantity * holding.costPrice;
    const l1 = l1Of(holding.categoryKey);
    if (!l1) continue;
    const current = map.get(l1.key) ?? {
      key: l1.key,
      name: l1.name,
      colorToken: l1.colorToken,
      value: 0,
      share: 0,
      pnl: 0,
    };
    current.value = round2(current.value + value);
    current.pnl = round2(current.pnl + holding.quantity * (quote.price - holding.costPrice));
    map.set(l1.key, current);
    if (quote.stale) staleCount += 1;
    dataTime = dataTime === "" || quote.priceTime > dataTime ? quote.priceTime : dataTime;
  }

  const cash = cashValueCny(db, portfolioId);
  const cashCategory = categories.find((item) => item.key === "cash");
  if (cashCategory && cash > 0) {
    const current = map.get(cashCategory.key) ?? {
      key: cashCategory.key,
      name: cashCategory.name,
      colorToken: cashCategory.colorToken,
      value: 0,
      share: 0,
      pnl: 0,
    };
    current.value = round2(current.value + cash);
    map.set(cashCategory.key, current);
  }

  const shares = Array.from(map.values()).sort((a, b) => b.value - a.value);
  const totalValue = round2(shares.reduce((sum, item) => sum + item.value, 0));
  shares.forEach((item) => {
    item.share = totalValue > 0 ? round2((item.value / totalValue) * 100) : 0;
  });
  const shareTotal = round2(shares.reduce((sum, item) => sum + item.share, 0));

  return {
    totalValue,
    totalCost: round2(totalCost),
    floatingPnl: round2(totalValue - cash - totalCost),
    cashValue: cash,
    dataTime,
    stale: staleCount > 0,
    staleCount,
    shares,
    shareTotal,
  };
}

export function buildBreakdown(db: Database, portfolioId: string): BreakdownRow[] {
  const holdings = holdingRepo.findByPortfolio(db, portfolioId);
  const categories = categoryRepo.listCategories(db);
  const summary = buildSummary(db, portfolioId);
  const totalValue = summary.totalValue;

  const rows: BreakdownRow[] = [];
  for (const l1 of categories.filter((item) => item.level === "L1")) {
    const children = categories.filter((item) => item.parentKey === l1.key);
    const childRows: BreakdownChild[] = [];
    let parentValue = 0;
    let parentPnl = 0;

    if (children.length === 0) {
      if (l1.key === "cash") {
        parentValue = summary.cashValue;
      } else {
        parentValue = round2(
          holdings
            .filter((item) => item.categoryKey === l1.key)
            .reduce((sum, item) => sum + item.quantity * (findQuote(db, item.symbol)?.price ?? 0), 0),
        );
      }
      rows.push({
        key: l1.key,
        name: l1.name,
        value: parentValue,
        pnl: 0,
        shareOfTotal: totalValue > 0 ? round2((parentValue / totalValue) * 100) : 0,
        children: [],
      });
      continue;
    }

    for (const child of children) {
      const childHoldings = holdings.filter((item) => item.categoryKey === child.key);
      const value = round2(
        childHoldings.reduce((sum, item) => sum + item.quantity * (findQuote(db, item.symbol)?.price ?? 0), 0),
      );
      const pnl = round2(
        childHoldings.reduce(
          (sum, item) => sum + item.quantity * ((findQuote(db, item.symbol)?.price ?? 0) - item.costPrice),
          0,
        ),
      );
      parentValue = round2(parentValue + value);
      parentPnl = round2(parentPnl + pnl);
      childRows.push({ key: child.key, name: child.name, value, pnl, shareOfTotal: 0, shareOfParent: 0 });
    }

    childRows.forEach((child) => {
      child.shareOfTotal = totalValue > 0 ? round2((child.value / totalValue) * 100) : 0;
      child.shareOfParent = parentValue > 0 ? round2((child.value / parentValue) * 100) : 0;
    });

    rows.push({
      key: l1.key,
      name: l1.name,
      value: parentValue,
      pnl: parentPnl,
      shareOfTotal: totalValue > 0 ? round2((parentValue / totalValue) * 100) : 0,
      children: childRows,
    });
  }

  return rows.sort((a, b) => b.value - a.value);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
