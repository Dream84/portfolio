import { randomUUID } from "node:crypto";
import type { Database } from "sql.js";
import * as repo from "../repositories/holdingRepo.ts";
import { findCategory } from "../repositories/categoryRepo.ts";

export type SaveHoldingInput = {
  id?: string;
  portfolioId: string;
  accountId: string;
  symbol: string;
  name: string;
  categoryKey: string;
  quantity: number | string;
  costPrice: number | string;
  costOverridden?: boolean;
};

export type SaveResult = { ok: boolean; field?: string; message?: string; id?: string };

const NUMBER_MESSAGE = "请输入大于 0 的数字";

export function saveHolding(db: Database, input: SaveHoldingInput): SaveResult {
  const quantity = Number(input.quantity);
  const costPrice = Number(input.costPrice);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, field: "quantity", message: NUMBER_MESSAGE };
  }
  if (!Number.isFinite(costPrice) || costPrice <= 0) {
    return { ok: false, field: "costPrice", message: NUMBER_MESSAGE };
  }

  const category = findCategory(db, input.categoryKey);
  if (!category) {
    return { ok: false, field: "categoryKey", message: "请选择已存在的二级子分类" };
  }
  if (category.level !== "L2") {
    return { ok: false, field: "categoryKey", message: "持仓必须归属二级子分类" };
  }

  const duplicated = repo.findByAccountSymbol(db, input.accountId, input.symbol);
  if (duplicated && duplicated.id !== input.id) {
    return { ok: false, field: "symbol", message: "该账户已存在此标的持仓" };
  }

  const holding = {
    id: input.id ?? randomUUID(),
    portfolioId: input.portfolioId,
    accountId: input.accountId,
    symbol: input.symbol,
    name: input.name,
    categoryKey: input.categoryKey,
    quantity,
    costPrice,
    costOverridden: Boolean(input.costOverridden),
  };

  if (duplicated) {
    repo.updateHolding(db, holding);
  } else {
    repo.insertHolding(db, holding);
  }
  return { ok: true, id: holding.id };
}

export function listHoldings(db: Database, portfolioId: string) {
  return repo.findByPortfolio(db, portfolioId);
}
