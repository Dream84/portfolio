import { expect, test } from "@playwright/test";

// 批次 D：三个新页面的 UI 级验收（零下载，使用系统 Edge 与 Chrome）

test("新页面可从左侧菜单进入并渲染四个区域（AC-041）", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("shell-nav-accounts").click();
  await expect(page.getByTestId("page-accounts")).toBeVisible();
  await page.getByTestId("shell-nav-trades").click();
  await expect(page.getByTestId("page-trades")).toBeVisible();
  await page.getByTestId("shell-nav-data-sources").click();
  await expect(page.getByTestId("page-data-sources")).toBeVisible();
  await expect(page.getByTestId("source-switch-region")).toBeVisible();
  await expect(page.getByTestId("refresh-setting-region")).toBeVisible();
  await expect(page.getByTestId("refresh-log-region")).toBeVisible();
});

test("AC-007 新增券商账户后列表新增 1 行且显示类型与状态", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("shell-nav-accounts").click();
  await expect(page.getByTestId("account-maintain-region")).toBeVisible();
  const name = `华泰证券e2e${Date.now()}`;
  await page.getByTestId("account-name").fill(name);
  await page.getByTestId("account-type").selectOption("BROKER");
  await page.getByTestId("account-save").click();
  await expect(page.getByTestId("account-message")).toHaveText("账户已保存");
  const row = page.getByTestId("account-list").locator("li", { hasText: name });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("券商");
  await expect(row).toContainText("启用");
});

test("AC-007 账户名称为空时拒绝保存并提示", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("shell-nav-accounts").click();
  await expect(page.getByTestId("account-maintain-region")).toBeVisible();
  await page.getByTestId("account-name").fill("   ");
  await page.getByTestId("account-save").click();
  await expect(page.getByTestId("account-message")).toHaveText("请输入账户名称");
});

test("AC-010 现金账户初始余额为负时逐字提示", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("shell-nav-accounts").click();
  await page.getByTestId("cash-account-name").fill("e2e负数账户");
  await page.getByTestId("cash-account-amount").fill("-1");
  await page.getByTestId("cash-account-save").click();
  await expect(page.getByTestId("cash-account-message")).toHaveText("请输入不小于 0 的金额");
});

test("AC-068 外币现金按汇率折算并标注手工覆盖", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("shell-nav-accounts").click();
  const usdName = `e2e美元现金${Date.now()}`;
  await page.getByTestId("cash-account-owner").selectOption({ label: "E2E 测试账户" });
  await page.getByTestId("cash-account-name").fill(usdName);
  await page.getByTestId("cash-account-currency").selectOption("USD");
  await page.getByTestId("cash-account-amount").fill("2000");
  await page.getByTestId("cash-account-rate").fill("6.6956");
  await page.getByTestId("cash-account-rate-time").fill("2026-09-21 14:32");
  await page.getByTestId("cash-account-save").click();
  await expect(page.getByTestId("cash-account-message")).toHaveText("现金账户已保存");
  await expect(page.getByTestId("cash-account-list")).toContainText(usdName);
  await expect(page.getByTestId("cash-account-list")).toContainText("6.6956（手工）");
});

test("AC-029 现金不足时拒绝买入并给出逐字提示", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("shell-nav-trades").click();
  await page.getByTestId("trade-type").selectOption("BUY");
  await page.getByTestId("trade-quantity").fill("100000000");
  await page.getByTestId("trade-price").fill("9999");
  await page.getByTestId("trade-save").click();
  await expect(page.getByTestId("trade-message")).toHaveText("现金账户余额不足");
});

test("AC-031 卖出份额超过持仓时逐字提示", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("shell-nav-trades").click();
  await page.getByTestId("trade-type").selectOption("SELL");
  await page.getByTestId("trade-quantity").fill("100000");
  await page.getByTestId("trade-price").fill("1500");
  await page.getByTestId("trade-save").click();
  await expect(page.getByTestId("trade-message")).toHaveText("卖出份额超过可用份额");
});

test("AC-035 收入金额为 0 时逐字提示", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("shell-nav-trades").click();
  await page.getByTestId("trade-type").selectOption("INCOME");
  await page.getByTestId("trade-amount").fill("0");
  await page.getByTestId("trade-save").click();
  await expect(page.getByTestId("trade-message")).toHaveText("请输入大于 0 的金额");
});

test("AC-043 / AC-047 刷新行情给出成功与失败计数并记录日志", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("shell-nav-data-sources").click();
  await page.getByTestId("quote-refresh").click();
  await expect(page.getByTestId("refresh-summary")).toHaveText(/更新成功 \d+ 个，失败 \d+ 个，缓存复用 \d+ 个/);
  await expect(page.getByTestId("refresh-last-time")).not.toHaveText("最近刷新时间：-");
});

test("AC-050 基金净值未发布时展示上一净值", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("shell-nav-data-sources").click();
  await page.getByTestId("fund-refresh").click();
  await expect(page.getByTestId("fund-refresh-message")).toHaveText("当日净值未发布，展示上一净值");
});

test("AC-045 自动刷新周期小于 30 秒时回退默认并提示", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("shell-nav-data-sources").click();
  await expect(page.getByTestId("page-data-sources")).toHaveAttribute("data-ready", "true");
  await expect(page.getByTestId("refresh-interval")).toHaveValue("60");
  await page.getByTestId("refresh-interval").fill("10");
  await expect(page.getByTestId("refresh-interval")).toHaveValue("10");
  await page.getByTestId("refresh-interval-save").click();
  await expect(page.getByTestId("refresh-interval-message")).toHaveText("自动刷新周期不得小于 30 秒，已回退默认值");
  await expect(page.getByTestId("refresh-interval")).toHaveValue("60");
});

test("AC-041 停用全部数据源时拒绝并逐字提示", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("shell-nav-data-sources").click();
  await expect(page.getByTestId("source-state-src-quote-a")).toBeVisible();
  for (const id of ["src-quote-a", "src-quote-b", "src-nav-a"]) {
    const state = (await page.getByTestId(`source-state-${id}`).textContent()) ?? "";
    if (state.includes("已启用")) await page.getByTestId(`source-toggle-${id}`).click();
  }
  await expect(page.getByTestId("source-message")).toHaveText("请至少启用一个数据源");
  await expect(page.getByTestId("source-state-src-nav-a")).toHaveText("已启用");
});

test("AC-041 连通性检测给出状态与检测时间", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("shell-nav-data-sources").click();
  await page.getByTestId("source-probe-src-quote-a").click();
  await expect(page.getByTestId("source-status-src-quote-a")).toHaveText(/最近检测：\d{4}-|连通正常|数据源不可用/);
});
