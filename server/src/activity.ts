import { randomUUID } from "node:crypto";
import { HAS_DATABASE, ensureSchema, getPool } from "./db.js";
import { mutateStore, readStore, type Store } from "./store.js";

export type ActivityEvent = { id: string; tg_id: number; ts: string; name: string; sessionId?: string; props?: Record<string, string | number> };
const CLIENT_EVENTS = new Set(["app_open", "screen_open", "click", "rates_view", "calculator_amount", "request_submit_click"]);
const CURRENCIES = new Set(["RUB", "USD", "USDT", "EUR", "THB", "KZT", "VND"]);
const MAX_EVENTS = 50_000;
export function activitySession(value: unknown): string | undefined {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{8,100}$/.test(value) ? value : undefined;
}

export function clientActivity(tgId: number, body: any): ActivityEvent {
  const name = String(body?.name || body?.event || "");
  if (!CLIENT_EVENTS.has(name)) throw new Error("bad_event");
  const props: Record<string, string | number> = {};
  for (const key of ["screen", "target", "surface", "field"]) {
    if (typeof body?.props?.[key] === "string") props[key] = body.props[key].slice(0, 80);
  }
  for (const key of ["currency", "sellCurrency", "buyCurrency"]) {
    if (CURRENCIES.has(body?.props?.[key])) props[key] = body.props[key];
  }
  if (name === "calculator_amount") {
    const amount = body?.props?.amount;
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || amount > 1e15 || !props.currency) throw new Error("bad_event_amount");
    props.amount = amount;
  }
  const suppliedId = activitySession(body?.eventId);
  return { id: `client:${tgId}:${suppliedId || randomUUID()}`, tg_id: tgId, ts: new Date().toISOString(), name, sessionId: activitySession(body?.sessionId), props };
}

export async function recordActivity(event: ActivityEvent) {
  if (HAS_DATABASE) {
    await ensureSchema();
    await getPool().query(
      `INSERT INTO app_events (event_key, ts, tg_id, session_id, event_name, props) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING`,
      [event.id, event.ts, event.tg_id, event.sessionId || null, event.name, event.props || {}],
    );
  } else {
    await mutateStore(store => {
      if (!store.activityEvents.some(e => e.id === event.id)) store.activityEvents.push(event);
      store.activityEvents = store.activityEvents.slice(-MAX_EVENTS);
    });
  }
}

export function activityDateRange(fromValue: unknown, toValue: unknown, now = new Date()) {
  const localDay = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  const from = String(fromValue || localDay(new Date(now.getTime() - 6 * 86400_000)));
  const to = String(toValue || localDay(now));
  const valid = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
  if (!valid(from) || !valid(to) || from > to || Date.parse(to) - Date.parse(from) > 89 * 86400_000) throw new Error("bad_activity_range");
  const start = new Date(`${from}T00:00:00+07:00`).toISOString();
  const end = new Date(Date.parse(`${to}T00:00:00+07:00`) + 86400_000).toISOString();
  return { from, to, start, end };
}

export function summarizeActivity(store: Store, events: ActivityEvent[], range: ReturnType<typeof activityDateRange>, excludedIds: number[]) {
  const excluded = new Set(excludedIds);
  const inRange = (ts?: string) => !!ts && ts >= range.start && ts < range.end;
  const customers = new Map<number, { events: ActivityEvent[]; requests: Store["requests"] }>();
  const get = (id: number) => {
    if (!customers.has(id)) customers.set(id, { events: [], requests: [] });
    return customers.get(id)!;
  };
  for (const e of events) if (!excluded.has(e.tg_id) && inRange(e.ts)) get(e.tg_id).events.push(e);
  for (const r of store.requests) {
    if (excluded.has(r.from.id)) continue;
    const doneAt = r.state === "done" ? r.funds_received_at || r.state_updated_at : undefined;
    if (inRange(r.created_at) || inRange(doneAt)) get(r.from.id);
  }
  for (const r of store.requests) if (customers.has(r.from.id)) get(r.from.id).requests.push(r);
  const rows = [...customers.entries()].map(([tgId, { events, requests }]) => {
    events.sort((a, b) => a.ts.localeCompare(b.ts));
    const user = store.users[String(tgId)];
    const name = user?.username ? `@${user.username}` : [user?.first_name, user?.last_name].filter(Boolean).join(" ") || String(tgId);
    const count = (name: string) => events.filter(e => e.name === name).length;
    const amounts = events.filter(e => e.name === "calculator_amount");
    const sessions = new Map<string, ActivityEvent>();
    for (const e of amounts) if (e.sessionId) sessions.set(e.sessionId, e);
    // Correlate by visit, not delivery order: keepalive telemetry may arrive after the request.
    const waiting = [...sessions.values()].filter(e => !requests.some(r => r.activity_session_id === e.sessionId));
    const amountWithoutSubmit = waiting.some(e => !events.some(click => click.name === "request_submit_click" && click.sessionId === e.sessionId));
    const clickedWithoutRequest = waiting.some(e => events.some(click => click.name === "request_submit_click" && click.sessionId === e.sessionId));
    const created = requests.filter(r => inRange(r.created_at));
    const done = requests.filter(r => r.state === "done");
    const completed = done.filter(r => inRange(r.funds_received_at || r.state_updated_at));
    const timeline = [...events];
    for (const r of created) timeline.push({ id: `request:${r.id}`, tg_id: tgId, ts: r.created_at, name: "request_created", props: { requestId: r.id, amount: r.sellAmount, currency: r.sellCurrency, state: r.state } });
    for (const r of completed) timeline.push({ id: `done:${r.id}`, tg_id: tgId, ts: (r.funds_received_at || r.state_updated_at)!, name: "exchange_completed", props: { requestId: r.id, amount: r.sellAmount, currency: r.sellCurrency } });
    timeline.sort((a, b) => b.ts.localeCompare(a.ts));
    return { tgId, name, botStarts: count("bot_start"), appOpens: count("app_open"), ratesViews: count("rates_view"), amountEntries: amounts.length,
      submitClicks: count("request_submit_click"), requestCount: created.length, completedCount: completed.length,
      allRequests: requests.length, allCompleted: done.length, amountWithoutSubmit, clickedWithoutRequest,
      botWithoutRequest: count("bot_start") > 0 && requests.length === 0,
      botWithoutExchange: count("bot_start") > 0 && done.length === 0,
      lastAt: timeline[0]?.ts, lastAmount: amounts.at(-1)?.props, timeline: timeline.slice(0, 50), timelineCount: timeline.length,
    };
  }).sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)));
  return { rows, totals: {
    active: rows.length, botStarts: rows.filter(r => r.botStarts).length, appOpens: rows.filter(r => r.appOpens).length,
    ratesViews: rows.filter(r => r.ratesViews).length, amountEntries: rows.filter(r => r.amountEntries).length,
    submitClicks: rows.filter(r => r.submitClicks).length, requests: rows.filter(r => r.requestCount).length,
    completed: rows.filter(r => r.completedCount).length, botWithoutRequest: rows.filter(r => r.botWithoutRequest).length,
    botWithoutExchange: rows.filter(r => r.botWithoutExchange).length, amountWithoutSubmit: rows.filter(r => r.amountWithoutSubmit).length,
    clickedWithoutRequest: rows.filter(r => r.clickedWithoutRequest).length,
  } };
}

export async function loadActivityReport(from: unknown, to: unknown, ownerIds: number[]) {
  const range = activityDateRange(from, to);
  const store = await readStore();
  let events: ActivityEvent[];
  let truncated = false;
  if (HAS_DATABASE) {
    await ensureSchema();
    const result = await getPool().query(
      `SELECT id, ts, tg_id, session_id, event_name, props FROM app_events
       WHERE ts >= $1::timestamptz AND ts < $2::timestamptz ORDER BY ts DESC LIMIT $3`,
      [range.start, range.end, MAX_EVENTS + 1],
    );
    truncated = result.rows.length > MAX_EVENTS;
    events = result.rows.slice(0, MAX_EVENTS).map(r => ({ id: String(r.id), ts: new Date(r.ts).toISOString(), tg_id: Number(r.tg_id), sessionId: r.session_id || undefined, name: r.event_name, props: r.props || {} }));
  } else {
    events = store.activityEvents;
    truncated = events.length >= MAX_EVENTS && range.start < events[0].ts;
  }
  return { ...range, timezone: "Asia/Ho_Chi_Minh", trackingSince: store.config.activityTrackingSince, truncated,
    ...summarizeActivity(store, events, range, [...ownerIds, ...(store.config.adminTgIds || [])]),
  };
}
