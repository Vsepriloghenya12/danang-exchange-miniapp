import type { AtmsResponse, AuthResponse, TodayRatesResponse } from "./types";

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

// Админское чтение сегодняшних курсов (если используется отдельной админ-панелью)
export async function apiAdminGetTodayRates(initData: string): Promise<TodayRatesResponse> {
  const r = await fetch("/api/admin/rates/today", {
    headers: { "x-telegram-init-data": initData }
  });
  return r.json();
}

// Совместимость со старой вкладкой "Курс", где используется market rates.
// Если на сервере нет /api/rates/market — не падаем.
export async function apiGetMarketRates(): Promise<any> {
  try {
    const r = await fetch("/api/rates/market");
    if (!r.ok) return { ok: false, error: `http_${r.status}` };
    return await r.json();
  } catch {
    return { ok: false, error: "network" };
  }
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

// --------------------
// ATMs
// --------------------
export async function apiGetAtms(): Promise<AtmsResponse> {
  const r = await fetch("/api/atms");
  return r.json();
}

export async function apiAdminSetAtms(initData: string, atms: any) {
  const r = await fetch("/api/admin/atms", {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-init-data": initData },
    body: JSON.stringify({ atms })
  });
  return r.json();
}


// --------------------
// Admin: requests (совместимость)
// --------------------

// Получить список заявок (владелец)
export async function apiAdminGetRequests(initData: string) {
  try {
    const r = await fetch("/api/admin/requests", {
      headers: { "x-telegram-init-data": initData }
    });
    return await r.json();
  } catch {
    return { ok: false, error: "network" };
  }
}

// Поменять состояние заявки (владелец)
export async function apiAdminSetRequestState(initData: string, requestId: string, state: string) {
  try {
    const r = await fetch(`/api/admin/requests/${encodeURIComponent(requestId)}/state`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-telegram-init-data": initData },
      body: JSON.stringify({ state })
    });
    return await r.json();
  } catch {
    return { ok: false, error: "network" };
  }
}

