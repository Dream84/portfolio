import { randomUUID } from "node:crypto";
import type { Database } from "sql.js";
import { query, run } from "../db/database.ts";
import { writeAudit } from "./auditService.ts";

export const UNDO_MINUTES = 5;

export type TradeType =
  | "BUY"
  | "SELL"
  | "DIVIDEND_CASH"
  | "DIVIDEND_REINVEST"
  | "INCOME"
  | "EXPENSE"
  | "TRANSFER_OUT"
  | "TRANSFER_IN";

export type TradeInput = {
  id?: string;
  portfolioId: string;
  accountId: string;
  cashAccountId?: string;
  symbol?: string;
  name?: string;
  tradeType: TradeType;
  tradeDate: string;
  amount: number;
  quantity?: number;
  price?: number;
  fee?: number;
  feeMode?: "INTO_COST" | "OFFSET_PNL";
  version?: number;
  actor?: string;
};

export type TradeResult = {
  ok: boolean;
  id?: string;
  message?: string;
  field?: string;
  realizedPnl?: number;
  records?: string[];
  undoExpiresAt?: string;
};

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function cashOf(db: Database, cashAccountId: string): { amount: number; rate: number } | null {
  const rows = query(db, "SELECT amount_original, fx_rate FROM cash_account WHERE id=?", [cashAccountId]);
  if (!rows.length) return null;
  return { amount: Number(rows[0].amount_original), rate: Number(rows[0].fx_rate) };
}

function setCash(db: Database, cashAccountId: string, amount: number): void {
  run(db, "UPDATE cash_account SET amount_original=? WHERE id=?", [round(amount), cashAccountId]);
}

function holdingOf(db: Database, accountId: string, symbol: string): { id: string; quantity: number; cost: number } | null {
  const rows = query(db, "SELECT id, quantity, cost_price FROM holding WHERE account_id=? AND symbol=?", [accountId, symbol]);
  if (!rows.length) return null;
  return { id: String(rows[0].id), quantity: Number(rows[0].quantity), cost: Number(rows[0].cost_price) };
}

function upsertHolding(
  db: Database,
  input: { id?: string; portfolioId: string; accountId: string; symbol: string; name: string; quantity: number; costPrice: number; categoryKey: string },
): void {
  const existing = holdingOf(db, input.accountId, input.symbol);
  if (existing) {
    run(db, "UPDATE holding SET quantity=?, cost_price=? WHERE id=?", [round(input.quantity, 4), round(input.costPrice, 4), existing.id]);
    return;
  }
  run(
    db,
    "INSERT INTO holding (id, portfolio_id, account_id, symbol, name, category_key, quantity, cost_price, cost_overridden) VALUES (?,?,?,?,?,?,?,?,0)",
    [
      input.id ?? randomUUID(),
      input.portfolioId,
      input.accountId,
      input.symbol,
      input.name,
      input.categoryKey,
      round(input.quantity, 4),
      round(input.costPrice, 4),
    ],
  );
}

function defaultCategory(db: Database, symbol: string): string {
  const byKind = query(db, "SELECT kind FROM quote WHERE symbol=?", [symbol]);
  const kind = byKind.length ? String(byKind[0].kind) : "";
  const wanted = kind === "NAV" ? "%基金%" : symbol.startsWith("5") ? "%黄金%" : "%股票%";
  const matched = query(db, "SELECT key FROM category WHERE level='L1' AND name LIKE ? ORDER BY sort_order LIMIT 1", [wanted]);
  if (matched.length) return String(matched[0].key);
  const fallback = query(db, "SELECT key FROM category WHERE level='L1' ORDER BY sort_order LIMIT 1");
  return fallback.length ? String(fallback[0].key) : "stock-a";
}

function setHoldingQuantity(db: Database, holdingId: string, quantity: number): void {
  if (quantity <= 0) {
    run(db, "DELETE FROM holding WHERE id=?", [holdingId]);
    return;
  }
  run(db, "UPDATE holding SET quantity=? WHERE id=?", [round(quantity, 4), holdingId]);
}

function insertTrade(db: Database, trade: Record<string, unknown>): string {
  const id = String(trade.id ?? randomUUID());
  run(
    db,
    "INSERT INTO trade (id, portfolio_id, account_id, cash_account_id, symbol, name, trade_type, trade_date, amount, quantity, price, fee, fee_mode, realized_pnl, transfer_group_id, version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [
      id,
      trade.portfolio_id ?? trade.portfolioId ?? "",
      trade.account_id ?? trade.accountId ?? "",
      trade.cash_account_id ?? trade.cashAccountId ?? null,
      trade.symbol ?? null,
      trade.name ?? null,
      trade.trade_type ?? trade.tradeType ?? "",
      trade.trade_date ?? trade.tradeDate ?? "",
      trade.amount,
      trade.quantity ?? null,
      trade.price ?? null,
      trade.fee ?? 0,
      trade.fee_mode ?? trade.feeMode ?? "INTO_COST",
      trade.realized_pnl ?? null,
      trade.transfer_group_id ?? null,
      trade.version ?? 1,
    ],
  );
  return id;
}

export function saveTrade(db: Database, input: TradeInput, now = new Date()): TradeResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.tradeDate) || input.tradeDate > now.toISOString().slice(0, 10)) {
    return { ok: false, field: "tradeDate", message: "成交日期不得晚于当前日期" };
  }
  const fee = input.fee ?? 0;
  if (!(fee >= 0)) return { ok: false, field: "fee", message: "请输入不小于 0 的手续费" };

  if (input.tradeType === "BUY") {
    const quantity = Number(input.quantity ?? 0);
    const price = Number(input.price ?? 0);
    if (!(quantity > 0)) return { ok: false, field: "quantity", message: "请输入大于 0 的数字" };
    if (!(price > 0)) return { ok: false, field: "price", message: "请输入大于 0 的数字" };
    const cash = input.cashAccountId ? cashOf(db, input.cashAccountId) : null;
    if (!cash) return { ok: false, field: "cashAccountId", message: "请选择付款现金账户" };
    const cost = round(quantity * price + fee, 2);
    if (cost > cash.amount) {
      return { ok: false, field: "cashAccountId", message: "现金账户余额不足" };
    }
    db.run("BEGIN");
    try {
      setCash(db, input.cashAccountId as string, cash.amount - cost);
      const existing = holdingOf(db, input.accountId, input.symbol ?? "");
      const feeMode = input.feeMode ?? "INTO_COST";
      const addedCost = feeMode === "INTO_COST" ? fee : 0;
      const newQty = round((existing?.quantity ?? 0) + quantity, 4);
      const newCost = round(
        (((existing?.quantity ?? 0) * (existing?.cost ?? 0)) + quantity * price + addedCost) / newQty,
        4,
      );
      upsertHolding(db, {
        portfolioId: input.portfolioId,
        accountId: input.accountId,
        symbol: input.symbol ?? "",
        name: input.name ?? input.symbol ?? "",
        quantity: newQty,
        costPrice: newCost,
        categoryKey: defaultCategory(db, input.symbol ?? ""),
      });
      const id = insertTrade(db, { ...input, cash_account_id: input.cashAccountId, fee, fee_mode: feeMode, amount: round(quantity * price, 2) });
      db.run("COMMIT");
      writeAudit(db, { actor: input.actor ?? "system", action: "TRADE_BUY", target: id, after: { cost } }, now);
      return { ok: true, id };
    } catch (error) {
      db.run("ROLLBACK");
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  if (input.tradeType === "SELL") {
    const quantity = Number(input.quantity ?? 0);
    const price = Number(input.price ?? 0);
    if (!(quantity > 0) || !(price > 0)) return { ok: false, field: "quantity", message: "请输入大于 0 的数字" };
    const holding = holdingOf(db, input.accountId, input.symbol ?? "");
    if (!holding || quantity > holding.quantity) {
      return { ok: false, field: "quantity", message: "卖出份额超过可用份额" };
    }
    const cash = input.cashAccountId ? cashOf(db, input.cashAccountId) : null;
    if (!cash) return { ok: false, field: "cashAccountId", message: "请选择收款现金账户" };
    const gross = round(quantity * price, 2);
    const realized = round(quantity * (price - holding.cost) - fee, 2);
    db.run("BEGIN");
    try {
      setCash(db, input.cashAccountId as string, cash.amount + gross - fee);
      setHoldingQuantity(db, holding.id, round(holding.quantity - quantity, 4));
      const id = insertTrade(db, {
        ...input,
        cash_account_id: input.cashAccountId,
        fee,
        amount: gross,
        realized_pnl: realized,
      });
      db.run("COMMIT");
      writeAudit(db, { actor: input.actor ?? "system", action: "TRADE_SELL", target: id, after: { realized } }, now);
      return { ok: true, id, realizedPnl: realized };
    } catch (error) {
      db.run("ROLLBACK");
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  if (input.tradeType === "DIVIDEND_CASH" || input.tradeType === "DIVIDEND_REINVEST") {
    const amount = Number(input.amount);
    if (!(amount > 0)) return { ok: false, field: "amount", message: "请输入大于 0 的金额" };
    const holding = holdingOf(db, input.accountId, input.symbol ?? "");
    if (!holding) return { ok: false, field: "symbol", message: "该标的暂无持仓" };
    if (input.tradeType === "DIVIDEND_CASH") {
      const cash = input.cashAccountId ? cashOf(db, input.cashAccountId) : null;
      if (!cash) return { ok: false, field: "cashAccountId", message: "请选择到账现金账户" };
      db.run("BEGIN");
      try {
        setCash(db, input.cashAccountId as string, cash.amount + amount);
        const id = insertTrade(db, { ...input, cash_account_id: input.cashAccountId, fee, trade_type: "DIVIDEND_CASH" });
        db.run("COMMIT");
        writeAudit(db, { actor: input.actor ?? "system", action: "TRADE_DIVIDEND_CASH", target: id }, now);
        return { ok: true, id };
      } catch (error) {
        db.run("ROLLBACK");
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    }
    const price = Number(input.price ?? 0);
    if (!(price > 0)) return { ok: false, field: "price", message: "请填写大于 0 的折算价格" };
    const addedQty = round(amount / price, 4);
    const newQty = round(holding.quantity + addedQty, 4);
    const newCost = round((holding.quantity * holding.cost + amount) / newQty, 4);
    db.run("BEGIN");
    try {
      run(db, "UPDATE holding SET quantity=?, cost_price=? WHERE id=?", [newQty, newCost, holding.id]);
      const id = insertTrade(db, { ...input, quantity: addedQty, price, fee, trade_type: "DIVIDEND_REINVEST" });
      db.run("COMMIT");
      writeAudit(db, { actor: input.actor ?? "system", action: "TRADE_DIVIDEND_REINVEST", target: id }, now);
      return { ok: true, id };
    } catch (error) {
      db.run("ROLLBACK");
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  if (input.tradeType === "INCOME" || input.tradeType === "EXPENSE") {
    const amount = Number(input.amount);
    if (!(amount > 0)) return { ok: false, field: "amount", message: "请输入大于 0 的金额" };
    const cash = input.cashAccountId ? cashOf(db, input.cashAccountId) : null;
    if (!cash) return { ok: false, field: "cashAccountId", message: "请选择现金账户" };
    if (input.tradeType === "EXPENSE" && amount > cash.amount) {
      return { ok: false, field: "amount", message: "现金账户余额不足" };
    }
    db.run("BEGIN");
    try {
      setCash(db, input.cashAccountId as string, input.tradeType === "INCOME" ? cash.amount + amount : cash.amount - amount);
      const id = insertTrade(db, { ...input, cash_account_id: input.cashAccountId, fee: 0 });
      db.run("COMMIT");
      writeAudit(db, { actor: input.actor ?? "system", action: `TRADE_${input.tradeType}`, target: id }, now);
      return { ok: true, id };
    } catch (error) {
      db.run("ROLLBACK");
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  return { ok: false, message: "不支持的流水类型" };
}

export function transfer(
  db: Database,
  input: { portfolioId: string; accountId: string; fromCashAccountId: string; toCashAccountId: string; amount: number; tradeDate: string; actor?: string },
  now = new Date(),
): TradeResult {
  if (input.fromCashAccountId === input.toCashAccountId) {
    return { ok: false, field: "toCashAccountId", message: "转出与转入账户不能相同" };
  }
  const amount = Number(input.amount);
  if (!(amount > 0)) return { ok: false, field: "amount", message: "请输入大于 0 的金额" };
  const from = cashOf(db, input.fromCashAccountId);
  const to = cashOf(db, input.toCashAccountId);
  if (!from || !to) return { ok: false, message: "现金账户不存在" };
  if (amount > from.amount) {
    return { ok: false, field: "amount", message: "转账金额超过可用余额" };
  }
  const groupId = randomUUID();
  db.run("BEGIN");
  try {
    setCash(db, input.fromCashAccountId, from.amount - amount);
    setCash(db, input.toCashAccountId, to.amount + amount);
    const outId = insertTrade(db, {
      portfolio_id: input.portfolioId,
      account_id: input.accountId,
      cash_account_id: input.fromCashAccountId,
      trade_type: "TRANSFER_OUT",
      trade_date: input.tradeDate,
      amount,
      transfer_group_id: groupId,
    });
    const inId = insertTrade(db, {
      portfolio_id: input.portfolioId,
      account_id: input.accountId,
      cash_account_id: input.toCashAccountId,
      trade_type: "TRANSFER_IN",
      trade_date: input.tradeDate,
      amount,
      transfer_group_id: groupId,
    });
    db.run("COMMIT");
    writeAudit(db, { actor: input.actor ?? "system", action: "TRANSFER", target: groupId, after: { amount } }, now);
    return { ok: true, records: [outId, inId] };
  } catch (error) {
    db.run("ROLLBACK");
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export function listTrades(db: Database, portfolioId: string): Array<Record<string, unknown>> {
  return query(db, "SELECT * FROM trade WHERE portfolio_id=? AND deleted_at IS NULL ORDER BY trade_date DESC, id", [
    portfolioId,
  ]);
}

export function updateTrade(
  db: Database,
  input: { id: string; version: number; amount?: number; actor?: string },
  now = new Date(),
): TradeResult {
  const rows = query(db, "SELECT * FROM trade WHERE id=?", [input.id]);
  if (!rows.length) return { ok: false, message: "流水不存在" };
  const row = rows[0];
  if (Number(row.version) !== input.version) {
    return { ok: false, message: "该流水已被修改，请选择覆盖或放弃" };
  }
  if (input.amount !== undefined && !(input.amount > 0)) {
    return { ok: false, field: "amount", message: "请输入大于 0 的金额" };
  }
  run(db, "UPDATE trade SET amount=COALESCE(?, amount), version=version+1 WHERE id=?", [input.amount ?? null, input.id]);
  writeAudit(db, { actor: input.actor ?? "system", action: "TRADE_UPDATE", target: input.id, before: { version: input.version } }, now);
  return { ok: true, id: input.id };
}

export function deleteTrade(
  db: Database,
  input: { id: string; actor?: string },
  now = new Date(),
): TradeResult {
  const rows = query(db, "SELECT * FROM trade WHERE id=? AND deleted_at IS NULL", [input.id]);
  if (!rows.length) return { ok: false, message: "流水不存在或已删除" };
  const row = rows[0];
  const cashAccountId = row.cash_account_id ? String(row.cash_account_id) : null;
  const cash = cashAccountId ? cashOf(db, cashAccountId) : null;
  const tradeType = String(row.trade_type);
  const amount = Number(row.amount);
  let cashDelta = 0;
  if (cashAccountId && cash) {
    if (tradeType === "BUY") {
      cashDelta = amount + Number(row.fee ?? 0);
      setCash(db, cashAccountId, cash.amount + cashDelta);
    } else if (tradeType === "SELL") {
      cashDelta = -(amount - Number(row.fee ?? 0));
      setCash(db, cashAccountId, cash.amount + cashDelta);
    } else if (tradeType === "DIVIDEND_CASH" || tradeType === "INCOME" || tradeType === "TRANSFER_IN") {
      cashDelta = -amount;
      setCash(db, cashAccountId, cash.amount + cashDelta);
    } else if (tradeType === "EXPENSE" || tradeType === "TRANSFER_OUT") {
      cashDelta = amount;
      setCash(db, cashAccountId, cash.amount + cashDelta);
    }
  }
  const symbol = row.symbol ? String(row.symbol) : null;
  const holding = symbol ? holdingOf(db, String(row.account_id), symbol) : null;
  const qty = Number(row.quantity ?? 0);
  if (holding && qty) {
    if (tradeType === "BUY") {
      setHoldingQuantity(db, holding.id, round(holding.quantity - qty, 4));
    } else if (tradeType === "SELL") {
      setHoldingQuantity(db, holding.id, round(holding.quantity + qty, 4));
    }
  }
  const expiresAt = new Date(now.getTime() + UNDO_MINUTES * 60 * 1000).toISOString();
  run(db, "UPDATE trade SET deleted_at=? WHERE id=?", [now.toISOString(), input.id]);
  run(
    db,
    "INSERT INTO trade_undo (trade_id, cash_account_id, cash_delta, symbol, quantity_before, cost_before, expires_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(trade_id) DO UPDATE SET cash_delta=excluded.cash_delta, expires_at=excluded.expires_at",
    [input.id, cashAccountId, cashDelta, symbol, holding?.quantity ?? null, holding?.cost ?? null, expiresAt],
  );
  writeAudit(db, { actor: input.actor ?? "system", action: "TRADE_DELETE", target: input.id }, now);
  return { ok: true, id: input.id, undoExpiresAt: expiresAt };
}

export function undoDelete(db: Database, tradeId: string, now = new Date()): TradeResult {
  const rows = query(db, "SELECT * FROM trade_undo WHERE trade_id=?", [tradeId]);
  if (!rows.length) return { ok: false, message: "撤销窗口已结束" };
  const undo = rows[0];
  if (new Date(String(undo.expires_at)) <= now) {
    return { ok: false, message: "撤销窗口已结束" };
  }
  db.run("BEGIN");
  try {
    if (undo.cash_account_id) {
      const cash = cashOf(db, String(undo.cash_account_id));
      if (cash) setCash(db, String(undo.cash_account_id), cash.amount - Number(undo.cash_delta));
    }
    if (undo.symbol && undo.quantity_before !== null) {
      const owner = query(db, "SELECT account_id FROM trade WHERE id=?", [tradeId]);
      const accountId = String(owner.length ? owner[0].account_id : "");
      const current = holdingOf(db, accountId, String(undo.symbol));
      const before = Number(undo.quantity_before);
      if (current) {
        if (before <= 0) {
          run(db, "DELETE FROM holding WHERE id=?", [current.id]);
        } else {
          run(db, "UPDATE holding SET quantity=?, cost_price=? WHERE id=?", [before, Number(undo.cost_before), current.id]);
        }
      } else if (before > 0) {
        const ownerPortfolio = query(db, "SELECT portfolio_id FROM trade WHERE id=?", [tradeId]);
        run(
          db,
          "INSERT INTO holding (id, portfolio_id, account_id, symbol, name, category_key, quantity, cost_price, cost_overridden) VALUES (?,?,?,?,?,?,?,?,0)",
          [
            randomUUID(),
            String(ownerPortfolio.length ? ownerPortfolio[0].portfolio_id : ""),
            accountId,
            String(undo.symbol),
            String(undo.symbol),
            defaultCategory(db, String(undo.symbol)),
            before,
            Number(undo.cost_before),
          ],
        );
      }
    }
    run(db, "UPDATE trade SET deleted_at=NULL WHERE id=?", [tradeId]);
    run(db, "DELETE FROM trade_undo WHERE trade_id=?", [tradeId]);
    db.run("COMMIT");
    writeAudit(db, { actor: "system", action: "TRADE_UNDO", target: tradeId }, now);
    return { ok: true, id: tradeId };
  } catch (error) {
    db.run("ROLLBACK");
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}