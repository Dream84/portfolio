import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createDatabase } from "../db/database.ts";
import { seedAll } from "../seed.ts";
import { createServer } from "../http.ts";

let server: Server;
let base = "";

beforeAll(async () => {
  const db = await createDatabase();
  seedAll(db);
  server = createServer(db);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  base = `http://127.0.0.1:${port}`;
});

afterAll(() => {
  server.close();
});

describe("服务层 HTTP 契约", () => {
  it("AC-022 / AC-023 查询组合汇总应返回总额、占比合计与降级标识", async () => {
    const res = await fetch(`${base}/api/summary?portfolioId=family`);
    const body = (await res.json()) as { totalValue: number; shareTotal: number; stale: boolean; dataTime: string };
    expect(res.status).toBe(200);
    expect(body.totalValue).toBeCloseTo(220057.2, 2);
    expect(body.shareTotal).toBeCloseTo(100, 2);
    expect(body.stale).toBe(true);
    expect(body.dataTime).toBe("2026-09-18 15:00");
  });

  it("AC-018 组合可关联多个账户，汇总应包含各账户持仓", async () => {
    const res = await fetch(`${base}/api/summary?portfolioId=family`);
    const body = (await res.json()) as { accounts: string[]; holdings: Array<{ accountId: string }> };
    expect(body.accounts.sort()).toEqual(["tiantian", "zhaoshang"]);
    const owners = Array.from(new Set(body.holdings.map((item) => item.accountId))).sort();
    expect(owners).toEqual(["tiantian", "zhaoshang"]);
  });

  it("AC-024 汇总占比只包含一级分类", async () => {
    const res = await fetch(`${base}/api/summary?portfolioId=family`);
    const body = (await res.json()) as { shares: Array<{ key: string }> };
    expect(body.shares.map((item) => item.key).sort()).toEqual(["cash", "fund", "gold", "stock"]);
  });

  it("AC-017 非法份额应返回 400 与逐字文案", async () => {
    const res = await fetch(`${base}/api/holdings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portfolioId: "family",
        accountId: "zhaoshang",
        symbol: "000001",
        name: "平安银行",
        categoryKey: "stock-a",
        quantity: -1,
        costPrice: 11,
      }),
    });
    const body = (await res.json()) as { message: string };
    expect(res.status).toBe(400);
    expect(body.message).toBe("请输入大于 0 的数字");
  });

  it("AC-021 删除被引用分类应返回 409 与引用数量", async () => {
    await fetch(`${base}/api/categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "gold-accumulate", name: "黄金积存", level: "L2", parentKey: "gold" }),
    });
    await fetch(`${base}/api/holdings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portfolioId: "family",
        accountId: "zhaoshang",
        symbol: "AU9999",
        name: "黄金9999",
        categoryKey: "gold-accumulate",
        quantity: 10,
        costPrice: 900,
      }),
    });
    const res = await fetch(`${base}/api/categories/remove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "gold-accumulate" }),
    });
    const body = (await res.json()) as { message: string; refCount: number };
    expect(res.status).toBe(409);
    expect(body.refCount).toBe(1);
    expect(body.message).toBe("该分类被 1 条持仓引用，无法删除");
  });

  it("AC-063 分类层级明细应返回子项占比与一级总收益", async () => {
    const res = await fetch(`${base}/api/breakdown?portfolioId=family`);
    const body = (await res.json()) as { rows: Array<{ key: string; pnl: number; children: Array<{ shareOfParent: number; pnl: number }> }> };
    const fund = body.rows.find((item) => item.key === "fund");
    expect(fund).toBeDefined();
    const shareSum = fund?.children.reduce((sum, child) => sum + child.shareOfParent, 0) ?? 0;
    expect(Number(shareSum.toFixed(2))).toBe(100);
    const childPnl = fund?.children.reduce((sum, child) => sum + child.pnl, 0) ?? 0;
    expect(Number(childPnl.toFixed(2))).toBeCloseTo(fund?.pnl ?? 0, 2);
  });
});
