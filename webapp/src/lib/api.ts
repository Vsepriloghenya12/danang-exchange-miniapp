import type { AuthResponse, PairMarkups, TodayRatesResponse } from "./types";

let todayRatesCache: TodayRatesResponse | null = null;
let todayRatesPromise: Promise<TodayRatesResponse> | null = null;

export async function apiAuth(initData: string): Promise<AuthResponse> {
  const r = await fetch("/api/auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ initData })
  });
  return r.json();
}

export async function apiGetTodayRates(force = false): Promise<TodayRatesResponse> {
  if (!force && todayRatesCache) return todayRatesCache;
  if (!force && todayRatesPromise) return todayRatesPromise;

  todayRatesPromise = fetch("/api/rates/today")
    .then((r) => r.json())
    .then((json) => {
      todayRatesCache = json;
      return json;
    })
    .finally(() => {
      todayRatesPromise = null;
    });

  return todayRatesPromise;
}

export function apiClearTodayRatesCache() {
  todayRatesCache = null;
  todayRatesPromise = null;
}

export function getUsdtUsdPairMarkups(resp: { pairMarkups?: PairMarkups } | null | undefined) {
  return {
    buy: Number(resp?.pairMarkups?.USDT_USD?.buy ?? 0) || 0,
    sell: Number(resp?.pairMarkups?.USDT_USD?.sell ?? 0) || 0
  };
}

export async function apiAdminSetTodayRates(initData: string, rates: any, pairMarkups?: PairMarkups) {
  const r = await fetch("/api/admin/rates/today", {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-init-data": initData },
    body: JSON.stringify({ rates, pairMarkups })
  });
  const json = await r.json();
  apiClearTodayRatesCache();
  return json;
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
