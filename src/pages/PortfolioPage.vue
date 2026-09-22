<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import * as echarts from "echarts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, type BreakdownRow, type CategoryRow, type Summary } from "@/lib/api.ts";

const props = withDefaults(defineProps<{ darkMode?: boolean }>(), { darkMode: false });

const PALETTE: Record<string, { light: string; dark: string; name: string }> = {
  "chart-1": { light: "#2563EB", dark: "#60A5FA", name: "蓝" },
  "chart-2": { light: "#F59E0B", dark: "#FBBF24", name: "橙" },
  "chart-3": { light: "#10B981", dark: "#34D399", name: "绿" },
  "chart-4": { light: "#8B5CF6", dark: "#A78BFA", name: "紫" },
  "chart-5": { light: "#06B6D4", dark: "#22D3EE", name: "青" },
  "chart-6": { light: "#EC4899", dark: "#F472B6", name: "品红" },
  "chart-7": { light: "#64748B", dark: "#94A3B8", name: "石板灰" },
  "chart-8": { light: "#84CC16", dark: "#A3E635", name: "黄绿" },
};

const PORTFOLIO_ID = "family";
const summary = ref<Summary | null>(null);
const breakdown = ref<BreakdownRow[]>([]);
const categories = ref<CategoryRow[]>([]);
const loadError = ref("");
const loading = ref(false);
const savedTip = ref("");

const expandedKeys = ref<string[]>(["stock", "fund", "gold"]);
const categoryFilter = ref("all");
const subCategoryFilter = ref("all");
const accountFilter = ref("all");
const sortKey = ref("marketValue");

const l1Categories = computed(() => categories.value.filter((item) => item.level === "L1"));
const l2Categories = computed(() => categories.value.filter((item) => item.level === "L2"));
const subCategoryOptions = computed(() =>
  categoryFilter.value === "all" ? l2Categories.value : l2Categories.value.filter((item) => item.parentKey === categoryFilter.value),
);
const categoryByKey = (key: string) => categories.value.find((item) => item.key === key);
const l1Of = (key: string) => {
  const target = categoryByKey(key);
  if (!target) return undefined;
  return target.level === "L1" ? target : categoryByKey(target.parentKey ?? "");
};
const colorOf = (colorToken: string) => {
  const palette = PALETTE[colorToken] ?? PALETTE["chart-1"];
  return { value: props.darkMode ? palette.dark : palette.light, name: palette.name };
};

watch(categoryFilter, () => {
  subCategoryFilter.value = "all";
});

const accountOptions = computed(() => summary.value?.accounts ?? []);

const holdings = computed(() => {
  const rows = (summary.value?.holdings ?? []).filter((item) => {
    const l1 = l1Of(item.categoryKey);
    const categoryOk = categoryFilter.value === "all" || l1?.key === categoryFilter.value;
    const subOk = subCategoryFilter.value === "all" || item.categoryKey === subCategoryFilter.value;
    const accountOk = accountFilter.value === "all" || item.accountId === accountFilter.value;
    return categoryOk && subOk && accountOk;
  });
  const price = (symbol: string) => quotePrice.value[symbol] ?? 0;
  return rows
    .map((item) => ({
      ...item,
      price: price(item.symbol),
      marketValue: item.quantity * price(item.symbol),
      pnl: item.quantity * (price(item.symbol) - item.costPrice),
    }))
    .sort((a, b) => {
      if (sortKey.value === "pnl") return b.pnl - a.pnl;
      if (sortKey.value === "pnlRate") return b.pnl / b.costPrice - a.pnl / a.costPrice;
      return b.marketValue - a.marketValue;
    });
});

const quotePrice = ref<Record<string, number>>({});
const quoteTime = ref<Record<string, string>>({});

function loadQuoteCache() {
  const rows = (summary.value?.shares ?? []).length;
  void rows;
}

async function loadAll() {
  loading.value = true;
  loadError.value = "";
  try {
    const [s, b, c] = await Promise.all([api.summary(PORTFOLIO_ID), api.breakdown(PORTFOLIO_ID), api.categories()]);
    summary.value = s;
    breakdown.value = b.rows;
    categories.value = c.categories;
    const prices: Record<string, number> = {};
    (s.holdings ?? []).forEach((item) => {
      const share = s.shares.find((shareRow) => shareRow.key === l1Of(item.categoryKey)?.key);
      void share;
    });
    quotePrice.value = prices;
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error);
  } finally {
    loading.value = false;
  }
}

async function loadQuotes() {
  const res = await fetch(`/api/quotes`);
  if (!res.ok) return;
  const body = (await res.json()) as { quotes: Array<{ symbol: string; price: number; priceTime: string }> };
  const prices: Record<string, number> = {};
  const times: Record<string, string> = {};
  body.quotes.forEach((item) => {
    prices[item.symbol] = item.price;
    times[item.symbol] = item.priceTime;
  });
  quotePrice.value = prices;
  quoteTime.value = times;
}

onMounted(async () => {
  await loadQuotes();
  await loadAll();
});

const chartRef = ref<HTMLDivElement | null>(null);
let chart: echarts.ECharts | null = null;

function renderChart() {
  if (!chartRef.value || !summary.value) return;
  if (!chart) chart = echarts.init(chartRef.value);
  const rows = summary.value.shares;
  const axisColor = props.darkMode ? "#9AA0A6" : "#646A73";
  chart.setOption({
    textStyle: { fontFamily: "Microsoft YaHei, PingFang SC, Segoe UI, sans-serif" },
    color: rows.map((row) => colorOf(row.colorToken).value),
    tooltip: {
      trigger: "item",
      formatter: (params: { name: string; value: number; percent: number }) =>
        `${params.name}（${colorOf(rows.find((r) => r.name === params.name)?.colorToken ?? "chart-1").name}）：${params.value.toLocaleString("zh-CN", { minimumFractionDigits: 2 })} 元（${params.percent.toFixed(2)}%）`,
    },
    series: [
      {
        type: "pie",
        radius: ["52%", "76%"],
        center: ["50%", "50%"],
        itemStyle: { borderColor: props.darkMode ? "#191B20" : "#FFFFFF", borderWidth: 2 },
        label: { show: false },
        data: rows.map((row) => ({ name: row.name, value: row.value })),
        textStyle: { color: axisColor },
      },
    ],
  });
}

watch([() => summary.value, () => props.darkMode], () => nextTick(renderChart));

const holdingDrawerOpen = ref(false);
const holdingForm = ref({ symbol: "", name: "", categoryKey: "stock-a", accountId: "zhaoshang", quantity: "", costPrice: "", costOverridden: false });
const holdingError = ref("");

function openHoldingDrawer() {
  holdingForm.value = { symbol: "", name: "", categoryKey: "stock-a", accountId: "zhaoshang", quantity: "", costPrice: "", costOverridden: false };
  holdingError.value = "";
  savedTip.value = "";
  holdingDrawerOpen.value = true;
}

async function saveHolding() {
  try {
    await api.saveHolding({
      portfolioId: PORTFOLIO_ID,
      accountId: holdingForm.value.accountId,
      symbol: holdingForm.value.symbol,
      name: holdingForm.value.name,
      categoryKey: holdingForm.value.categoryKey,
      quantity: Number(holdingForm.value.quantity),
      costPrice: Number(holdingForm.value.costPrice),
      costOverridden: holdingForm.value.costOverridden,
    });
    holdingDrawerOpen.value = false;
    savedTip.value = `已保存 ${holdingForm.value.name || holdingForm.value.symbol} 持仓`;
    await loadAll();
  } catch (error) {
    holdingError.value = error instanceof Error ? error.message : String(error);
  }
}

const categoryDrawerOpen = ref(false);
const selectedCategoryKey = ref("stock-a");
const categoryError = ref("");

async function removeSelectedCategory() {
  try {
    await api.removeCategory(selectedCategoryKey.value);
    categoryError.value = "";
    await loadAll();
  } catch (error) {
    categoryError.value = error instanceof Error ? error.message : String(error);
  }
}

const formatMoney = (value: number) => value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatPct = (value: number) => `${value.toFixed(2)}%`;
const pnlClass = (value: number) => (value > 0 ? "text-pnl-up" : value < 0 ? "text-pnl-down" : "text-pnl-flat");
const toggleExpand = (key: string) => {
  expandedKeys.value = expandedKeys.value.includes(key) ? expandedKeys.value.filter((item) => item !== key) : [...expandedKeys.value, key];
};
</script>

<template>
  <div class="grid gap-6 p-6">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 class="text-lg font-semibold">持仓与组合</h3>
        <p class="mt-1 text-sm text-muted-foreground">合并多个账户看资产总额与分类占比；分类支持一级分类与二级子分类，饼图只按一级分类汇总</p>
      </div>
      <div class="flex items-center gap-2">
        <Button type="button" variant="outline" data-testid="portfolio-action-open-category-manage" @click="categoryDrawerOpen = true">分类管理</Button>
        <Button type="button" data-testid="portfolio-action-open-holding-new" @click="openHoldingDrawer">新增持仓</Button>
      </div>
    </header>

    <p v-if="loadError" class="rounded-md border border-border bg-card px-3 py-2 text-xs text-destructive">{{ loadError }}</p>
    <p v-if="savedTip" class="text-xs text-pnl-down">{{ savedTip }}</p>

    <Card class="p-4">
      <div class="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div class="grid content-start gap-3">
          <div>
            <p class="text-xs text-muted-foreground">资产总额</p>
            <p class="mt-1 font-mono text-3xl font-semibold tabular-nums">{{ formatMoney(summary?.totalValue ?? 0) }}</p>
            <p class="mt-1 text-xs text-muted-foreground">关联账户：{{ (summary?.accounts ?? []).length }} 个</p>
          </div>
          <dl class="grid grid-cols-2 gap-3 text-xs">
            <div>
              <dt class="text-muted-foreground">持仓成本合计</dt>
              <dd class="mt-1 font-mono text-sm tabular-nums">{{ formatMoney(summary?.totalCost ?? 0) }}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">浮动盈亏</dt>
              <dd class="mt-1 font-mono text-sm tabular-nums" :class="pnlClass(summary?.floatingPnl ?? 0)">{{ formatMoney(summary?.floatingPnl ?? 0) }}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">现金折合人民币</dt>
              <dd class="mt-1 font-mono text-sm tabular-nums">{{ formatMoney(summary?.cashValue ?? 0) }}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">数据时间</dt>
              <dd class="mt-1 font-mono text-sm tabular-nums">{{ summary?.dataTime ?? "—" }}</dd>
            </div>
          </dl>
          <p v-if="summary?.stale" class="rounded-md border border-border bg-background px-3 py-2 text-xs text-warning">
            {{ summary?.staleCount }} 个标的为缓存价格，数据时间以上方为准
          </p>
        </div>

        <div>
          <p class="text-xs text-muted-foreground">分类占比（仅一级分类）</p>
          <div class="mt-2 flex flex-wrap items-center gap-4">
            <div ref="chartRef" class="h-[220px] min-w-[200px] flex-1"></div>
            <ul class="grid gap-1 text-xs">
              <li v-for="row in summary?.shares ?? []" :key="row.key" class="flex items-center gap-2">
                <span class="inline-block h-2.5 w-2.5 rounded-sm" :style="{ backgroundColor: colorOf(row.colorToken).value }"></span>
                <span class="font-medium">{{ colorOf(row.colorToken).name }}色：{{ row.name }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </Card>

    <Card class="p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm font-medium">分类层级明细</p>
        <p class="text-xs text-muted-foreground">一级分类汇总与子项占比；一级分类总收益等于其子项盈亏合计</p>
      </div>
      <table class="mt-3 w-full border-collapse text-xs xl:text-sm">
        <thead>
          <tr class="bg-background text-left text-xs font-medium text-muted-foreground">
            <th class="px-3 py-2">分类 / 子分类</th>
            <th class="px-3 py-2 text-right">金额</th>
            <th class="px-3 py-2 text-right">占组合比</th>
            <th class="px-3 py-2 text-right">占一级分类比</th>
            <th class="px-3 py-2 text-right">浮动盈亏</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="row in breakdown" :key="row.key">
            <tr class="cursor-pointer border-t border-border hover:bg-background" @click="toggleExpand(row.key)">
              <td class="px-3 py-2">
                <span class="font-medium">{{ row.name }}</span>
                <span class="ml-2 text-xs text-muted-foreground">{{ expandedKeys.includes(row.key) ? "−" : "+" }} {{ row.children.length }}</span>
              </td>
              <td class="px-3 py-2 text-right font-mono tabular-nums">{{ formatMoney(row.value) }}</td>
              <td class="px-3 py-2 text-right font-mono tabular-nums">{{ formatPct(row.shareOfTotal) }}</td>
              <td class="px-3 py-2 text-right font-mono tabular-nums">100.00%</td>
              <td class="px-3 py-2 text-right font-mono tabular-nums" :class="pnlClass(row.pnl)">{{ formatMoney(row.pnl) }}</td>
            </tr>
            <template v-if="expandedKeys.includes(row.key)">
              <tr v-if="row.children.length === 0">
                <td class="px-3 py-2 pl-8 text-xs text-muted-foreground" colspan="5">该分类暂无子分类</td>
              </tr>
              <tr v-for="child in row.children" :key="child.key" class="border-t border-border">
                <td class="px-3 py-2 pl-8 text-muted-foreground">{{ child.name }}</td>
                <td class="px-3 py-2 text-right font-mono tabular-nums">{{ formatMoney(child.value) }}</td>
                <td class="px-3 py-2 text-right font-mono tabular-nums">{{ formatPct(child.shareOfTotal) }}</td>
                <td class="px-3 py-2 text-right font-mono tabular-nums">{{ formatPct(child.shareOfParent) }}</td>
                <td class="px-3 py-2 text-right font-mono tabular-nums" :class="pnlClass(child.pnl)">{{ formatMoney(child.pnl) }}</td>
              </tr>
            </template>
          </template>
        </tbody>
      </table>
    </Card>

    <Card class="p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <label class="flex items-center gap-2 text-xs text-muted-foreground">
            一级分类
            <select v-model="categoryFilter" class="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground" data-testid="portfolio-select-category-filter">
              <option value="all">全部</option>
              <option v-for="item in l1Categories" :key="item.key" :value="item.key">{{ item.name }}</option>
            </select>
          </label>
          <label class="flex items-center gap-2 text-xs text-muted-foreground">
            二级子分类
            <select v-model="subCategoryFilter" class="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground" data-testid="portfolio-select-subcategory-filter">
              <option value="all">全部</option>
              <option v-for="item in subCategoryOptions" :key="item.key" :value="item.key">{{ item.name }}</option>
            </select>
          </label>
          <label class="flex items-center gap-2 text-xs text-muted-foreground">
            账户
            <select v-model="accountFilter" class="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground" data-testid="portfolio-select-account-filter">
              <option value="all">全部</option>
              <option v-for="item in accountOptions" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>
          <label class="flex items-center gap-2 text-xs text-muted-foreground">
            排序
            <select v-model="sortKey" class="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground" data-testid="portfolio-select-sort">
              <option value="marketValue">市值降序</option>
              <option value="pnl">浮动盈亏降序</option>
              <option value="pnlRate">盈亏比例降序</option>
            </select>
          </label>
        </div>
        <p class="text-xs text-muted-foreground">共 {{ holdings.length }} 条持仓</p>
      </div>

      <div v-if="!holdings.length" class="mt-6 grid gap-2 text-sm text-muted-foreground">
        <p>暂无持仓，请先录入持仓</p>
        <div>
          <Button type="button" size="sm" data-testid="portfolio-action-empty-create-holding" @click="openHoldingDrawer">新增持仓</Button>
        </div>
      </div>

      <div v-else class="mt-4 overflow-x-auto">
        <table class="w-full border-collapse text-xs xl:text-sm">
          <thead>
            <tr class="bg-background text-left text-xs font-medium text-muted-foreground">
              <th class="px-3 py-2">标的</th>
              <th class="px-3 py-2">一级 / 二级分类</th>
              <th class="px-3 py-2">账户</th>
              <th class="px-3 py-2 text-right">份额</th>
              <th class="px-3 py-2 text-right">成本价</th>
              <th class="px-3 py-2 text-right">最新价</th>
              <th class="px-3 py-2 text-right">市值</th>
              <th class="px-3 py-2 text-right">浮动盈亏</th>
              <th class="px-3 py-2 text-right">盈亏比例</th>
              <th class="px-3 py-2">数据时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in holdings" :key="row.id" class="border-t border-border">
              <td class="px-3 py-2">
                <span class="font-medium">{{ row.name }}</span>
                <span class="ml-2 font-mono text-xs text-muted-foreground tabular-nums">{{ row.symbol }}</span>
                <span v-if="row.costOverridden" class="ml-2 text-xs text-muted-foreground" title="成本已手工设置">✎</span>
              </td>
              <td class="px-3 py-2 text-muted-foreground">{{ l1Of(row.categoryKey)?.name }} / {{ categoryByKey(row.categoryKey)?.name }}</td>
              <td class="px-3 py-2 text-muted-foreground">{{ row.accountId }}</td>
              <td class="px-3 py-2 text-right font-mono tabular-nums">{{ row.quantity.toFixed(2) }}</td>
              <td class="px-3 py-2 text-right font-mono tabular-nums">{{ row.costPrice.toFixed(4) }}</td>
              <td class="px-3 py-2 text-right font-mono tabular-nums">{{ row.price.toFixed(4) }}</td>
              <td class="px-3 py-2 text-right font-mono tabular-nums">{{ formatMoney(row.marketValue) }}</td>
              <td class="px-3 py-2 text-right font-mono tabular-nums" :class="pnlClass(row.pnl)">{{ formatMoney(row.pnl) }}</td>
              <td class="px-3 py-2 text-right font-mono tabular-nums" :class="pnlClass(row.pnl)">{{ formatPct((row.price / row.costPrice - 1) * 100) }}</td>
              <td class="px-3 py-2 font-mono text-xs text-muted-foreground tabular-nums">{{ quoteTime[row.symbol] ?? "—" }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>

    <div v-if="holdingDrawerOpen" class="fixed inset-0 z-30 flex justify-end bg-[rgba(31,35,41,0.24)]">
      <section class="h-full w-[420px] bg-card p-5 shadow-[0_4px_16px_rgba(31,35,41,0.08)]">
        <header class="flex items-center justify-between">
          <h3 class="text-base font-semibold">新增持仓</h3>
          <Button type="button" variant="ghost" size="sm" data-testid="portfolio-dialog-holding-action-close" @click="holdingDrawerOpen = false">关闭</Button>
        </header>
        <div class="mt-4 grid gap-3">
          <label class="grid gap-1 text-xs text-muted-foreground">标的代码<Input v-model="holdingForm.symbol" data-testid="portfolio-dialog-holding-symbol" placeholder="例如 600519" /></label>
          <label class="grid gap-1 text-xs text-muted-foreground">标的名称<Input v-model="holdingForm.name" placeholder="例如 贵州茅台" /></label>
          <label class="grid gap-1 text-xs text-muted-foreground">
            二级子分类
            <select v-model="holdingForm.categoryKey" class="h-9 rounded-md border border-border bg-card px-2 text-sm text-foreground">
              <option v-for="item in l2Categories" :key="item.key" :value="item.key">{{ categoryByKey(item.parentKey ?? "")?.name }} / {{ item.name }}</option>
            </select>
          </label>
          <label class="grid gap-1 text-xs text-muted-foreground">
            所属账户
            <select v-model="holdingForm.accountId" class="h-9 rounded-md border border-border bg-card px-2 text-sm text-foreground">
              <option v-for="item in accountOptions" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>
          <label class="grid gap-1 text-xs text-muted-foreground">份额<Input v-model="holdingForm.quantity" data-testid="portfolio-dialog-holding-quantity" placeholder="例如 100" /></label>
          <label class="grid gap-1 text-xs text-muted-foreground">成本价<Input v-model="holdingForm.costPrice" data-testid="portfolio-dialog-holding-cost" placeholder="例如 1200.0000" /></label>
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs text-muted-foreground">成本来源：{{ holdingForm.costOverridden ? "手工设置" : "按流水计算" }}</span>
            <Button type="button" variant="outline" size="sm" data-testid="portfolio-dialog-holding-action-cost-override" @click="holdingForm.costOverridden = !holdingForm.costOverridden">
              {{ holdingForm.costOverridden ? "恢复按流水计算" : "手工覆盖成本" }}
            </Button>
          </div>
          <p v-if="holdingError" class="text-xs text-destructive">{{ holdingError }}</p>
          <div class="mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" data-testid="portfolio-dialog-holding-action-cancel" @click="holdingDrawerOpen = false">取消</Button>
            <Button type="button" data-testid="portfolio-dialog-holding-action-save" @click="saveHolding">保存</Button>
          </div>
        </div>
      </section>
    </div>

    <div v-if="categoryDrawerOpen" class="fixed inset-0 z-30 flex justify-end bg-[rgba(31,35,41,0.24)]">
      <section class="h-full w-[440px] overflow-y-auto bg-card p-5 shadow-[0_4px_16px_rgba(31,35,41,0.08)]">
        <header class="flex items-center justify-between">
          <h3 class="text-base font-semibold">分类管理</h3>
          <Button type="button" variant="ghost" size="sm" data-testid="portfolio-dialog-category-action-close" @click="categoryDrawerOpen = false">关闭</Button>
        </header>
        <div class="mt-4 grid gap-3">
          <div v-for="l1 in l1Categories" :key="l1.key" class="rounded-md border border-border p-3">
            <div class="flex cursor-pointer items-center justify-between gap-2" :class="selectedCategoryKey === l1.key ? 'text-primary-strong' : ''" @click="selectedCategoryKey = l1.key">
              <span class="flex items-center gap-2 text-sm font-medium">
                <span class="inline-block h-2 w-2 rounded-sm" :style="{ backgroundColor: colorOf(l1.colorToken).value }"></span>
                {{ l1.name }}
                <span class="text-xs text-muted-foreground">{{ l1.preset ? "预设" : "自定义" }}</span>
              </span>
            </div>
            <ul class="mt-2 grid gap-1">
              <li v-for="child in l2Categories.filter((item) => item.parentKey === l1.key)" :key="child.key" class="cursor-pointer rounded-md px-2 py-1 text-sm text-muted-foreground" :class="selectedCategoryKey === child.key ? 'bg-primary-soft text-primary-strong' : ''" @click="selectedCategoryKey = child.key">
                {{ child.name }}
              </li>
              <li v-if="l2Categories.filter((item) => item.parentKey === l1.key).length === 0" class="px-2 py-1 text-xs text-muted-foreground">该分类暂无子分类</li>
            </ul>
          </div>
        </div>
        <p v-if="categoryError" class="mt-3 text-xs text-destructive">{{ categoryError }}</p>
        <div class="mt-4 flex justify-end">
          <Button type="button" variant="destructive" size="sm" data-testid="portfolio-dialog-category-action-delete" @click="removeSelectedCategory">删除所选分类</Button>
        </div>
      </section>
    </div>
  </div>
</template>
