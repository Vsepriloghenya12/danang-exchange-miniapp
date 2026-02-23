import type { AuthResponse, TodayRatesResponse, MarketRatesResponse } from "./types";

// Admin auth helper:
// - Telegram Mini App uses initData via header x-telegram-init-data
// - Standalone PC admin uses header x-admin-key
// We pass a token string. If it starts with "adminkey:", it will be sent as x-admin-key.
function adminAuthHeaders(token: string) {
  const t = String(token || "");
  if (t.startsWith("adminkey:")) {
    return { "x-admin-key": t.slice("adminkey:".length) };
  }
  return { "x-telegram-init-data": t };
}

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

export async function apiGetMarketRates(): Promise<MarketRatesResponse> {
  const r = await fetch("/api/market");
  return r.json();
}

export async function apiAdminSetTodayRates(initData: string, rates: any) {
  const r = await fetch("/api/admin/rates/today", {
    method: "POST",
    headers: { "content-type": "application/json", ...adminAuthHeaders(initData) },
    body: JSON.stringify({ rates })
  });
  return r.json();
}

export async function apiAdminUsers(initData: string) {
  const r = await fetch("/api/admin/users", {
    headers: { ...adminAuthHeaders(initData) }
  });
  return r.json();
}

export async function apiAdminSetUserStatus(initData: string, tgId: number, status: string) {
  const r = await fetch(`/api/admin/users/${tgId}/status`, {
    method: "POST",
    headers: { "content-type": "application/json", ...adminAuthHeaders(initData) },
    body: JSON.stringify({ status })
  });
  return r.json();
}

export async function apiAdminGetRequests(initData: string) {
  const r = await fetch("/api/admin/requests", {
    headers: { ...adminAuthHeaders(initData) }
  });
  return r.json();
}

export async function apiAdminSetRequestState(initData: string, id: string, state: string) {
  const r = await fetch(`/api/admin/requests/${encodeURIComponent(id)}/state`, {
    method: "POST",
    headers: { "content-type": "application/json", ...adminAuthHeaders(initData) },
    body: JSON.stringify({ state })
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
