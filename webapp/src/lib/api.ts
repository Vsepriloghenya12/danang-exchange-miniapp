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

export async function apiGetMarketRates(): Promise<MarketRatesResponse> {
  const r = await fetch("/api/market");
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

export async function apiAdminGetRequests(initData: string) {
  const r = await fetch("/api/admin/requests", {
    headers: { "x-telegram-init-data": initData }
  });
  return r.json();
}

export async function apiAdminSetRequestState(initData: string, id: string, state: string) {
  const r = await fetch(`/api/admin/requests/${encodeURIComponent(id)}/state`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-init-data": initData },
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
