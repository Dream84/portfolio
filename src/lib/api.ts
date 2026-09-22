export type Summary = {
  totalValue: number;
  totalCost: number;
  floatingPnl: number;
  cashValue: number;
  dataTime: string;
  stale: boolean;
  staleCount: number;
  shares: Array<{ key: string; name: string; colorToken: string; value: number; share: number; pnl: number }>;
  shareTotal: number;
  accounts: string[];
  holdings: Array<{
    id: string;
    accountId: string;
    symbol: string;
    name: string;
    categoryKey: string;
    quantity: number;
    costPrice: number;
    costOverridden: boolean;
  }>;
};

export type CategoryRow = {
  key: string;
  name: string;
  level: "L1" | "L2";
  parentKey: string | null;
  preset: boolean;
  colorToken: string;
};

export type BreakdownRow = {
  key: string;
  name: string;
  value: number;
  pnl: number;
  shareOfTotal: number;
  children: Array<{ key: string; name: string; value: number; pnl: number; shareOfTotal: number; shareOfParent: number }>;
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json()) as T & { message?: string };
  if (!res.ok) throw new Error(body.message ?? `请求失败：${res.status}`);
  return body;
}

export const api = {
  summary: (portfolioId: string) => request<Summary>(`/api/summary?portfolioId=${portfolioId}`),
  breakdown: (portfolioId: string) => request<{ rows: BreakdownRow[] }>(`/api/breakdown?portfolioId=${portfolioId}`),
  categories: () => request<{ categories: CategoryRow[] }>("/api/categories"),
  saveHolding: (payload: Record<string, unknown>) =>
    request<{ ok: boolean; id?: string }>("/api/holdings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  removeCategory: (key: string) =>
    request<{ ok: boolean; message?: string }>("/api/categories/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    }),
};
