<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import * as echarts from "echarts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DateInput } from "@/components/ui/input";

const props = withDefaults(defineProps<{ darkMode?: boolean }>(), { darkMode: false });

const PORTFOLIO_ID = "family";
const PORTFOLIO_NAME = "家庭总仓";
const FONT = "Microsoft YaHei, PingFang SC, Segoe UI, sans-serif";

type AnalyticsResult = {
  ok: boolean;
  message?: string;
  empty: boolean;
  emptyMessage?: string;
  insufficient: boolean;
  dataTime?: string;
  metrics?: { marketValue: number; netInvestment: number; floatingPnl: number; realizedPnl: number; returnRate: number | null };
  series?: Array<{ date: string; value: number; returnRate: number }>;
  shareRows?: Array<{ key: string; name: string; value: number; share: number; shareOfParent: number }>;
  snapshots?: Array<{ date: string; value: number; returnRate: number; missing: boolean }>;
};

const dimension = ref<"PORTFOLIO" | "ACCOUNT">("PORTFOLIO");
const l1Key = ref("all");
const l2Key = ref("all");
const accountKey = ref("all");
const rangeKey = ref<"6M" | "1Y" | "3Y" | "5Y" | "CUSTOM">("6M");
const customStart = ref("2026-09-01");
const customEnd = ref("2026-09-18");
const result = ref<AnalyticsResult | null>(null);
const rangeError = ref("");
const snapshotTip = ref("");
const loading = ref(false);

const l1Options = [
  { key: "all", label: "总计" },
  { key: "stock", label: "股票" },
  { key: "fund", label: "基金" },
  { key: "gold", label: "黄金" },
  { key: "cash", label: "现金" },
  { key: "risk", label: "风险资产（无持仓）" },
];

const l2Mapping: Record<string, Array<{ key: string; label: string }>> = {
  stock: [{ key: "stock-a", label: "A股主板" }],
  fund: [
    { key: "fund-bond", label: "债券基金" },
    { key: "fund-equity", label: "股票基金（无持仓）" },
  ],
  gold: [{ key: "gold-etf", label: "黄金ETF" }],
  cash: [],
  risk: [{ key: "risk-option", label: "期权（无持仓）" }],
};

const l2Options = computed(() => {
  const children = l1Key.value === "all" ? [] : l2Mapping[l1Key.value] ?? [];
  return [{ key: "all", label: "总计" }].concat(children);
});

watch([l1Key, dimension], () => {
  l2Key.value = "all";
});

const accountOptions = [
  { key: "all", label: "总计" },
  { key: "zhaoshang", label: "招商证券" },
  { key: "tiantian", label: "天天基金" },
  { key: "pension", label: "养老账户（无持仓）" },
];

const rangeOptions = [
  { key: "6M", label: "近 6 个月" },
  { key: "1Y", label: "近 1 年" },
  { key: "3Y", label: "近 3 年" },
  { key: "5Y", label: "近 5 年" },
  { key: "CUSTOM", label: "自定义时间段" },
];

async function loadAnalytics() {
  loading.value = true;
  rangeError.value = "";
  try {
    const params = new URLSearchParams({
      portfolioId: PORTFOLIO_ID,
      dimension: dimension.value,
      scope: dimension.value === "ACCOUNT" ? accountKey.value : PORTFOLIO_ID,
      l1Key: dimension.value === "ACCOUNT" ? "all" : l1Key.value,
      l2Key: dimension.value === "ACCOUNT" ? "all" : l2Key.value,
      rangeKey: rangeKey.value,
    });
    if (rangeKey.value === "CUSTOM") {
      params.set("start", customStart.value);
      params.set("end", customEnd.value);
    }
    const res = await fetch(`/api/analytics?${params.toString()}`);
    const body = (await res.json()) as AnalyticsResult;
    if (!res.ok) {
      rangeError.value = body.message ?? "查询失败";
      return;
    }
    result.value = body;
  } finally {
    loading.value = false;
  }
}

onMounted(loadAnalytics);
watch([dimension, l1Key, l2Key, accountKey, rangeKey, customStart, customEnd], () => {
  void loadAnalytics();
});

const chartRef = ref<HTMLDivElement | null>(null);
let chart: echarts.ECharts | null = null;

function renderChart() {
  const series = result.value?.series ?? [];
  if (!chartRef.value || series.length < 2) return;
  if (!chart) chart = echarts.init(chartRef.value);
  const axis = props.darkMode ? "#9AA0A6" : "#646A73";
  const gridColor = props.darkMode ? "#2A2D34" : "#E5E6EB";
  const line1 = props.darkMode ? "#60A5FA" : "#2563EB";
  const line2 = props.darkMode ? "#22D3EE" : "#0EA5E9";
  chart.setOption({
    textStyle: { fontFamily: FONT },
    grid: { left: 76, right: 68, top: 40, bottom: 36 },
    tooltip: { trigger: "axis", textStyle: { fontFamily: FONT } },
    legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: axis, fontSize: 12, fontFamily: FONT } },
    xAxis: {
      type: "category",
      data: series.map((item) => item.date),
      axisLine: { lineStyle: { color: gridColor } },
      axisLabel: { color: axis, fontSize: 12, fontFamily: FONT },
    },
    yAxis: [
      { type: "value", scale: true, axisLabel: { color: axis, fontSize: 12, fontFamily: FONT }, splitLine: { lineStyle: { color: gridColor } } },
      { type: "value", axisLabel: { color: axis, fontSize: 12, fontFamily: FONT, formatter: (value: number) => `${value}%` }, splitLine: { show: false } },
    ],
    series: [
      { name: "组合市值", type: "line", smooth: true, showSymbol: true, symbolSize: 6, lineStyle: { width: 2, color: line1 }, itemStyle: { color: line1 }, data: series.map((item) => item.value) },
      { name: "累计收益率", type: "line", smooth: true, yAxisIndex: 1, showSymbol: true, symbolSize: 6, lineStyle: { width: 2, color: line2 }, itemStyle: { color: line2 }, data: series.map((item) => item.returnRate) },
    ],
  });
}

watch([() => result.value, () => props.darkMode], () => nextTick(renderChart));

async function generateTodaySnapshot() {
  const res = await fetch("/api/snapshots/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId: PORTFOLIO_ID, date: "2026-09-21" }),
  });
  const body = (await res.json()) as { ok: boolean; message?: string };
  snapshotTip.value = body.ok ? "已生成 2026-09-21 快照" : body.message ?? "生成失败";
  await loadAnalytics();
}

async function regenerateSnapshots() {
  const res = await fetch("/api/snapshots/regenerate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId: PORTFOLIO_ID, dates: ["2026-09-19"] }),
  });
  const body = (await res.json()) as { ok: boolean; regenerated: string[]; failed: string[] };
  snapshotTip.value = body.ok ? `已重新生成 ${body.regenerated.join("、")} 的快照` : `失败日期：${body.failed.join("、")}`;
  await loadAnalytics();
}

const formatMoney = (value: number) => value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatPct = (value: number | null) => (value === null ? "—" : `${value.toFixed(4)}%`);
const pnlClass = (value: number) => (value > 0 ? "text-pnl-up" : value < 0 ? "text-pnl-down" : "text-pnl-flat");
</script>

<template>
  <div class="grid gap-6 p-6">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 class="text-lg font-semibold">收益分析</h3>
        <p class="mt-1 text-sm text-muted-foreground">支持近 6 个月、近 1 年、近 3 年、近 5 年与自定义时间段；投资组合维度支持组合名称、一级分类与二级分类级联选择</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex items-center gap-1">
          <Button type="button" size="sm" :variant="dimension === 'PORTFOLIO' ? 'default' : 'outline'" data-testid="analytics-dimension-portfolio" @click="dimension = 'PORTFOLIO'">投资组合</Button>
          <Button type="button" size="sm" :variant="dimension === 'ACCOUNT' ? 'default' : 'outline'" data-testid="analytics-dimension-account" @click="dimension = 'ACCOUNT'">账户</Button>
        </div>
        <span v-if="dimension === 'PORTFOLIO'" class="text-xs text-muted-foreground">{{ PORTFOLIO_NAME }}</span>
        <label v-if="dimension === 'PORTFOLIO'" class="flex items-center gap-2 text-xs text-muted-foreground">
          一级分类
          <select v-model="l1Key" class="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground" data-testid="analytics-select-l1">
            <option v-for="item in l1Options" :key="item.key" :value="item.key">{{ item.label }}</option>
          </select>
        </label>
        <label v-if="dimension === 'PORTFOLIO'" class="flex items-center gap-2 text-xs text-muted-foreground">
          二级分类
          <select v-model="l2Key" class="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground" data-testid="analytics-select-l2">
            <option v-for="item in l2Options" :key="item.key" :value="item.key">{{ item.label }}</option>
          </select>
        </label>
        <label v-if="dimension === 'ACCOUNT'" class="flex items-center gap-2 text-xs text-muted-foreground">
          账户
          <select v-model="accountKey" class="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground" data-testid="analytics-select-account">
            <option v-for="item in accountOptions" :key="item.key" :value="item.key">{{ item.label }}</option>
          </select>
        </label>
        <label class="flex items-center gap-2 text-xs text-muted-foreground">
          时间范围
          <select v-model="rangeKey" class="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground" data-testid="analytics-select-range">
            <option v-for="item in rangeOptions" :key="item.key" :value="item.key">{{ item.label }}</option>
          </select>
        </label>
        <template v-if="rangeKey === 'CUSTOM'">
          <DateInput v-model="customStart" data-testid="analytics-input-range-start" />
          <span class="text-xs text-muted-foreground">至</span>
          <DateInput v-model="customEnd" data-testid="analytics-input-range-end" />
        </template>
      </div>
    </header>

    <p v-if="rangeError" class="text-xs text-destructive">{{ rangeError }}</p>

    <Card class="p-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-xs text-muted-foreground">统计维度：{{ dimension === "ACCOUNT" ? "账户" : "投资组合（一级 / 二级分类）" }}</p>
        <p class="text-xs text-muted-foreground">数据时间 {{ result?.dataTime ?? "—" }}{{ loading ? "（加载中）" : "" }}</p>
      </div>
      <dl class="mt-3 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <div>
          <dt class="text-xs text-muted-foreground">当前市值</dt>
          <dd class="mt-1 font-mono text-lg font-semibold tabular-nums">{{ formatMoney(result?.metrics?.marketValue ?? 0) }}</dd>
        </div>
        <div>
          <dt class="text-xs text-muted-foreground">累计投入</dt>
          <dd class="mt-1 font-mono text-lg tabular-nums">{{ formatMoney(result?.metrics?.netInvestment ?? 0) }}</dd>
        </div>
        <div>
          <dt class="text-xs text-muted-foreground">浮动盈亏</dt>
          <dd class="mt-1 font-mono text-lg tabular-nums" :class="pnlClass(result?.metrics?.floatingPnl ?? 0)">{{ formatMoney(result?.metrics?.floatingPnl ?? 0) }}</dd>
        </div>
        <div>
          <dt class="text-xs text-muted-foreground">已实现盈亏</dt>
          <dd class="mt-1 font-mono text-lg tabular-nums text-pnl-up">{{ formatMoney(result?.metrics?.realizedPnl ?? 0) }}</dd>
        </div>
        <div>
          <dt class="text-xs text-muted-foreground">累计收益率</dt>
          <dd class="mt-1 font-mono text-lg tabular-nums text-pnl-up">{{ formatPct(result?.metrics?.returnRate ?? null) }}</dd>
        </div>
      </dl>
    </Card>

    <Card class="p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm font-medium">收益曲线</p>
        <p class="text-xs text-muted-foreground">左轴：组合市值（元）　右轴：累计收益率（%）</p>
      </div>
      <p v-if="result?.insufficient" class="mt-6 text-sm text-muted-foreground">历史数据不足，至少需要两个交易日的快照</p>
      <p v-else-if="result?.empty" class="mt-6 text-sm text-muted-foreground">{{ result.emptyMessage }}</p>
      <div v-else ref="chartRef" class="mt-2 h-[280px] w-full"></div>
    </Card>

    <div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <Card class="p-4">
        <p class="text-sm font-medium">{{ l1Key !== "all" || l2Key !== "all" ? "子分类占比（占所属一级分类）" : "分类占比" }}</p>
        <p v-if="result?.empty" class="mt-4 text-sm text-muted-foreground">{{ result.emptyMessage }}</p>
        <table v-else class="mt-3 w-full border-collapse text-sm">
          <thead>
            <tr class="bg-background text-left text-xs font-medium text-muted-foreground">
              <th class="px-3 py-2">分类</th>
              <th class="px-3 py-2 text-right">金额</th>
              <th class="px-3 py-2 text-right">占组合比</th>
              <th class="px-3 py-2 text-right">占所属一级分类比</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in result?.shareRows ?? []" :key="row.key" class="border-t border-border">
              <td class="px-3 py-2">{{ row.name }}</td>
              <td class="px-3 py-2 text-right font-mono tabular-nums">{{ formatMoney(row.value) }}</td>
              <td class="px-3 py-2 text-right font-mono tabular-nums">{{ row.share.toFixed(2) }}%</td>
              <td class="px-3 py-2 text-right font-mono tabular-nums">{{ row.shareOfParent.toFixed(2) }}%</td>
            </tr>
          </tbody>
        </table>
      </Card>

      <Card class="p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm font-medium">每日快照</p>
          <div class="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" data-testid="analytics-action-regenerate-snapshot" @click="regenerateSnapshots">重新生成受影响日期</Button>
            <Button type="button" size="sm" data-testid="analytics-action-generate-snapshot" @click="generateTodaySnapshot">立即生成今日快照</Button>
          </div>
        </div>
        <p v-if="snapshotTip" class="mt-3 text-xs text-pnl-down">{{ snapshotTip }}</p>
        <table v-if="(result?.snapshots ?? []).length" class="mt-3 w-full border-collapse text-sm">
          <thead>
            <tr class="bg-background text-left text-xs font-medium text-muted-foreground">
              <th class="px-3 py-2">日期</th>
              <th class="px-3 py-2 text-right">市值</th>
              <th class="px-3 py-2 text-right">累计收益率</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in (result?.snapshots ?? []).slice().reverse()" :key="row.date" class="border-t border-border">
              <td class="px-3 py-2 font-mono tabular-nums">{{ row.date }}<span v-if="row.missing" class="ml-2 text-warning">该日快照缺失</span></td>
              <td class="px-3 py-2 text-right font-mono tabular-nums">{{ formatMoney(row.value) }}</td>
              <td class="px-3 py-2 text-right font-mono tabular-nums">{{ row.returnRate.toFixed(4) }}%</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="mt-4 text-sm text-muted-foreground">暂无快照数据</p>
      </Card>
    </div>
  </div>
</template>
