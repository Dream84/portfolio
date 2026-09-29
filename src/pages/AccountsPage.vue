<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type CashRow = { id: string; name: string; account_id: string; currency: string; amount_original: number; fx_rate: number; fx_overridden: number };
type AccountRow = { id: string; name: string };

const rows = ref<CashRow[]>([]);
const accounts = ref<AccountRow[]>([]);
const totalCny = ref(0);
const message = ref("");
const messageKind = ref<"ok" | "error">("ok");
const form = ref({ accountId: "", name: "", currency: "CNY", amount: "0", rate: "", rateTime: "" });

async function call(path: string, body?: unknown) {
  const response = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  return (await response.json()) as Record<string, unknown>;
}

async function load() {
  const data = await call("/api/cash-accounts");
  rows.value = (data.rows ?? []) as CashRow[];
  totalCny.value = Number(data.totalCny ?? 0);
  const accountData = await call("/api/accounts");
  accounts.value = (accountData.rows ?? []) as AccountRow[];
  if (!form.value.accountId && accounts.value.length) form.value.accountId = accounts.value[0].id;
}

async function submit() {
  const payload = {
    accountId: form.value.accountId,
    name: form.value.name,
    currency: form.value.currency,
    amount: Number(form.value.amount),
    rate: form.value.rate === "" ? undefined : Number(form.value.rate),
    rateTime: form.value.rateTime || undefined,
    overridden: form.value.currency !== "CNY",
  };
  const result = await call("/api/cash-accounts", payload);
  message.value = String(result.message ?? (result.ok ? "现金账户已保存" : "保存失败"));
  messageKind.value = result.ok ? "ok" : "error";
  if (result.ok) {
    form.value = { accountId: form.value.accountId, name: "", currency: "CNY", amount: "0", rate: "", rateTime: "" };
    await load();
  }
}

onMounted(load);
</script>

<template>
  <section class="grid gap-4 p-4" data-testid="page-accounts">
    <Card class="grid gap-3 p-4">
      <h2 class="text-sm font-semibold">新增现金账户</h2>
      <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <label class="grid gap-1 text-xs">
          所属账户
          <select v-model="form.accountId" class="rounded border border-border bg-background px-2 py-1 text-sm" data-testid="cash-account-owner">
            <option v-for="account in accounts" :key="account.id" :value="account.id">{{ account.name }}</option>
          </select>
        </label>
        <label class="grid gap-1 text-xs">
          账户名称
          <Input v-model="form.name" data-testid="cash-account-name" />
        </label>
        <label class="grid gap-1 text-xs">
          币种
          <select v-model="form.currency" class="rounded border border-border bg-background px-2 py-1 text-sm" data-testid="cash-account-currency">
            <option value="CNY">CNY 人民币</option>
            <option value="USD">USD 美元</option>
            <option value="HKD">HKD 港币</option>
            <option value="EUR">EUR 欧元</option>
            <option value="JPY">JPY 日元</option>
          </select>
        </label>
        <label class="grid gap-1 text-xs">
          初始余额
          <Input v-model="form.amount" data-testid="cash-account-amount" />
        </label>
        <label class="grid gap-1 text-xs">
          汇率（外币必填）
          <Input v-model="form.rate" data-testid="cash-account-rate" />
        </label>
        <label class="grid gap-1 text-xs">
          汇率时间
          <Input v-model="form.rateTime" data-testid="cash-account-rate-time" />
        </label>
      </div>
      <div class="flex items-center gap-2">
        <Button type="button" size="sm" :disabled="!accounts.length" data-testid="cash-account-save" @click="submit">保存现金账户</Button>
        <span
          class="text-xs"
          :class="messageKind === 'ok' ? 'text-muted-foreground' : 'text-destructive'"
          data-testid="cash-account-message"
        >{{ message }}</span>
      </div>
    </Card>

    <Card class="grid gap-3 p-4">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold">现金账户列表</h2>
        <span class="text-xs text-muted-foreground" data-testid="cash-account-total">现金折合人民币：{{ totalCny.toFixed(2) }}</span>
      </div>
      <ul class="grid gap-1 text-xs" data-testid="cash-account-list">
        <li v-for="row in rows" :key="row.id" class="grid grid-cols-[1.4fr_0.7fr_0.9fr_0.9fr] gap-2 border-b border-border pb-1">
          <span>{{ row.name }}</span>
          <span>{{ row.currency }}</span>
          <span>{{ Number(row.amount_original).toFixed(2) }}</span>
          <span>汇率 {{ Number(row.fx_rate).toFixed(4) }}{{ Number(row.fx_overridden) === 1 ? "（手工）" : "" }}</span>
        </li>
      </ul>
      <p v-if="!rows.length" class="text-xs text-muted-foreground">暂无现金账户</p>
    </Card>
  </section>
</template>
