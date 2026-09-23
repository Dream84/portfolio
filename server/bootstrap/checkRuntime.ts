import fs from "node:fs";
import path from "node:path";
import net from "node:net";

export type CheckItem = { name: string; ok: boolean; message: string };
export type CheckResult = { ok: boolean; items: CheckItem[]; message?: string };

export const MIN_NODE_MAJOR = 18;

export async function checkRuntime(input: {
  dataDir: string;
  port: number;
  nodeVersion?: string;
}): Promise<CheckResult> {
  const items: CheckItem[] = [];
  const nodeVersion = input.nodeVersion ?? process.versions.node;
  const major = Number(nodeVersion.split(".")[0]);
  items.push({
    name: "运行环境版本",
    ok: major >= MIN_NODE_MAJOR,
    message: major >= MIN_NODE_MAJOR ? `Node ${nodeVersion} 满足要求` : `运行环境版本过低，需要 Node ${MIN_NODE_MAJOR} 及以上`,
  });

  let dirOk = true;
  let dirMessage = `数据目录可用：${input.dataDir}`;
  const probe = path.join(input.dataDir, ".write-probe");
  try {
    fs.mkdirSync(input.dataDir, { recursive: true });
    fs.writeFileSync(probe, "ok");
    fs.rmSync(probe, { force: true });
  } catch {
    dirOk = false;
    dirMessage = `数据目录不可写：${input.dataDir}`;
  }
  items.push({ name: "数据目录写权限", ok: dirOk, message: dirMessage });

  const portOk = await probePort(input.port);
  items.push({
    name: "端口占用",
    ok: portOk,
    message: portOk ? `端口 ${input.port} 可用` : `端口被占用：${input.port}`,
  });

  const failed = items.filter((item) => !item.ok);
  return { ok: failed.length === 0, items, message: failed.length ? failed[0].message : undefined };
}

function probePort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });
}
