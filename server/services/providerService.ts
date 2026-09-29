import type { Database } from "sql.js";
import { query, run } from "../db/database.ts";
import { getPreference, setPreference } from "./preferenceService.ts";

export const TIMEOUT_MIN = 1;
export const TIMEOUT_MAX = 10;
export const TIMEOUT_DEFAULT = 3;
export const ALLOWED_HOSTS = ["qt.gtimg.cn", "hq.sinajs.cn", "fund.eastmoney.com", "push2.eastmoney.com"];

export type ProviderRow = Record<string, unknown>;

export function listProviders(db: Database, kind?: string): ProviderRow[] {
  return kind
    ? query(db, "SELECT * FROM provider WHERE kind=? ORDER BY priority", [kind])
    : query(db, "SELECT * FROM provider ORDER BY kind, priority");
}

export function normalizeTimeout(value: unknown): { timeoutSeconds: number; message?: string } {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < TIMEOUT_MIN || parsed > TIMEOUT_MAX) {
    return { timeoutSeconds: TIMEOUT_DEFAULT, message: `超时值需在 ${TIMEOUT_MIN} 至 ${TIMEOUT_MAX} 秒之间，已回退默认值` };
  }
  return { timeoutSeconds: parsed };
}

export function saveProvider(
  db: Database,
  input: { id?: string; name: string; kind: string; priority?: number; enabled?: boolean; timeoutSeconds?: number; url?: string },
): { ok: boolean; id?: string; message?: string; timeoutSeconds?: number } {
  if (!["QUOTE", "NAV", "FX"].includes(input.kind)) return { ok: false, message: "数据源类型无效" };
  const timeout = normalizeTimeout(input.timeoutSeconds);
  if (input.url) {
    let host = "";
    try {
      host = new URL(input.url).host;
    } catch {
      return { ok: false, message: "不支持自定义数据源地址" };
    }
    if (!ALLOWED_HOSTS.includes(host)) return { ok: false, message: "不支持自定义数据源地址" };
  }
  const id = input.id ?? `src-${input.kind.toLowerCase()}-${input.name}`;
  const enabled = input.enabled === false ? 0 : 1;
  const others = query(db, "SELECT id FROM provider WHERE enabled=1 AND id<>?", [input.id ?? ""]);
  if (enabled === 0 && !others.length) {
    return { ok: false, message: "请至少启用一个数据源", timeoutSeconds: timeout.timeoutSeconds };
  }
  run(
    db,
    "INSERT INTO provider (id, name, kind, priority, enabled, timeout_seconds, url) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, priority=excluded.priority, enabled=excluded.enabled, timeout_seconds=excluded.timeout_seconds",
    [id, input.name, input.kind, input.priority ?? 1, enabled, timeout.timeoutSeconds, input.url ?? `https://${ALLOWED_HOSTS[0]}/`],
  );
  return { ok: true, id, timeoutSeconds: timeout.timeoutSeconds, message: timeout.message };
}

export function resolveProvider(db: Database, kind: string): ProviderRow | null {
  const rows = query(db, "SELECT * FROM provider WHERE kind=? AND enabled=1 ORDER BY priority", [kind]);
  return rows.length ? rows[0] : null;
}

export async function probeProvider(
  db: Database,
  providerId: string,
  fetcher: (provider: ProviderRow) => Promise<unknown>,
  now = new Date(),
): Promise<{ ok: boolean; message: string; checkedAt: string }> {
  const rows = query(db, "SELECT * FROM provider WHERE id=?", [providerId]);
  if (!rows.length) return { ok: false, message: "数据源不存在", checkedAt: now.toISOString() };
  const provider = rows[0];
  let ok = true;
  let message = "连通正常";
  const started = Date.now();
  try {
    await fetcher(provider);
  } catch (error) {
    ok = false;
    message = `数据源不可用：${error instanceof Error ? error.message : String(error)}`;
  }
  const latency = Date.now() - started;
  run(db, "UPDATE provider SET last_check_at=?, last_check_status=?, last_check_message=? WHERE id=?", [
    now.toISOString(),
    ok ? "OK" : "FAILED",
    message,
    providerId,
  ]);
  return { ok, message: ok ? `连通正常（${latency}ms）` : message, checkedAt: now.toISOString() };
}

export function getRefreshInterval(db: Database): { seconds: number; message?: string } {
  const stored = Number(getPreference(db, "refresh_interval_seconds", "60"));
  if (!Number.isInteger(stored) || stored < 30) {
    setPreference(db, "refresh_interval_seconds", "60");
    return { seconds: 60, message: "自动刷新周期不得小于 30 秒，已回退默认值" };
  }
  return { seconds: stored };
}

export function setRefreshInterval(db: Database, seconds: number): { seconds: number; message?: string } {
  if (!Number.isInteger(seconds) || seconds < 30) {
    setPreference(db, "refresh_interval_seconds", "60");
    return { seconds: 60, message: "自动刷新周期不得小于 30 秒，已回退默认值" };
  }
  setPreference(db, "refresh_interval_seconds", String(seconds));
  return { seconds, message: `自动刷新周期已设为 ${seconds} 秒` };
}