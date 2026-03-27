// Admin auth helper:
// - Telegram Mini App uses initData via header x-telegram-init-data
// - Standalone PC admin uses header x-admin-key
// We pass a token string. If it starts with "adminkey:", it will be sent as x-admin-key.
function adminAuthHeaders(token) {
    const t = String(token || "");
    if (t.startsWith("adminkey:")) {
        return { "x-admin-key": t.slice("adminkey:".length) };
    }
    return { "x-telegram-init-data": t };
}
async function readJsonSafe(r) {
    const txt = await r.text();
    try {
        return JSON.parse(txt);
    }
    catch {
        return { ok: false, error: txt || `HTTP ${r.status}` };
    }
}
const __mxGetCache = new Map();
function cacheKey(url, init) {
    const method = String(init?.method || "GET").toUpperCase();
    const headers = init?.headers ? JSON.stringify(init.headers) : "";
    return `${method} ${url} ${headers}`;
}
async function getJsonCached(url, ttlMs = 45_000, init, safe = false) {
    const key = cacheKey(url, init);
    const now = Date.now();
    const hit = __mxGetCache.get(key);
    if (hit && hit.data !== undefined && hit.exp > now)
        return hit.data;
    if (hit?.promise)
        return hit.promise;
    const prom = (async () => {
        const r = await fetch(url, init);
        const data = safe ? await readJsonSafe(r) : await r.json();
        __mxGetCache.set(key, { exp: Date.now() + ttlMs, data });
        return data;
    })().catch((e) => {
        __mxGetCache.delete(key);
        throw e;
    });
    __mxGetCache.set(key, { exp: now + ttlMs, promise: prom });
    return prom;
}
export function apiWarmup() {
    return {
        todayRates: () => getJsonCached("/api/rates/today", 60_000),
        marketRates: () => getJsonCached("/api/market", 60_000),
        gFormulas: () => getJsonCached("/api/g-formulas", 60_000, undefined, true),
        faq: () => getJsonCached("/api/faq", 5 * 60_000, undefined, true),
        reviews: () => getJsonCached("/api/reviews", 60_000),
        atms: () => getJsonCached("/api/atms", 5 * 60_000),
        bonuses: () => getJsonCached("/api/bonuses", 60_000),
        bankIcons: () => getJsonCached("/api/banks/icons", 5 * 60_000),
        afisha: (params = {}) => {
            const q = new URLSearchParams();
            if (params.category)
                q.set('category', params.category);
            if (params.from)
                q.set('from', params.from);
            if (params.to)
                q.set('to', params.to);
            return getJsonCached(`/api/afisha?${q.toString()}`, 60_000, undefined, true);
        },
        myRequests: (initData) => getJsonCached("/api/requests/mine", 20_000, { headers: { "x-telegram-init-data": initData } }, true),
    };
}
export async function apiAuth(initData) {
    const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData })
    });
    return r.json();
}
export async function apiGetTodayRates() {
    return getJsonCached("/api/rates/today", 60_000);
}
export async function apiGetMarketRates() {
    return getJsonCached("/api/market", 60_000);
}
// Cross-pair formulas (multipliers)
export async function apiGetGFormulas() {
    return getJsonCached("/api/g-formulas", 60_000, undefined, true);
}
export async function apiAdminGetGFormulas(token) {
    const r = await fetch("/api/admin/g-formulas", {
        headers: { ...adminAuthHeaders(token) }
    });
    return readJsonSafe(r);
}
export async function apiAdminSetGFormulas(token, formulas) {
    const r = await fetch("/api/admin/g-formulas", {
        method: "POST",
        headers: { "content-type": "application/json", ...adminAuthHeaders(token) },
        body: JSON.stringify({ formulas })
    });
    return readJsonSafe(r);
}
export async function apiGetFaq() {
    return getJsonCached("/api/faq", 5 * 60_000, undefined, true);
}
export async function apiAdminGetFaq(token) {
    const r = await fetch("/api/admin/faq", {
        headers: { ...adminAuthHeaders(token) }
    });
    return readJsonSafe(r);
}
export async function apiAdminSetFaq(token, items) {
    const r = await fetch("/api/admin/faq", {
        method: "POST",
        headers: { "content-type": "application/json", ...adminAuthHeaders(token) },
        body: JSON.stringify({ items })
    });
    return readJsonSafe(r);
}
export async function apiAdminSetTodayRates(initData, rates) {
    const r = await fetch("/api/admin/rates/today", {
        method: "POST",
        headers: { "content-type": "application/json", ...adminAuthHeaders(initData) },
        body: JSON.stringify({ rates })
    });
    return r.json();
}
export async function apiAdminSetRatesForDate(initData, date, rates) {
    const r = await fetch("/api/admin/rates/date", {
        method: "POST",
        headers: { "content-type": "application/json", ...adminAuthHeaders(initData) },
        body: JSON.stringify({ date, rates })
    });
    return readJsonSafe(r);
}
export async function apiAdminUsers(initData) {
    const r = await fetch("/api/admin/users", {
        headers: { ...adminAuthHeaders(initData) }
    });
    return r.json();
}
export async function apiAdminSetUserStatus(initData, tgId, status) {
    const r = await fetch(`/api/admin/users/${tgId}/status`, {
        method: "POST",
        headers: { "content-type": "application/json", ...adminAuthHeaders(initData) },
        body: JSON.stringify({ status })
    });
    return r.json();
}
export async function apiAdminGetRequests(initData) {
    const r = await fetch("/api/admin/requests", {
        headers: { ...adminAuthHeaders(initData) }
    });
    return r.json();
}
export async function apiAdminSetRequestState(initData, id, state) {
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
export async function apiGetReviewEligible(initData) {
    const r = await fetch("/api/reviews/eligible", {
        headers: { "x-telegram-init-data": initData }
    });
    return r.json();
}
export async function apiAddReview(initData, params) {
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
export async function apiGetMyRequests(initData) {
    return getJsonCached("/api/requests/mine", 20_000, {
        headers: { "x-telegram-init-data": initData }
    }, true);
}
// Admin reviews moderation
export async function apiAdminGetReviews(token) {
    const r = await fetch("/api/admin/reviews", {
        headers: { ...adminAuthHeaders(token) }
    });
    return r.json();
}
export async function apiAdminApproveReview(token, id) {
    const r = await fetch(`/api/admin/reviews/${encodeURIComponent(id)}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json", ...adminAuthHeaders(token) }
    });
    return r.json();
}
export async function apiAdminRejectReview(token, id) {
    const r = await fetch(`/api/admin/reviews/${encodeURIComponent(id)}/reject`, {
        method: "POST",
        headers: { "content-type": "application/json", ...adminAuthHeaders(token) }
    });
    return r.json();
}
export async function apiAdminReplyReview(token, id, text) {
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
export async function apiGetAtms() {
    return getJsonCached("/api/atms", 5 * 60_000);
}
export async function apiAdminGetAtms(token) {
    const r = await fetch("/api/admin/atms", {
        headers: { ...adminAuthHeaders(token) }
    });
    return r.json();
}
export async function apiAdminSetAtms(token, atms) {
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
export async function apiGetBonuses() {
    return getJsonCached("/api/bonuses", 60_000);
}
export async function apiAdminGetBonuses(token) {
    const r = await fetch("/api/admin/bonuses", {
        headers: { ...adminAuthHeaders(token) }
    });
    return r.json();
}
export async function apiAdminSetBonuses(token, bonuses) {
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
export async function apiGetBankIcons() {
    return getJsonCached("/api/banks/icons", 5 * 60_000);
}
// --------------------
// Staff (miniapp admin)
// --------------------
export async function apiStaffGetRequests(initData) {
    const r = await fetch("/api/staff/requests", {
        headers: { "x-telegram-init-data": initData }
    });
    return r.json();
}
export async function apiStaffSetRequestState(initData, id, state) {
    const r = await fetch(`/api/staff/requests/${encodeURIComponent(id)}/state`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-telegram-init-data": initData },
        body: JSON.stringify({ state })
    });
    return r.json();
}
export async function apiStaffUpdateRequest(initData, id, payload) {
    const r = await fetch(`/api/staff/requests/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-telegram-init-data": initData },
        body: JSON.stringify(payload)
    });
    return readJsonSafe(r);
}
export async function apiStaffUpsertContact(initData, payload) {
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
export async function apiAdminGetAdmins(token) {
    const r = await fetch("/api/admin/admins", {
        headers: { ...adminAuthHeaders(token) }
    });
    return r.json();
}
export async function apiAdminSetAdmins(token, adminTgIds) {
    const r = await fetch("/api/admin/admins", {
        method: "POST",
        headers: { "content-type": "application/json", ...adminAuthHeaders(token) },
        body: JSON.stringify({ adminTgIds })
    });
    return r.json();
}
export async function apiAdminGetBlacklist(token) {
    const r = await fetch("/api/admin/blacklist", {
        headers: { ...adminAuthHeaders(token) }
    });
    return r.json();
}
export async function apiAdminSetBlacklist(token, usernames) {
    const r = await fetch("/api/admin/blacklist", {
        method: "POST",
        headers: { "content-type": "application/json", ...adminAuthHeaders(token) },
        body: JSON.stringify({ usernames })
    });
    return r.json();
}
export async function apiAdminGetPublishTemplate(token) {
    const r = await fetch("/api/admin/publish-template", {
        headers: { ...adminAuthHeaders(token) }
    });
    return r.json();
}
export async function apiAdminSetPublishTemplate(token, template) {
    const r = await fetch("/api/admin/publish-template", {
        method: "POST",
        headers: { "content-type": "application/json", ...adminAuthHeaders(token) },
        body: JSON.stringify({ template })
    });
    return r.json();
}
export async function apiAdminPublish(token, payload) {
    const r = await fetch("/api/admin/publish", {
        method: "POST",
        headers: { "content-type": "application/json", ...adminAuthHeaders(token) },
        body: JSON.stringify(payload)
    });
    return readJsonSafe(r);
}
export async function apiAdminGetContacts(token) {
    const r = await fetch("/api/admin/contacts", {
        headers: { ...adminAuthHeaders(token) }
    });
    return r.json();
}
export async function apiAdminUpsertContact(token, payload) {
    const r = await fetch("/api/admin/contacts/upsert", {
        method: "POST",
        headers: { "content-type": "application/json", ...adminAuthHeaders(token) },
        body: JSON.stringify(payload)
    });
    return r.json();
}
export async function apiAdminGetReports(token, params) {
    const q = new URLSearchParams();
    q.set("from", params.from);
    q.set("to", params.to);
    if (params.onlyDone != null)
        q.set("onlyDone", String(params.onlyDone ? 1 : 0));
    if (params.tgId)
        q.set("tgId", String(params.tgId));
    const r = await fetch(`/api/admin/reports?${q.toString()}`, {
        headers: { ...adminAuthHeaders(token) }
    });
    return readJsonSafe(r);
}
export async function apiAdminGetRatesRange(token, params) {
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
export async function apiGetAfisha(params = {}) {
    const q = new URLSearchParams();
    if (params.category)
        q.set('category', params.category);
    if (params.from)
        q.set('from', params.from);
    if (params.to)
        q.set('to', params.to);
    return getJsonCached(`/api/afisha?${q.toString()}`, 60_000, undefined, true);
}
export async function apiAfishaClick(initData, id, kind) {
    const r = await fetch('/api/afisha/click', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-telegram-init-data': initData },
        body: JSON.stringify({ id, kind })
    });
    return readJsonSafe(r);
}
export async function apiAdminGetAfisha(token, params = {}) {
    const q = new URLSearchParams();
    if (params.scope)
        q.set('scope', params.scope);
    if (params.from)
        q.set('from', params.from);
    if (params.to)
        q.set('to', params.to);
    const r = await fetch(`/api/admin/afisha?${q.toString()}`, {
        headers: { ...adminAuthHeaders(token) }
    });
    return readJsonSafe(r);
}
export async function apiAdminCreateAfisha(token, payload) {
    const r = await fetch('/api/admin/afisha', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...adminAuthHeaders(token) },
        body: JSON.stringify(payload)
    });
    return readJsonSafe(r);
}
export async function apiAdminUpdateAfisha(token, id, payload) {
    const r = await fetch(`/api/admin/afisha/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...adminAuthHeaders(token) },
        body: JSON.stringify(payload)
    });
    return readJsonSafe(r);
}
export async function apiAdminEventsSummary(token, params = {}) {
    const qs = new URLSearchParams();
    if (params.from)
        qs.set("from", params.from);
    if (params.to)
        qs.set("to", params.to);
    const url = `/api/admin/events/summary${qs.toString() ? `?${qs.toString()}` : ""}`;
    const r = await fetch(url, { cache: "no-store", headers: { ...adminAuthHeaders(token), "cache-control": "no-cache" } });
    return readJsonSafe(r);
}
export async function apiEvent(initData, payload) {
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
export async function apiSuggestAtm(initData, text) {
    const r = await fetch("/api/atms/suggest", {
        method: "POST",
        headers: { "content-type": "application/json", "x-telegram-init-data": initData },
        body: JSON.stringify({ text })
    });
    return readJsonSafe(r);
}
export function bankIconUrl(filename) {
    return `/banks/${encodeURIComponent(String(filename || ""))}`;
}
