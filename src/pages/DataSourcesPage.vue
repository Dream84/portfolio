<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type ProviderRow = { id: string; name: string; kind: string; priority: number; enabled: number; timeout_seconds: number; url: string; last_check_at: string | null; last_check_message: string | null };
type LogRow = { id: string; level: string; symbol: string | null; message: string; created_at: string };

const rows = ref<ProviderRow[]>([]);
const logs = ref<LogRow[]>([]);
const message = ref("");
const messageKind = ref<"ok" | "error">("ok");
const interval = ref("");
const ready = ref(false);
let intervalLoaded = false;
const intervalMessage = ref("");
const probeResult = ref<Record<string, string>>({});
const refreshSummary = ref("");
const lastRefreshAt = ref("-");
const fundMessage = ref("");

async function call(path: string, body?: unknown) {
  const response = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  return (await response.json()) as Record<string, unknown>;
}

async function load() {
  const data = await call("/api/providers");
  rows.value = (data.rows ?? []) as ProviderRow[];
  ready.value = true;
  if (!intervalLoaded) {
    interval.value = String(data.refreshIntervalSeconds ?? 60);
    intervalLoaded = true;
  }
  if (data.message) intervalMessage.value = String(data.message);
  const logData = await call("/api/logs");
  logs.value = (logData.rows ?? []) as LogRow[];
}

async function toggle(row: ProviderRow) {
  const result = await call("/api/providers", {
    id: row.id,
    name: row.name,
    kind: row.kind,
    priority: row.priority,
    enabled: Number(row.enabled) !== 1,
    timeoutSeconds: row.timeout_seconds,
  });
  message.value = String(result.message ?? (result.ok ? "数据源已保存" : "保存失败"));
  messageKind.value = result.ok ? "ok" : "error";
  await load();
}

async function probe(row: ProviderRow) {
  const result = await call("/api/providers/probe", { id: row.id });
  probeResult.value[row.id] = String(result.message ?? "");
  await load();
}

async function saveInterval() {
  const result = await call("/api/providers/interval", { seconds: Number(interval.value) });
  intervalMessage.value = String(result.message ?? "");
  interval.value = String(result.seconds ?? 60);
}

async function refresh() {
  const result = await call("/api/refresh/quotes", {});
  const updated = (result.updated as string[] | undefined) ?? [];
  const failed = (result.failed as string[] | undefined) ?? [];
  const cached = (result.cached as string[] | undefined) ?? [];
  refreshSummary.value = `更新成功 ${updated.length} 个，失败 ${failed.length} 个，缓存复用 ${cached.length} 个`;
  lastRefreshAt.value = new Date().toLocaleTimeString();
  message.value = String(result.message ?? refreshSummary.value);
  messageKind.value = failed.length ? "error" : "ok";
  await load();
}

async function refreshFund() {
  const result = await call("/api/funds/nav", { symbol: "004400" });
  fundMessage.value = String(result.message ?? "");
}

onMounted(load);
</script>

<template>
  <section class="grid gap-4 p-4" data-testid="page-data-sources" :data-ready="ready">
    <Card class="grid gap-3 p-4" data-testid="source-switch-region">
      <h2 class="text-sm font-semibold">数据源开关与优先级</h2>
      <ul class="grid gap-2 text-xs">
        <li v-for="row in rows" :key="row.id" class="grid grid-cols-[1.2fr_0.6fr_0.5fr_0.6fr_auto_auto] items-center gap-2 border-b border-border pb-1">
          <span>{{ row.name }}</span>
          <span>{{ row.kind }}</span>
          <span>优先级 {{ row.priority }}</span>
          <span :data-testid="`source-state-${row.id}`">{{ Number(row.enabled) === 1 ? "已启用" : "已停用" }}</span>
          <Button type="button" size="sm" variant="ghost" :data-testid="`source-toggle-${row.id}`" @click="toggle(row)">切换启用</Button>
          <Button type="button" size="sm" variant="ghost" :data-testid="`source-probe-${row.id}`" @click="probe(row)">连通性检测</Button>
          <span class="col-span-6 text-muted-foreground" :data-testid="`source-status-${row.id}`">
            最近检测：{{ row.last_check_at ?? "未检测" }} {{ row.last_check_message ?? "" }} {{ probeResult[row.id] ?? "" }}
          </span>
        </li>
      </ul>
      <p class="text-xs" data-testid="source-message" :class="messageKind === 'ok' ? 'text-muted-foreground' : 'text-destructive'">{{ message }}</p>
    </Card>

    <Card class="grid gap-3 p-4" data-testid="refresh-setting-region">
      <h2 class="text-sm font-semibold">刷新设置</h2>
      <div class="flex flex-wrap items-center gap-2 text-xs">
        <span>自动刷新周期（秒）</span>
        <input v-model="interval" :disabled="!ready" class="h-9 w-24 rounded-md border border-input bg-background px-3 py-1 text-sm disabled:opacity-50" data-testid="refresh-interval" />
        <Button type="button" size="sm" variant="ghost" :disabled="!ready" data-testid="refresh-interval-save" @click="saveInterval">保存</Button>
        <span class="text-muted-foreground" data-testid="refresh-interval-message">{{ intervalMessage }}</span>
      </div>
      <div class="flex flex-wrap items-center gap-2 text-xs">
        <Button type="button" size="sm" data-testid="quote-refresh" @click="refresh">刷新场内行情</Button>
        <Button type="button" size="sm" variant="ghost" data-testid="fund-refresh" @click="refreshFund">手动刷新基金净值</Button>
        <span class="text-muted-foreground" data-testid="fund-refresh-message">{{ fundMessage }}</span>
      </div>
    </Card>

    <Card class="grid gap-2 p-4" data-testid="refresh-log-region">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold">最近刷新与错误日志</h2>
        <span class="text-xs text-muted-foreground" data-testid="refresh-last-time">最近刷新时间：{{ lastRefreshAt }}</span>
      </div>
      <p class="text-xs" data-testid="refresh-summary">{{ refreshSummary || "尚未刷新" }}</p>
      <ul class="grid gap-1 text-xs" data-testid="refresh-log-list">
        <li v-for="log in logs" :key="log.id" class="grid grid-cols-[0.5fr_0.7fr_2fr_1fr] gap-2 border-b border-border pb-1">
          <span>{{ log.level }}</span>
          <span>{{ log.symbol ?? "-" }}</span>
          <span>{{ log.message }}</span>
          <span>{{ log.created_at }}</span>
        </li>
      </ul>
      <p v-if="!logs.length" class="text-xs text-muted-foreground">暂无错误日志</p>
    </Card>
  </section>
</template>
