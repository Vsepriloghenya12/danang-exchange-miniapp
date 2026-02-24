import type { AuthResponse, TodayRatesResponse, MarketRatesResponse } from "./types";

export async function apiAuth(initData: string): Promise<AuthResponse> {
  const r = await fetch("/api/auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ initData })
  });
  return r.json();
}

export async function apiGetTodayRates(): Promise<TodayRatesResponse> {
  const r = await fetch("/api/rates/today");
  return r.json();
}

// Backward-compat: older versions of RatesTab import this.
// В текущей версии «рыночный курс» не обязателен, но экспорт нужен, чтобы сборка не падала.
export async function apiGetMarketRates(): Promise<MarketRatesResponse> {
  const r = await fetch("/api/rates/market");
  // сервер может не иметь этого роута на старых деплоях
  if (!r.ok) return { ok: false, error: "market_rates_unavailable" } as any;
  return r.json();
}

export async function apiAdminSetTodayRates(initData: string, rates: any) {
  const r = await fetch("/api/admin/rates/today", {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-init-data": initData },
    body: JSON.stringify({ rates })
  });
  return r.json();
}

export async function apiAdminUsers(initData: string) {
  const r = await fetch("/api/admin/users", {
    headers: { "x-telegram-init-data": initData }
  });
  return r.json();
}

export async function apiAdminSetUserStatus(initData: string, tgId: number, status: string) {
  const r = await fetch(`/api/admin/users/${tgId}/status`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-init-data": initData },
    body: JSON.stringify({ status })
  });
  return r.json();
}

// --------------------
// Bonuses (надбавки)
// --------------------
export async function apiGetBonuses() {
  const r = await fetch("/api/config/bonuses");
  return r.json();
}

export async function apiAdminGetBonuses(initData: string) {
  const r = await fetch("/api/admin/bonuses", {
    headers: { "x-telegram-init-data": initData }
  });
  return r.json();
}

export async function apiAdminSetBonuses(initData: string, bonuses: any) {
  const r = await fetch("/api/admin/bonuses", {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-init-data": initData },
    body: JSON.stringify({ bonuses })
  });
  return r.json();
}

export async function apiGetReviews() {
  const r = await fetch("/api/reviews");
  return r.json();
}

export async function apiAddReview(initData: string, rating: number, text: string) {
  const r = await fetch("/api/reviews", {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-init-data": initData },
    body: JSON.stringify({ rating, text })
  });
  return r.json();
}
