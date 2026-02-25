import type {
  AuthResponse,
  TodayRatesResponse,
  MarketRatesResponse,
  AtmsResponse,
  AtmItem,
  BonusesConfig,
  BonusesResponse
} from "./types";

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

export async function apiGetReviewEligible(initData: string) {
  const r = await fetch("/api/reviews/eligible", {
    headers: { "x-telegram-init-data": initData }
  });
  return r.json();
}

export async function apiAddReview(initData: string, params: { requestId: string; text: string; anonymous: boolean }) {
  const r = await fetch("/api/reviews", {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-init-data": initData },
    body: JSON.stringify(params)
  });
  return r.json();
}

// Admin reviews moderation
export async function apiAdminGetReviews(token: string) {
  const r = await fetch("/api/admin/reviews", {
    headers: { ...adminAuthHeaders(token) }
  });
  return r.json();
}

export async function apiAdminApproveReview(token: string, id: string) {
  const r = await fetch(`/api/admin/reviews/${encodeURIComponent(id)}/approve`, {
    method: "POST",
    headers: { "content-type": "application/json", ...adminAuthHeaders(token) }
  });
  return r.json();
}

export async function apiAdminRejectReview(token: string, id: string) {
  const r = await fetch(`/api/admin/reviews/${encodeURIComponent(id)}/reject`, {
    method: "POST",
    headers: { "content-type": "application/json", ...adminAuthHeaders(token) }
  });
  return r.json();
}

export async function apiAdminReplyReview(token: string, id: string, text: string) {
  const r = await fetch(`/api/admin/reviews/${encodeURIComponent(id)}/reply`, {
    method: "POST",
    headers: { "content-type": "application/json", ...adminAuthHeaders(token) },
    body: JSON.stringify({ text })
  });
  return r.json();
}

// --------------------
// ATMs
// --------------------
export async function apiGetAtms(): Promise<AtmsResponse> {
  const r = await fetch("/api/atms");
  return r.json();
}

export async function apiAdminGetAtms(token: string): Promise<AtmsResponse> {
  const r = await fetch("/api/admin/atms", {
    headers: { ...adminAuthHeaders(token) }
  });
  return r.json();
}

export async function apiAdminSetAtms(token: string, atms: AtmItem[]) {
  const r = await fetch("/api/admin/atms", {
    method: "POST",
    headers: { "content-type": "application/json", ...adminAuthHeaders(token) },
    body: JSON.stringify({ atms })
  });
  return r.json();
}

// --------------------
// Bonuses
// --------------------
export async function apiGetBonuses(): Promise<BonusesResponse> {
  const r = await fetch("/api/bonuses");
  return r.json();
}

export async function apiAdminGetBonuses(token: string): Promise<BonusesResponse> {
  const r = await fetch("/api/admin/bonuses", {
    headers: { ...adminAuthHeaders(token) }
  });
  return r.json();
}

export async function apiAdminSetBonuses(token: string, bonuses: BonusesConfig): Promise<BonusesResponse> {
  const r = await fetch("/api/admin/bonuses", {
    method: "POST",
    headers: { "content-type": "application/json", ...adminAuthHeaders(token) },
    body: JSON.stringify({ bonuses })
  });
  return r.json();
}
