import type {
  AuthResponse,
  TodayRatesResponse,
  MarketRatesResponse,
  AtmsResponse,
  AtmItem,
  BonusesConfig,
  BonusesResponse,
  BankIconsResponse,
  StaffRequestsResponse,
  MyRequestsResponse,
  AdminContactsResponse,
  AdminAdminsResponse,
  AdminBlacklistResponse,
  PublishTemplateResponse,
  PublishResponse,
  ReportsResponse,
  AdminRatesRangeResponse,
  Contact,
  AfishaResponse,
  AdminAfishaResponse,
  FaqResponse
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

async function readJsonSafe(r: Response): Promise<any> {
  const txt = await r.text();
  try {
    return JSON.parse(txt);
  } catch {
    return { ok: false, error: txt || `HTTP ${r.status}` };
  }
}



type CacheEntry = { exp: number; data?: any; promise?: Promise<any> };
const __mxGetCache = new Map<string, CacheEntry>();

function cacheKey(url: string, init?: RequestInit) {
  const method = String(init?.method || "GET").toUpperCase();
  const headers = init?.headers ? JSON.stringify(init.headers) : "";
  return `${method} ${url} ${headers}`;
}

async function getJsonCached<T = any>(url: string, ttlMs = 45_000, init?: RequestInit, safe = false): Promise<T> {
  const key = cacheKey(url, init);
  const now = Date.now();
  const hit = __mxGetCache.get(key);
  if (hit && hit.data !== undefined && hit.exp > now) return hit.data as T;
  if (hit?.promise) return hit.promise as Promise<T>;

  const prom = (async () => {
    const r = await fetch(url, init);
    const data = safe ? await readJsonSafe(r) : await r.json();
    __mxGetCache.set(key, { exp: Date.now() + ttlMs, data });
    return data as T;
  })().catch((e) => {
    __mxGetCache.delete(key);
    throw e;
  });

  __mxGetCache.set(key, { exp: now + ttlMs, promise: prom });
  return prom;
}

export function apiWarmup() {
  return {
    todayRates: () => getJsonCached<TodayRatesResponse>("/api/rates/today", 60_000),
    marketRates: () => getJsonCached<MarketRatesResponse>("/api/market", 60_000),
    gFormulas: () => getJsonCached("/api/g-formulas", 60_000, undefined, true),
    faq: () => getJsonCached<FaqResponse>("/api/faq", 5 * 60_000, undefined, true),
    reviews: () => getJsonCached("/api/reviews", 60_000),
    atms: () => getJsonCached<AtmsResponse>("/api/atms", 5 * 60_000),
    bonuses: () => getJsonCached<BonusesResponse>("/api/bonuses", 60_000),
    bankIcons: () => getJsonCached<BankIconsResponse>("/api/banks/icons", 5 * 60_000),
    afisha: (params: { category?: string; from?: string; to?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.category) q.set('category', params.category);
      if (params.from) q.set('from', params.from);
      if (params.to) q.set('to', params.to);
      return getJsonCached<AfishaResponse>(`/api/afisha?${q.toString()}`, 60_000, undefined, true);
    },
    myRequests: (initData: string) => getJsonCached<MyRequestsResponse>("/api/requests/mine", 20_000, { headers: { "x-telegram-init-data": initData } }, true),
  };
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
  return getJsonCached<TodayRatesResponse>("/api/rates/today", 60_000);
}


export async function apiGetMarketRates(): Promise<MarketRatesResponse> {
  return getJsonCached<MarketRatesResponse>("/api/market", 60_000);
}

// Cross-pair formulas (multipliers)
export async function apiGetGFormulas() {
  return getJsonCached("/api/g-formulas", 60_000, undefined, true);
}

export async function apiAdminGetGFormulas(token: string) {
  const r = await fetch("/api/admin/g-formulas", {
    headers: { ...adminAuthHeaders(token) }
  });
  return readJsonSafe(r);
}

export async function apiAdminSetGFormulas(token: string, formulas: any) {
  const r = await fetch("/api/admin/g-formulas", {
    method: "POST",
    headers: { "content-type": "application/json", ...adminAuthHeaders(token) },
    body: JSON.stringify({ formulas })
  });
  return readJsonSafe(r);
}


export async function apiGetFaq(): Promise<FaqResponse> {
  return getJsonCached<FaqResponse>("/api/faq", 5 * 60_000, undefined, true);
}

export async function apiAdminGetFaq(token: string): Promise<FaqResponse> {
  const r = await fetch("/api/admin/faq", {
    headers: { ...adminAuthHeaders(token) }
  });
  return readJsonSafe(r);
}

export async function apiAdminSetFaq(token: string, items: any): Promise<FaqResponse> {
  const r = await fetch("/api/admin/faq", {
    method: "POST",
    headers: { "content-type": "application/json", ...adminAuthHeaders(token) },
    body: JSON.stringify({ items })
  });
  return readJsonSafe(r);
}

export async function apiAdminSetTodayRates(initData: string, rates: any) {
  const r = await fetch("/api/admin/rates/today", {
    method: "POST",
    headers: { "content-type": "application/json", ...adminAuthHeaders(initData) },
    body: JSON.stringify({ rates })
  });
  return r.json();
}

export async function apiAdminSetRatesForDate(initData: string, date: string, rates: any) {
  const r = await fetch("/api/admin/rates/date", {
    method: "POST",
    headers: { "content-type": "application/json", ...adminAuthHeaders(initData) },
    body: JSON.stringify({ date, rates })
  });
  return readJsonSafe(r);
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

export async function apiAdminMessageUser(token: string, payload: { tg_id: number; text: string; request_id?: string }) {
  const r = await fetch("/api/admin/message-user", {
    method: "POST",
    headers: { "content-type": "application/json", ...adminAuthHeaders(token) },
    body: JSON.stringify(payload)
  });
  return readJsonSafe(r);
}

export async function apiAdminGetSupportDialog(token: string, tgId: number, markRead = true) {
  const qs = markRead ? "?markRead=1" : "?markRead=0";
  const r = await fetch(`/api/admin/support-dialog/${encodeURIComponent(String(tgId))}${qs}`, {
    headers: { ...adminAuthHeaders(token) }
  });
  return readJsonSafe(r);
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
  return getJsonCached("/api/reviews", 60_000);
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

// --------------------
// Client: my requests (history)
// --------------------
export async function apiGetMyRequests(initData: string): Promise<MyRequestsResponse> {
  return getJsonCached<MyRequestsResponse>("/api/requests/mine", 20_000, {
    headers: { "x-telegram-init-data": initData }
  }, true);
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
  return getJsonCached<AtmsResponse>("/api/atms", 5 * 60_000);
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
  return getJsonCached<BonusesResponse>("/api/bonuses", 60_000);
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

// --------------------
// Bank icons
// --------------------
export async function apiGetBankIcons(): Promise<BankIconsResponse> {
  return getJsonCached<BankIconsResponse>("/api/banks/icons", 5 * 60_000);
}

// --------------------
// Staff (miniapp admin)
// --------------------
export async function apiStaffGetRequests(initData: string): Promise<StaffRequestsResponse> {
  const r = await fetch("/api/staff/requests", {
    headers: { "x-telegram-init-data": initData }
  });
  return r.json();
}

export async function apiStaffSetRequestState(initData: string, id: string, state: string) {
  const r = await fetch(`/api/staff/requests/${encodeURIComponent(id)}/state`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-init-data": initData },
    body: JSON.stringify({ state })
  });
  return r.json();
}

export async function apiStaffUpdateRequest(initData: string, id: string, payload: any) {
  const r = await fetch(`/api/staff/requests/${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-init-data": initData },
    body: JSON.stringify(payload)
  });
  return readJsonSafe(r);
}

export async function apiStaffUpsertContact(
  initData: string,
  payload: Partial<Contact> & { tg_id?: number; username?: string }
) {
  const r = await fetch(`/api/staff/contacts/upsert`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-init-data": initData },
    body: JSON.stringify(payload)
  });
  return r.json();
}

// --------------------
// Owner (browser /admin)
// --------------------
export async function apiAdminGetAdmins(token: string): Promise<AdminAdminsResponse> {
  const r = await fetch("/api/admin/admins", {
    headers: { ...adminAuthHeaders(token) }
  });
  return r.json();
}

export async function apiAdminSetAdmins(token: string, adminTgIds: number[]): Promise<AdminAdminsResponse> {
  const r = await fetch("/api/admin/admins", {
    method: "POST",
    headers: { "content-type": "application/json", ...adminAuthHeaders(token) },
    body: JSON.stringify({ adminTgIds })
  });
  return r.json();
}

export async function apiAdminGetBlacklist(token: string): Promise<AdminBlacklistResponse> {
  const r = await fetch("/api/admin/blacklist", {
    headers: { ...adminAuthHeaders(token) }
  });
  return r.json();
}

export async function apiAdminSetBlacklist(token: string, usernames: string[]): Promise<AdminBlacklistResponse> {
  const r = await fetch("/api/admin/blacklist", {
    method: "POST",
    headers: { "content-type": "application/json", ...adminAuthHeaders(token) },
    body: JSON.stringify({ usernames })
  });
  return r.json();
}

export async function apiAdminGetPublishTemplate(token: string): Promise<PublishTemplateResponse> {
  const r = await fetch("/api/admin/publish-template", {
    headers: { ...adminAuthHeaders(token) }
  });
  return r.json();
}

export async function apiAdminSetPublishTemplate(token: string, template: string): Promise<PublishTemplateResponse> {
  const r = await fetch("/api/admin/publish-template", {
    method: "POST",
    headers: { "content-type": "application/json", ...adminAuthHeaders(token) },
    body: JSON.stringify({ template })
  });
  return r.json();
}

export async function apiAdminPublish(token: string, payload: { template?: string; imageDataUrl?: string | null }): Promise<PublishResponse> {
  const r = await fetch("/api/admin/publish", {
    method: "POST",
    headers: { "content-type": "application/json", ...adminAuthHeaders(token) },
    body: JSON.stringify(payload)
  });
  return readJsonSafe(r);
}


export async function apiAdminGetContacts(token: string): Promise<AdminContactsResponse> {
  const r = await fetch("/api/admin/contacts", {
    headers: { ...adminAuthHeaders(token) }
  });
  return r.json();
}

export async function apiAdminUpsertContact(token: string, payload: Partial<Contact> & { username?: string; tg_id?: number }): Promise<any> {
  const r = await fetch("/api/admin/contacts/upsert", {
    method: "POST",
    headers: { "content-type": "application/json", ...adminAuthHeaders(token) },
    body: JSON.stringify(payload)
  });
  return r.json();
}

export async function apiAdminGetReports(token: string, params: { from: string; to: string; onlyDone?: boolean; tgId?: number }): Promise<ReportsResponse> {
  const q = new URLSearchParams();
  q.set("from", params.from);
  q.set("to", params.to);
  if (params.onlyDone != null) q.set("onlyDone", String(params.onlyDone ? 1 : 0));
  if (params.tgId) q.set("tgId", String(params.tgId));
  const r = await fetch(`/api/admin/reports?${q.toString()}` , {
    headers: { ...adminAuthHeaders(token) }
  });
  return readJsonSafe(r);
}

export async function apiAdminGetRatesRange(token: string, params: { from: string; to: string }): Promise<AdminRatesRangeResponse> {
  const q = new URLSearchParams();
  q.set("from", params.from);
  q.set("to", params.to);
  const r = await fetch(`/api/admin/rates/range?${q.toString()}`, {
    headers: { ...adminAuthHeaders(token) }
  });
  return readJsonSafe(r);
}


// --------------------
// Afisha
// --------------------
export async function apiGetAfisha(params: { category?: string; from?: string; to?: string } = {}): Promise<AfishaResponse> {
  const q = new URLSearchParams();
  if (params.category) q.set('category', params.category);
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  return getJsonCached<AfishaResponse>(`/api/afisha?${q.toString()}`, 60_000, undefined, true);
}

export async function apiAfishaClick(initData: string, id: string, kind: 'details' | 'location') {
  const r = await fetch('/api/afisha/click', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-init-data': initData },
    body: JSON.stringify({ id, kind })
  });
  return readJsonSafe(r);
}

export async function apiAdminGetAfisha(token: string, params: { scope?: 'active' | 'history' | 'all'; from?: string; to?: string } = {}): Promise<AdminAfishaResponse> {
  const q = new URLSearchParams();
  if (params.scope) q.set('scope', params.scope);
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  const r = await fetch(`/api/admin/afisha?${q.toString()}`, {
    headers: { ...adminAuthHeaders(token) }
  });
  return readJsonSafe(r);
}

export async function apiAdminCreateAfisha(
  token: string,
  payload: { category: string; date: string; title: string; comment?: string; detailsUrl: string; locationUrl: string; imageDataUrl?: string | null }
): Promise<any> {
  const r = await fetch('/api/admin/afisha', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...adminAuthHeaders(token) },
    body: JSON.stringify(payload)
  });
  return readJsonSafe(r);
}

export async function apiAdminUpdateAfisha(
  token: string,
  id: string,
  payload: Partial<{ category: string; date: string; title: string; comment?: string; detailsUrl: string; locationUrl: string; imageDataUrl?: string | null }>
): Promise<any> {
  const r = await fetch(`/api/admin/afisha/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...adminAuthHeaders(token) },
    body: JSON.stringify(payload)
  });
  return readJsonSafe(r);
}


export async function apiAdminEventsSummary(
  token: string,
  params: { from?: string; to?: string } = {}
): Promise<any> {
  const qs = new URLSearchParams();
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  const url = `/api/admin/events/summary${qs.toString() ? `?${qs.toString()}` : ""}`;
  const r = await fetch(url, { cache: "no-store", headers: { ...adminAuthHeaders(token), "cache-control": "no-cache" } });
  return readJsonSafe(r);
}

export async function apiEvent(
  initData: string,
  payload: {
    name: string;
    sessionId?: string;
    props?: any;
    path?: string;
    platform?: string;
    appVersion?: string;
  }
) {
  const r = await fetch("/api/events", {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-init-data": initData },
    body: JSON.stringify(payload)
  });
  return readJsonSafe(r);
}

// --------------------
// Client: suggest a new ATM location
// --------------------
export async function apiSuggestAtm(initData: string, text: string): Promise<any> {
  const r = await fetch("/api/atms/suggest", {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-init-data": initData },
    body: JSON.stringify({ text })
  });
  return readJsonSafe(r);
}

export function bankIconUrl(filename: string): string {
  return `/banks/${encodeURIComponent(String(filename || ""))}`;
}

