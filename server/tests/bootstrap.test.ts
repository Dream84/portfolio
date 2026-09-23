import { describe, expect, it } from "vitest";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { checkRuntime } from "../bootstrap/checkRuntime.ts";

describe("任务 2 初始化与运行前置检查", () => {
  it("AC-011 三项检查通过时返回可用", async () => {
    const dir = path.join(os.tmpdir(), `myportfolio-${Date.now()}`);
    const result = await checkRuntime({ dataDir: dir, port: 18787, nodeVersion: "20.18.1" });
    expect(result.ok).toBe(true);
    expect(result.items).toHaveLength(3);
  });

  it("AC-012 数据目录不可写时停止并给出具体原因", async () => {
    const result = await checkRuntime({ dataDir: "Z:/不存在的数据目录/data", port: 18788, nodeVersion: "20.18.1" });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("数据目录不可写");
  });

  it("AC-012 端口被占用时停止并给出具体原因", async () => {
    const server = net.createServer();
    await new Promise<void>((resolve) => server.listen(18789, "127.0.0.1", resolve));
    const result = await checkRuntime({ dataDir: path.join(os.tmpdir(), `myportfolio-${Date.now()}`), port: 18789, nodeVersion: "20.18.1" });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("端口被占用");
    server.close();
  });
});
