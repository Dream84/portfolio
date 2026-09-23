import { expect, test } from "@playwright/test";

// 批次 4：UI 级验收（不含浏览器二进制下载，使用系统 Edge 与 Chrome）

test("DFX-USE-006 首屏渲染不超过 2 秒（AC-053）", async ({ page }) => {
  const started = Date.now();
  await page.goto("/");
  await expect(page.getByTestId("shell-nav-portfolio")).toBeVisible();
  const elapsed = Date.now() - started;
  const assets = await page.evaluate(() =>
    performance.getEntriesByType("resource").reduce((sum, entry) => sum + ((entry as PerformanceResourceTiming).transferSize || 0), 0),
  );
  console.log(`首屏耗时 ${elapsed}ms，资源传输 ${assets} 字节`);
  expect(elapsed).toBeLessThan(2000);
});

test("AC-022 / AC-018 资产总额、占比与关联账户", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("220,057.20").first()).toBeVisible();
  await expect(page.getByText("关联账户：2 个")).toBeVisible();
  await expect(page.getByText("现金折合人民币")).toBeVisible();
});

test("AC-024 / AC-062 饼图图例只含一级分类且不含数值", async ({ page }) => {
  await page.goto("/");
  const legend = page.getByTestId("portfolio-pie-legend").locator("li");
  await expect(legend).toHaveCount(4);
  const texts = await legend.allInnerTexts();
  expect(texts.join("|")).toMatch(/色：股票|色：基金|色：黄金|色：现金/);
  for (const item of texts) {
    expect(item).not.toMatch(/\d/);
  }
  await expect(legend.filter({ hasText: "债券基金" })).toHaveCount(0);
});

test("AC-025 / AC-026 数据时间与行级缓存标记", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("2026-09-18 15:00").first()).toBeVisible();
  await expect(page.getByTestId("portfolio-row-cache-badge")).toBeVisible();
});

test("AC-027 按一级分类筛选后条数与内容一致", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("portfolio-select-category-filter").selectOption("gold");
  await expect(page.getByText("共 1 条持仓")).toBeVisible();
  await expect(page.getByText("黄金ETF华安")).toBeVisible();
  await expect(page.getByText("贵州茅台")).toHaveCount(0);
});

test("AC-017 份额非法时阻止保存并显示逐字文案", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("portfolio-action-open-holding-new").click();
  await page.getByTestId("portfolio-dialog-holding-symbol").fill("000001");
  await page.getByTestId("portfolio-dialog-holding-quantity").fill("-5");
  await page.getByTestId("portfolio-dialog-holding-cost").fill("11");
  await page.getByTestId("portfolio-dialog-holding-action-save").click();
  await expect(page.getByText("请输入大于 0 的数字")).toBeVisible();
});

test("AC-021 删除预设分类被拒绝并显示逐字文案", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("portfolio-action-open-category-manage").click();
  const drawer = page.getByTestId("portfolio-dialog-category");
  await drawer.getByText("债券基金", { exact: true }).click();
  await drawer.getByTestId("portfolio-dialog-category-action-delete").click();
  await expect(page.getByText("为预设分类，不可删除")).toBeVisible();
});

test("AC-063 分类层级明细显示子项占比与一级总收益", async ({ page }) => {
  await page.goto("/");
  const fundRow = page.locator("tr", { hasText: "基金" }).first();
  await expect(fundRow).toContainText("100.00%");
  await expect(page.getByText("债券基金", { exact: true }).first()).toBeVisible();
});

test("AC-055 收益分析指标卡与曲线渲染", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("shell-nav-analytics").click();
  await expect(page.getByText("220,057.20").first()).toBeVisible();
  await expect(page.getByText("211,491.20").first()).toBeVisible();
  await expect(page.getByText("4.0503%").first()).toBeVisible();
  await expect(page.locator("canvas").first()).toBeVisible();
});

test("AC-059 / AC-060 维度切换到无持仓账户显示空态", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("shell-nav-analytics").click();
  await page.getByTestId("analytics-dimension-account").click();
  await page.getByTestId("analytics-select-account").selectOption("pension");
  await expect(page.getByText("所选维度暂无持仓").first()).toBeVisible();
});

test("AC-066 自定义时间段日期非法时阻止查询", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("shell-nav-analytics").click();
  await page.getByTestId("analytics-select-range").selectOption("CUSTOM");
  await page.getByTestId("analytics-input-range-start").fill("2026-09-18");
  await page.getByTestId("analytics-input-range-end").fill("2026-04-01");
  await expect(page.getByText("请选择有效的日期范围")).toBeVisible();
});

test("AC-067 一级与二级分类口径切换", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("shell-nav-analytics").click();
  await page.getByTestId("analytics-select-l1").selectOption("fund");
  await expect(page.getByTestId("analytics-select-l2")).toContainText("债券基金");
  await page.getByTestId("analytics-select-l2").selectOption("fund-bond");
  await expect(page.getByText("21,486.00").first()).toBeVisible();
  await expect(page.getByText("2.3143%").first()).toBeVisible();
});

test("AC-057 / AC-058 快照生成与受影响日期重算", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("shell-nav-analytics").click();
  await page.getByTestId("analytics-action-generate-snapshot").click();
  await expect(page.getByText("已生成 2026-09-21 快照")).toBeVisible();
  await page.getByTestId("analytics-action-regenerate-snapshot").click();
  await expect(page.getByText("已重新生成 2026-09-19 的快照")).toBeVisible();
});

test("主题与侧栏交互可用（CON-3）", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("shell-action-toggle-theme").click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByTestId("shell-action-toggle-sidebar").click();
  await expect(page.getByTestId("shell-nav-portfolio")).toBeHidden();
});
