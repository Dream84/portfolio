<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import * as echarts from "echarts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertTriangle } from "lucide-vue-next";
import { DateInput } from "@/components/ui/input";

const props = withDefaults(defineProps<{ reviewState?: string; darkMode?: boolean }>(), {
  reviewState: "normal",
  darkMode: false,
});

const FONT_FAMILY = '"Microsoft YaHei", "PingFang SC", "Segoe UI", -apple-system, sans-serif';

const CHART_COLORS = [
  { name: "蓝", light: "#2563EB", dark: "#60A5FA" },
  { name: "橙", light: "#F59E0B", dark: "#FBBF24" },
  { name: "绿", light: "#10B981", dark: "#34D399" },
  { name: "紫", light: "#8B5CF6", dark: "#A78BFA" },
  { name: "青", light: "#06B6D4", dark: "#22D3EE" },
  { name: "品红", light: "#EC4899", dark: "#F472B6" },
];
const colorAt = (index: number) => {
  const item = CHART_COLORS[index % CHART_COLORS.length];
  return props.darkMode ? item.dark : item.light;
};

const dimension = ref<"portfolio" | "account">("portfolio");

const portfolioOptions = [
  { key: "family", label: "家庭总仓" },
  { key: "pension", label: "养老账户组合（无持仓）" },
];
const portfolioKey = ref("family");

const l1Options = [
  { key: "all", label: "总计" },
  { key: "stock", label: "股票" },
  { key: "fund", label: "基金" },
  { key: "gold", label: "黄金" },
  { key: "cash", label: "现金" },
  { key: "risk", label: "风险资产（无持仓）" },
];
const l1Key = ref("all");

const l2Mapping = {
  stock: [{ key: "stock-a", label: "A股主板" }],
  fund: [
    { key: "fund-bond", label: "债券基金" },
    { key: "fund-equity", label: "股票基金（无持仓）" },
  ],
  gold: [{ key: "gold-etf", label: "黄金ETF" }],
  cash: [],
  risk: [{ key: "risk-option", label: "期权（无持仓）" }],
};
const l2Key = ref("all");
const l2Options = computed(() => {
  const mapping = l2Mapping as Record<string, { key: string; label: string }[]>;
  const children = l1Key.value === "all" ? [] : mapping[l1Key.value] ?? [];
  return [{ key: "all", label: "总计" }].concat(children);
});

const accountOptions = [
  { key: "all", label: "总计" },
  { key: "zhaoshang", label: "招商证券" },
  { key: "tiantian", label: "天天基金" },
  { key: "pension", label: "养老账户（无持仓）" },
];
const accountKey = ref("all");

watch([l1Key, dimension], () => {
  l2Key.value = "all";
});

const rangeOptions = [
  { key: "6m", label: "近 6 个月" },
  { key: "1y", label: "近 1 年" },
  { key: "3y", label: "近 3 年" },
  { key: "5y", label: "近 5 年" },
  { key: "custom", label: "自定义时间段" },
];
const rangeKey = ref("6m");
const customStart = ref("2026-04-01");
const customEnd = ref("2026-09-18");
const rangeError = ref("");

watch([customStart, customEnd], () => {
  if (rangeKey.value !== "custom") {
    rangeError.value = "";
    return;
  }
  if (!customStart.value || !customEnd.value) {
    rangeError.value = "请选择有效的日期范围";
    return;
  }
  rangeError.value = customStart.value > customEnd.value ? "请选择有效的日期范围" : "";
});

const isInsufficient = computed(() => props.reviewState === "insufficient");
const isEmptyRecords = computed(() => props.reviewState === "empty");
const isScopeEmpty = computed(() => {
  if (dimension.value === "account") return accountKey.value === "pension";
  if (portfolioKey.value === "pension") return true;
  return l1Key.value === "risk" || ["risk-option", "fund-equity"].includes(l2Key.value);
});

const snapshotSeriesAll = [
  { date: "2026-09-01", value: 201480.0, returnRate: 1.2 },
  { date: "2026-09-02", value: 202350.0, returnRate: 1.63 },
  { date: "2026-09-03", value: 201760.0, returnRate: 1.34 },
  { date: "2026-09-04", value: 203640.0, returnRate: 2.28 },
  { date: "2026-09-08", value: 204510.0, returnRate: 2.72 },
  { date: "2026-09-09", value: 203980.0, returnRate: 2.45 },
  { date: "2026-09-10", value: 205260.0, returnRate: 3.09 },
  { date: "2026-09-15", value: 205970.0, returnRate: 3.45 },
  { date: "2026-09-16", value: 206120.0, returnRate: 3.52 },
  { date: "2026-09-17", value: 205640.0, returnRate: 3.28 },
  { date: "2026-09-18", value: 206666.0, returnRate: 3.8 },
];

const snapshotSeries = computed(() => {
  if (isEmptyRecords.value) return [];
  if (isInsufficient.value) return snapshotSeriesAll.slice(-1);
  return snapshotSeriesAll;
});

const metrics = computed(() => {
  if (isEmptyRecords.value) {
    return { marketValue: 0, netInvestment: 0, floatingPnl: 0, realizedPnl: 0, returnRate: null as number | null };
  }
  if (l2Key.value === "fund-bond") {
    return { marketValue: 21486.0, netInvestment: 21000.0, floatingPnl: 486.0, realizedPnl: 120.0, returnRate: 2.31 };
  }
  return {
    marketValue: 206666.0,
    netInvestment: 199100.0,
    floatingPnl: 8566.0,
    realizedPnl: 2000.0,
    returnRate: 3.8,
  };
});

const shareRows = computed(() => {
  if (isEmptyRecords.value || isScopeEmpty.value) return [];
  const effectiveL1 =
    l1Key.value !== "all"
      ? l1Key.value
      : l2Key.value.indexOf("fund") === 0
        ? "fund"
        : l2Key.value.indexOf("gold") === 0
          ? "gold"
          : l2Key.value.indexOf("stock") === 0
            ? "stock"
            : "all";
  if (effectiveL1 === "fund") {
    return [
      { name: "债券基金（橙）", value: 21486.0, share: "10.40%", parentShare: "100.00%", color: colorAt(1) },
      { name: "股票基金（青）", value: 0.0, share: "0.00%", parentShare: "0.00%", color: colorAt(4) },
    ];
  }
  if (effectiveL1 === "gold") {
    return [{ name: "黄金ETF（绿）", value: 44705.0, share: "21.63%", parentShare: "100.00%", color: colorAt(2) }];
  }
  if (effectiveL1 === "stock") {
    return [{ name: "A股主板（蓝）", value: 125475.0, share: "60.71%", parentShare: "100.00%", color: colorAt(0) }];
  }
  return [
    { name: "股票（蓝）", value: 125475.0, share: "60.71%", parentShare: "100.00%", color: colorAt(0) },
    { name: "黄金（橙）", value: 44705.0, share: "21.63%", parentShare: "100.00%", color: colorAt(1) },
    { name: "基金（绿）", value: 21486.0, share: "10.40%", parentShare: "100.00%", color: colorAt(2) },
    { name: "现金（紫）", value: 15000.0, share: "7.26%", parentShare: "100.00%", color: colorAt(3) },
  ];
});

const filteredCount = 1;
const filteredSamples = [
  {
    symbol: "003809",
    name: "招商招顺纯债A",
    date: "2026-01-28",
    change: "+16.09%",
    reason: "单日涨跌幅超过阈值 15%，判定为净值跳变，已从曲线剔除",
  },
];

const chartRef = ref<HTMLDivElement | null>(null);
let chart: echarts.ECharts | null = null;

function renderChart() {
  if (!chartRef.value) return;
  if (!chart) chart = echarts.init(chartRef.value);
  const rows = snapshotSeries.value;
  const axis = props.darkMode ? "#9AA0A6" : "#646A73";
  const grid = props.darkMode ? "#2A2D34" : "#E5E6EB";
  const line1 = props.darkMode ? "#60A5FA" : "#2563EB";
  const line2 = props.darkMode ? "#22D3EE" : "#0EA5E9";
  chart.setOption({
    textStyle: { fontFamily: FONT_FAMILY },
    grid: { left: 76, right: 68, top: 40, bottom: 36 },
    tooltip: {
      trigger: "axis",
      textStyle: { fontFamily: FONT_FAMILY },
      formatter: (params: Array<{ axisValue: string; seriesName: string; value: number }>) => {
        const lines = params.map((item) =>
          item.seriesName === "组合市值"
            ? `${item.seriesName}：${item.value.toLocaleString("zh-CN", { minimumFractionDigits: 2 })} 元`
            : `${item.seriesName}：${item.value.toFixed(2)}%`,
        );
        return `${params[0]?.axisValue ?? ""}<br/>${lines.join("<br/>")}`;
      },
    },
    legend: {
      top: 0,
      right: 0,
      itemWidth: 12,
      itemHeight: 8,
      textStyle: { color: axis, fontSize: 12, fontFamily: FONT_FAMILY },
    },
    xAxis: {
      type: "category",
      data: rows.map((item) => item.date),
      axisLine: { lineStyle: { color: grid } },
      axisLabel: { color: axis, fontSize: 12, fontFamily: FONT_FAMILY },
    },
    yAxis: [
      {
        type: "value",
        scale: true,
        axisLabel: { color: axis, fontSize: 12, fontFamily: FONT_FAMILY },
        splitLine: { lineStyle: { color: grid } },
      },
      {
        type: "value",
        axisLabel: { color: axis, fontSize: 12, fontFamily: FONT_FAMILY, formatter: (value: number) => `${value}%` },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: "组合市值",
        type: "line",
        smooth: true,
        showSymbol: true,
        symbolSize: 6,
        lineStyle: { width: 2, color: line1 },
        itemStyle: { color: line1 },
        data: rows.map((item) => item.value),
      },
      {
        name: "累计收益率",
        type: "line",
        smooth: true,
        yAxisIndex: 1,
        showSymbol: true,
        symbolSize: 6,
        lineStyle: { width: 2, color: line2 },
        itemStyle: { color: line2 },
        data: rows.map((item) => item.returnRate),
      },
    ],
  });
}

onMounted(() => {
  renderChart();
  window.addEventListener("resize", () => chart?.resize());
});
watch([snapshotSeries, () => props.darkMode], () => nextTick(renderChart));

const snapshotRows = computed(() =>
  snapshotSeries.value.map((item, index) => ({
    ...item,
    missing: index === 3 && !isInsufficient.value && !isEmptyRecords.value,
  })),
);

const snapshotTip = ref("");
function generateTodaySnapshot() {
  snapshotTip.value = "已生成 2026-09-21 快照（评审演示数据，不写入后端）";
}
function regenerateSnapshot() {
  snapshotTip.value = "已重新生成受影响日期的快照，流水与曲线口径一致";
}

const filteredDialogOpen = ref(false);

const formatMoney = (value: number) =>
  value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatPct = (value: number) => `${value.toFixed(4)}%`;
const scopeLabel = computed(() => {
  if (dimension.value === "account") {
    return accountOptions.find((item) => item.key === accountKey.value)?.label ?? "总计";
  }
  const l1 = l1Options.find((item) => item.key === l1Key.value)?.label ?? "总计";
  const l2 = l2Options.value.find((item) => item.key === l2Key.value)?.label ?? "总计";
  {
    const name = portfolioOptions.find((item) => item.key === portfolioKey.value)?.label ?? "总计";
    return `${name} / ${l1} / ${l2}`;
  }
  return `${l1} / ${l2}`;
});
</script>

<template>
  <div class="grid gap-6 p-6">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 class="text-lg font-semibold">收益分析</h3>
        <p class="mt-1 text-sm text-muted-foreground">
          支持近 6 个月、近 1 年、近 3 年、近 5 年与自定义时间段；投资组合维度支持组合名称、一级分类与二级分类级联选择
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            :variant="dimension === 'portfolio' ? 'default' : 'outline'"
            data-testid="analytics-dimension-portfolio"
            @click="dimension = 'portfolio'"
          >
            投资组合
          </Button>
          <Button
            type="button"
            size="sm"
            :variant="dimension === 'account' ? 'default' : 'outline'"
            data-testid="analytics-dimension-account"
            @click="dimension = 'account'"
          >
            账户
          </Button>
        </div>

        <label v-if="dimension === 'portfolio'" class="flex items-center gap-2 text-xs text-muted-foreground">
          组合名称
          <select
            v-model="portfolioKey"
            class="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
            data-testid="analytics-select-portfolio"
          >
            <option v-for="item in portfolioOptions" :key="item.key" :value="item.key">{{ item.label }}</option>
          </select>
        </label>

        <label v-if="dimension !== 'account'" class="flex items-center gap-2 text-xs text-muted-foreground">
          一级分类
          <select
            v-model="l1Key"
            class="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
            data-testid="analytics-select-l1"
          >
            <option v-for="item in l1Options" :key="item.key" :value="item.key">{{ item.label }}</option>
          </select>
        </label>

        <label v-if="dimension !== 'account'" class="flex items-center gap-2 text-xs text-muted-foreground">
          二级分类
          <select
            v-model="l2Key"
            class="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
            data-testid="analytics-select-l2"
          >
            <option v-for="item in l2Options" :key="item.key" :value="item.key">{{ item.label }}</option>
          </select>
        </label>

        <label v-if="dimension === 'account'" class="flex items-center gap-2 text-xs text-muted-foreground">
          账户
          <select
            v-model="accountKey"
            class="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
            data-testid="analytics-select-account"
          >
            <option v-for="item in accountOptions" :key="item.key" :value="item.key">{{ item.label }}</option>
          </select>
        </label>

        <label class="flex items-center gap-2 text-xs text-muted-foreground">
          时间范围
          <select
            v-model="rangeKey"
            class="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
            data-testid="analytics-select-range"
          >
            <option v-for="item in rangeOptions" :key="item.key" :value="item.key">{{ item.label }}</option>
          </select>
        </label>

        <template v-if="rangeKey === 'custom'">
          <DateInput v-model="customStart" data-testid="analytics-input-range-start" />
          <span class="text-xs text-muted-foreground">至</span>
          <DateInput v-model="customEnd" data-testid="analytics-input-range-end" />
        </template>
      </div>
    </header>

    <p v-if="rangeError" class="text-xs text-destructive">{{ rangeError }}</p>

    <Card class="p-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-xs text-muted-foreground">
          统计维度：{{ dimension === "account" ? "账户" : "投资组合（组合名称 / 一级分类 / 二级分类）" }}
          <span class="ml-2">统计对象：{{ scopeLabel || "—" }}</span>
        </p>
        <p class="text-xs text-muted-foreground">时间范围：{{ rangeOptions.find((item) => item.key === rangeKey)?.label }}</p>
      </div>

      <dl class="mt-3 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <div>
          <dt class="text-xs text-muted-foreground">当前市值</dt>
          <dd class="mt-1 font-mono text-lg font-semibold tabular-nums">{{ formatMoney(metrics.marketValue) }}</dd>
        </div>
        <div>
          <dt class="text-xs text-muted-foreground">累计投入</dt>
          <dd class="mt-1 font-mono text-lg tabular-nums">{{ formatMoney(metrics.netInvestment) }}</dd>
        </div>
        <div>
          <dt class="text-xs text-muted-foreground">浮动盈亏</dt>
          <dd
            class="mt-1 font-mono text-lg tabular-nums"
            :class="metrics.floatingPnl > 0 ? 'text-pnl-up' : metrics.floatingPnl < 0 ? 'text-pnl-down' : 'text-pnl-flat'"
          >
            {{ formatMoney(metrics.floatingPnl) }}
          </dd>
        </div>
        <div>
          <dt class="text-xs text-muted-foreground">已实现盈亏</dt>
          <dd class="mt-1 font-mono text-lg tabular-nums text-pnl-up">{{ formatMoney(metrics.realizedPnl) }}</dd>
        </div>
        <div>
          <dt class="text-xs text-muted-foreground">累计收益率</dt>
          <dd class="mt-1 font-mono text-lg tabular-nums text-pnl-up">
            {{ metrics.returnRate === null ? "—" : formatPct(metrics.returnRate) }}
          </dd>
        </div>
      </dl>
      <p v-if="isEmptyRecords" class="mt-3 text-xs text-muted-foreground">请先录入流水以计算收益</p>
    </Card>

    <Card class="p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm font-medium">收益曲线</p>
        <p class="text-xs text-muted-foreground">
          数据时间 2026-09-18 23:30
          <span class="ml-2 inline-flex items-center gap-1"><AlertTriangle class="h-3.5 w-3.5" />{{ filteredCount }}</span>
        </p>
      </div>

      <p class="mt-2 text-xs text-muted-foreground">左轴：组合市值（元）　右轴：累计收益率（%）</p>

      <p v-if="isInsufficient" class="mt-6 text-sm text-muted-foreground">
        历史数据不足，至少需要两个交易日的快照
      </p>
      <p v-else-if="isEmptyRecords" class="mt-6 text-sm text-muted-foreground">暂无快照数据，请先录入流水</p>
      <p v-else-if="isScopeEmpty" class="mt-6 text-sm text-muted-foreground">所选维度暂无持仓</p>
      <div v-else ref="chartRef" class="mt-2 h-[280px] w-full"></div>

      <div class="mt-3 flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" data-testid="analytics-action-view-filtered" @click="filteredDialogOpen = true">
          查看已过滤样本
        </Button>
      </div>
    </Card>

    <div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <Card class="p-4">
        <p class="text-sm font-medium">
          {{ l1Key !== "all" || l2Key !== "all" ? "子分类占比（占所属一级分类）" : "分类占比" }}
        </p>
        <p v-if="isEmptyRecords" class="mt-4 text-sm text-muted-foreground">暂无持仓金额</p>
        <p v-else-if="isScopeEmpty" class="mt-4 text-sm text-muted-foreground">所选维度暂无持仓</p>
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
            <tr v-for="row in shareRows" :key="row.name" class="border-t border-border">
              <td class="px-3 py-2">
                <span class="mr-2 inline-block h-2 w-2 rounded-sm" :style="{ backgroundColor: row.color }"></span>
                {{ row.name }}
              </td>
              <td class="px-3 py-2 text-right font-mono tabular-nums">{{ formatMoney(row.value) }}</td>
              <td class="px-3 py-2 text-right font-mono tabular-nums">{{ row.share }}</td>
              <td class="px-3 py-2 text-right font-mono tabular-nums">{{ row.parentShare }}</td>
            </tr>
          </tbody>
        </table>
      </Card>

      <Card class="p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm font-medium">每日快照</p>
          <div class="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" data-testid="analytics-action-regenerate-snapshot" @click="regenerateSnapshot">
              重新生成受影响日期
            </Button>
            <Button type="button" size="sm" data-testid="analytics-action-generate-snapshot" @click="generateTodaySnapshot">
              立即生成今日快照
            </Button>
          </div>
        </div>

        <p v-if="snapshotTip" class="mt-3 text-xs text-pnl-down">{{ snapshotTip }}</p>

        <table v-if="snapshotRows.length" class="mt-3 w-full border-collapse text-sm">
          <thead>
            <tr class="bg-background text-left text-xs font-medium text-muted-foreground">
              <th class="px-3 py-2">日期</th>
              <th class="px-3 py-2 text-right">市值</th>
              <th class="px-3 py-2 text-right">累计收益率</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in snapshotRows" :key="row.date" class="border-t border-border">
              <td class="px-3 py-2 font-mono tabular-nums">
                {{ row.date }}
                <span v-if="row.missing" class="ml-2 text-warning">该日快照缺失</span>
              </td>
              <td class="px-3 py-2 text-right font-mono tabular-nums">{{ formatMoney(row.value) }}</td>
              <td class="px-3 py-2 text-right font-mono tabular-nums">{{ row.returnRate.toFixed(4) }}%</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="mt-4 text-sm text-muted-foreground">暂无快照数据</p>
      </Card>
    </div>

    <div v-if="filteredDialogOpen" class="fixed inset-0 z-30 flex items-center justify-center bg-[rgba(31,35,41,0.24)]">
      <section class="w-[560px] rounded-lg bg-card p-5 shadow-[0_4px_16px_rgba(31,35,41,0.08)]">
        <header class="flex items-center justify-between">
          <h3 class="text-base font-semibold">已过滤异常样本</h3>
          <Button type="button" variant="ghost" size="sm" data-testid="analytics-dialog-filtered-close" @click="filteredDialogOpen = false">
            关闭
          </Button>
        </header>

        <table class="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr class="bg-background text-left text-xs font-medium text-muted-foreground">
              <th class="px-3 py-2">标的</th>
              <th class="px-3 py-2">日期</th>
              <th class="px-3 py-2 text-right">单日涨跌</th>
              <th class="px-3 py-2">判定</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in filteredSamples" :key="row.symbol + row.date" class="border-t border-border">
              <td class="px-3 py-2">
                <span class="font-medium">{{ row.name }}</span>
                <span class="ml-2 font-mono text-xs text-muted-foreground tabular-nums">{{ row.symbol }}</span>
              </td>
              <td class="px-3 py-2 font-mono tabular-nums">{{ row.date }}</td>
              <td class="px-3 py-2 text-right font-mono tabular-nums text-pnl-up">{{ row.change }}</td>
              <td class="px-3 py-2 text-xs text-muted-foreground">{{ row.reason }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  </div>
</template>
