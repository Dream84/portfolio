/**
 * MyPortfolio 启动器（零第三方依赖，只用 Node 内置模块）
 *
 * 作用：一个进程同时承担
 *   1) 静态站点服务：托管已构建的前端产物 dist/
 *   2) 接口代理：把 /api/* 转发到本机 API（默认 8787）
 *   3) 拉起后端 API 子进程（若 8787 未被占用）
 *   4) 打开默认浏览器、写 PID 文件、退出时清理子进程
 *
 * 用法：
 *   node launcher/app.mjs            启动并自动打开浏览器
 *   node launcher/app.mjs --no-open  只启动，不打开浏览器
 */
import http from "node:http";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const PID_FILE = path.join(ROOT, ".myportfolio.pid");
const API_HOST = "127.0.0.1";
const API_PORT = 8787;
const WEB_PORT_START = 5183;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

function portFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, API_HOST);
  });
}

async function pickPort(start, tries = 20) {
  for (let i = 0; i < tries; i += 1) {
    const port = start + i;
    if (await portFree(port)) return port;
  }
  throw new Error(`端口 ${start} 起的 ${tries} 个端口都被占用`);
}

function resolveNode() {
  const portable = path.join(ROOT, "runtime", process.platform === "win32" ? "node.exe" : "node");
  if (fs.existsSync(portable)) return portable;
  return process.execPath;
}

function startApi() {
  const tsx = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
  if (!fs.existsSync(tsx)) {
    console.log("[MyPortfolio] 未找到 node_modules/tsx，将只提供静态页面（接口不可用）");
    return null;
  }
  const child = spawn(resolveNode(), [tsx, "server/index.ts"], { cwd: ROOT, stdio: "inherit" });
  child.on("exit", (code) => {
    if (!stopping) console.log(`[MyPortfolio] 接口服务已退出（code=${code}）`);
  });
  return child;
}

function proxy(req, res) {
  const upstream = http.request(
    { host: API_HOST, port: API_PORT, path: req.url, method: req.method, headers: req.headers },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );
  upstream.on("error", (error) => {
    res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ message: `接口服务不可用：${error.message}` }));
  });
  req.pipe(upstream);
}

function serveStatic(req, res) {
  const url = new URL(req.url ?? "/", "http://localhost");
  let filePath = path.join(DIST, decodeURIComponent(url.pathname));
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403);
    return res.end("forbidden");
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST, "index.html");
  }
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("未找到前端产物，请先执行一次构建（npm run build）或使用已发布的 dist 目录");
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] ?? "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

let apiChild = null;
let stopping = false;

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  try {
    fs.rmSync(PID_FILE, { force: true });
  } catch {
    /* 忽略 */
  }
  if (apiChild && apiChild.pid) {
    if (process.platform === "win32") {
      spawn("taskkill", ["/PID", String(apiChild.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      apiChild.kill("SIGTERM");
    }
  }
  console.log("[MyPortfolio] 已停止");
  setTimeout(() => process.exit(code), 300);
}

const apiReachable = !(await portFree(API_PORT));
if (apiReachable) {
  console.log(`[MyPortfolio] 检测到 ${API_PORT} 已有接口服务在运行，直接复用`);
} else {
  apiChild = startApi();
}
const webPort = await pickPort(WEB_PORT_START);
const url = `http://${API_HOST}:${webPort}/`;

const server = http.createServer((req, res) => {
  if ((req.url ?? "").startsWith("/api/")) return proxy(req, res);
  return serveStatic(req, res);
});

server.listen(webPort, API_HOST, () => {
  fs.writeFileSync(PID_FILE, String(process.pid), "utf8");
  console.log("");
  console.log("  MyPortfolio 已启动");
  console.log(`  页面地址：${url}`);
  console.log("  退出方式：托盘图标右键选择「退出」，或运行「退出 MyPortfolio.cmd」");
  console.log("");
  if (!process.argv.includes("--no-open")) {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
  }
});

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("SIGBREAK", () => shutdown(0));
