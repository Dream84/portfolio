<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import { PanelLeftClose, PanelLeftOpen } from "lucide-vue-next";
import PortfolioPage from "@/pages/PortfolioPage.vue";
import AnalyticsPage from "@/pages/AnalyticsPage.vue";
import AccountsPage from "@/pages/AccountsPage.vue";
import TradesPage from "@/pages/TradesPage.vue";
import DataSourcesPage from "@/pages/DataSourcesPage.vue";

type ShellPageItem = {
  id: string;
  label: string;
  route: string;
  testId: string;
  component: typeof PortfolioPage;
};

const pages: ShellPageItem[] = [
  {
    id: "portfolio",
    label: "持仓与组合",
    route: "/portfolio",
    testId: "shell-nav-portfolio",
    component: PortfolioPage,
  },
  {
    id: "analytics",
    label: "收益分析",
    route: "/analytics",
    testId: "shell-nav-analytics",
    component: AnalyticsPage,
  },
  {
    id: "accounts",
    label: "账户与现金",
    route: "/accounts",
    testId: "shell-nav-accounts",
    component: AccountsPage,
  },
  {
    id: "trades",
    label: "交易与现金",
    route: "/trades",
    testId: "shell-nav-trades",
    component: TradesPage,
  },
  {
    id: "data-sources",
    label: "数据源",
    route: "/data-sources",
    testId: "shell-nav-data-sources",
    component: DataSourcesPage,
  },
];

const pendingPages: Array<{ label: string; route: string }> = [];

const activePageId = ref("portfolio");
const sidebarVisible = ref(true);
const activePage = computed(
  () => pages.find((page) => page.id === activePageId.value) ?? pages[0],
);

const reviewStateOptions = [
  { value: "normal", label: "正常数据" },
  { value: "empty", label: "空状态" },
  { value: "stale", label: "缓存降级" },
  { value: "insufficient", label: "历史数据不足" },
];
const reviewState = ref("normal");

const isDark = ref(false);
watch(isDark, (value) => {
  document.documentElement.classList.toggle("dark", value);
});
onMounted(() => {
  document.documentElement.classList.toggle("dark", isDark.value);
});

const refreshing = ref(false);
const lastRefreshAt = ref("2026-09-18 15:00");

function refreshQuotes() {
  refreshing.value = true;
  window.setTimeout(() => {
    refreshing.value = false;
    lastRefreshAt.value = "2026-09-21 14:32";
  }, 600);
}
</script>

<template>
  <div class="min-h-screen bg-background text-foreground">
    <div class="mx-auto grid min-h-screen max-w-[1440px] gap-4 p-4" :class="sidebarVisible ? 'grid-cols-[248px_minmax(0,1fr)]' : 'grid-cols-[minmax(0,1fr)]'">
      <aside v-show="sidebarVisible" class="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-border bg-card">
        <header class="border-b border-border p-4">
          <div class="flex items-center gap-2">
            <img src="/icon.svg" alt="MyPortfolio" class="h-6 w-6 rounded" />
            <h1 class="text-sm font-semibold">MyPortfolio</h1>
          </div>
          <p class="mt-1 text-xs text-muted-foreground">本地投资组合记录与分析工具 · 仅 Windows</p>
        </header>

        <nav class="grid content-start gap-1 overflow-y-auto p-3" aria-label="原型导航">
          <Button
            v-for="page in pages"
            :key="page.id"
            type="button"
            variant="ghost"
            class="justify-start"
            :class="activePage.id === page.id ? 'bg-primary-soft text-primary-strong hover:bg-primary-soft hover:text-primary-strong' : ''"
            :data-testid="page.testId"
            @click="activePageId = page.id"
          >
            {{ page.label }}
          </Button>

          <Button
            v-for="page in pendingPages"
            :key="page.route"
            type="button"
            variant="ghost"
            class="justify-start text-muted-foreground"
            disabled
          >
            {{ page.label }}
          </Button>
        </nav>
      </aside>

      <main class="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-border bg-card">
        <header class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div class="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="shell-action-toggle-sidebar"
              @click="sidebarVisible = !sidebarVisible"
            >
              <PanelLeftClose v-if="sidebarVisible" class="h-4 w-4" />
              <PanelLeftOpen v-else class="h-4 w-4" />
            </Button>
            <div>
              <h2 class="text-sm font-medium">{{ activePage.label }}</h2>
              <p class="text-xs text-muted-foreground">{{ activePage.route }}</p>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <label class="flex items-center gap-2 text-xs text-muted-foreground">
              评审用数据状态
              <select
                v-model="reviewState"
                class="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
                data-testid="shell-select-review-state"
              >
                <option v-for="option in reviewStateOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </label>

            <span class="text-xs text-muted-foreground">数据时间 {{ lastRefreshAt }}</span>

            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="shell-action-toggle-theme"
              @click="isDark = !isDark"
            >
              {{ isDark ? "浅色主题" : "暗色主题" }}
            </Button>

            <Button
              type="button"
              size="sm"
              :disabled="refreshing"
              data-testid="shell-action-refresh"
              @click="refreshQuotes"
            >
              {{ refreshing ? "刷新中" : "刷新行情" }}
            </Button>
          </div>
        </header>

        <section class="min-h-0 overflow-y-auto">
          <component :is="activePage.component" :review-state="reviewState" :dark-mode="isDark" />
        </section>
      </main>
    </div>
  </div>
</template>
