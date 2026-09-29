<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type TradeRow = { id: string; trade_type: string; trade_date: string; symbol: string | null; amount: number; quantity: number | null; price: number | null; fee: number; realized_pnl: number | null; version: number };
type CashRow = { id: string; name: string; currency: string; amount_original: number };
type AccountRow = { id: string; name: string };

const tradeTypes = [
  { value: "BUY", label: "买入" },
  { value: "SELL", label: "卖出" },
  { value: "DIVIDEND_CASH", label: "现金分红" },
  { value: "DIVIDEND_REINVEST", label: "红利再投" },
  { value: "INCOME", label: "收入（工资）" },
  { value: "EXPENSE", label: "支出" },
];

const rows = ref<TradeRow[]>([]);
const cashRows = ref<CashRow[]>([]);
const accounts = ref<AccountRow[]>([]);
const message = ref("");
const messageKind = ref<"ok" | "error">("ok");
const lastDeleted = ref<string | null>(null);
const form = ref({ tradeType: "BUY", symbol: "SH600519", name: "贵州茅台", accountId: "", cashAccountId: "", tradeDate: "2026-09-18", quantity: "100", price: "400", fee: "5", amount: "0" });

async function call(path: string, body?: unknown) {
  const response = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  return (await response.json()) as Record<string, unknown>;
}

async function load() {
  const data = await call("/api/trades");
  rows.value = (data.rows ?? []) as TradeRow[];
  const cash = await call("/api/cash-accounts");
  cashRows.value = (cash.rows ?? []) as CashRow[];
  const accountData = await call("/api/accounts");
  accounts.value = (accountData.rows ?? []) as AccountRow[];
  if (!form.value.cashAccountId && cashRows.value.length) form.value.cashAccountId = cashRows.value[0].id;
  if (!form.value.accountId && accounts.value.length) form.value.accountId = accounts.value[0].id;
}

async function submit() {
  const needsQuantity = form.value.tradeType === "BUY" || form.value.tradeType === "SELL";
  const payload = {
    portfolioId: "family",
    accountId: form.value.accountId || accounts.value[0]?.id || "",
    cashAccountId: form.value.cashAccountId || cashRows.value[0]?.id || "",
    symbol: form.value.symbol,
    name: form.value.name,
    tradeType: form.value.tradeType,
    tradeDate: form.value.tradeDate,
    amount: needsQuantity ? 0 : Number(form.value.amount),
    quantity: form.value.tradeType === "DIVIDEND_CASH" ? undefined : Number(form.value.quantity),
    price: Number(form.value.price),
    fee: Number(form.value.fee),
  };
  if (form.value.tradeType === "DIVIDEND_REINVEST") {
    payload.amount = Number(form.value.amount);
    payload.quantity = undefined;
  }
  if (form.value.tradeType === "DIVIDEND_CASH") {
    payload.amount = Number(form.value.amount);
    payload.quantity = undefined;
  }
  const result = await call("/api/trades", payload);
  message.value = String(result.message ?? (result.ok ? "流水已保存" : "保存失败"));
  messageKind.value = result.ok ? "ok" : "error";
  lastDeleted.value = null;
  if (result.ok) await load();
}

async function removeTrade(id: string) {
  const result = await call("/api/trades/delete", { id });
  message.value = String(result.message ?? (result.ok ? "已删除，可在 5 分钟内撤销" : "删除失败"));
  messageKind.value = result.ok ? "ok" : "error";
  lastDeleted.value = result.ok ? id : null;
  await load();
}

async function undo() {
  if (!lastDeleted.value) return;
  const result = await call("/api/trades/undo", { id: lastDeleted.value });
  message.value = String(result.message ?? (result.ok ? "已撤销删除" : "撤销失败"));
  messageKind.value = result.ok ? "ok" : "error";
  lastDeleted.value = null;
  await load();
}

onMounted(load);
</script>

<template>
  <section class="grid gap-4 p-4" data-testid="page-trades">
    <Card class="grid gap-3 p-4">
      <h2 class="text-sm font-semibold">登记流水</h2>
      <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label class="grid gap-1 text-xs">
          类型
          <select v-model="form.tradeType" class="rounded border border-border bg-background px-2 py-1 text-sm" data-testid="trade-type">
            <option v-for="item in tradeTypes" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select>
        </label>
        <label class="grid gap-1 text-xs">
          所属账户
          <select v-model="form.accountId" class="rounded border border-border bg-background px-2 py-1 text-sm" data-testid="trade-account">
            <option v-for="account in accounts" :key="account.id" :value="account.id">{{ account.name }}</option>
          </select>
        </label>
        <label class="grid gap-1 text-xs">
          现金账户
          <select v-model="form.cashAccountId" class="rounded border border-border bg-background px-2 py-1 text-sm" data-testid="trade-cash-account">
            <option v-for="cash in cashRows" :key="cash.id" :value="cash.id">{{ cash.name }}（{{ cash.currency }}）</option>
          </select>
        </label>
        <label class="grid gap-1 text-xs">
          标的代码
          <Input v-model="form.symbol" data-testid="trade-symbol" />
        </label>
        <label class="grid gap-1 text-xs">
          数量
          <Input v-model="form.quantity" data-testid="trade-quantity" />
        </label>
        <label class="grid gap-1 text-xs">
          价格
          <Input v-model="form.price" data-testid="trade-price" />
        </label>
        <label class="grid gap-1 text-xs">
          金额
          <Input v-model="form.amount" data-testid="trade-amount" />
        </label>
        <label class="grid gap-1 text-xs">
          手续费
          <Input v-model="form.fee" data-testid="trade-fee" />
        </label>
        <label class="grid gap-1 text-xs">
          成交日期
          <Input v-model="form.tradeDate" data-testid="trade-date" />
        </label>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" :disabled="!cashRows.length" data-testid="trade-save" @click="submit">保存流水</Button>
        <Button v-if="lastDeleted" type="button" size="sm" variant="ghost" data-testid="trade-undo" @click="undo">撤销删除</Button>
        <span
          class="text-xs"
          :class="messageKind === 'ok' ? 'text-muted-foreground' : 'text-destructive'"
          data-testid="trade-message"
        >{{ message }}</span>
      </div>
    </Card>

    <Card class="grid gap-2 p-4">
      <h2 class="text-sm font-semibold">流水明细</h2>
      <ul class="grid gap-1 text-xs" data-testid="trade-list">
        <li v-for="row in rows" :key="row.id" class="grid grid-cols-[0.8fr_0.9fr_1fr_0.8fr_0.8fr_0.7fr_auto] items-center gap-2 border-b border-border pb-1">
          <span>{{ row.trade_type }}</span>
          <span>{{ row.trade_date }}</span>
          <span>{{ row.symbol ?? "-" }}</span>
          <span>{{ Number(row.amount).toFixed(2) }}</span>
          <span>{{ row.quantity === null ? "-" : Number(row.quantity).toFixed(2) }}</span>
          <span>{{ row.realized_pnl === null ? "-" : Number(row.realized_pnl).toFixed(2) }}</span>
          <button type="button" class="text-destructive" :data-testid="`trade-delete-${row.id}`" @click="removeTrade(row.id)">删除</button>
        </li>
      </ul>
      <p v-if="!rows.length" class="text-xs text-muted-foreground">暂无流水</p>
    </Card>
  </section>
</template>
