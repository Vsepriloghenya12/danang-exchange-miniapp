import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHmac } from "node:crypto";
import express from "express";

test("owner activity: authenticated events, unique people and request outcomes", async t => {
  const dir = await mkdtemp(join(tmpdir(), "cashalot-activity-"));
  process.env.STORE_PATH = join(dir, "store.json");
  delete process.env.DATABASE_URL;
  process.env.ADMIN_WEB_KEY = "activity-test-key";
  const token = "123:activity-test-token";
  const { createApiRouter } = await import("../server/src/routes.ts");
  const { mutateStore, readStore, upsertUserFromTelegram } = await import("../server/src/store.ts");
  const { activityDateRange, summarizeActivity, recordActivity } = await import("../server/src/activity.ts");
  const app = express(); app.use(express.json()); app.use("/api", createApiRouter({ botToken: token, ownerTgIds: [900] }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await rm(dir, { recursive: true, force: true }); });
  const localFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async () => Response.json({ ok: true }));
  const init = (id: number) => {
    const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: `Client ${id}` }) });
    const data = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
    p.set("hash", createHmac("sha256", createHmac("sha256", "WebAppData").update(token).digest()).update(data).digest("hex"));
    return p.toString();
  };
  const api = async (path: string, body?: any, user?: number) => {
    const r = await localFetch(`http://127.0.0.1:${(server.address() as any).port}/api${path}`, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...(user === undefined ? { "x-admin-key": "activity-test-key" } : { "x-telegram-init-data": init(user) }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, data: await r.json() as any };
  };
  await t.test("untrusted events cannot impersonate people, starts or successful exchanges", async () => {
    const payload = { name: "calculator_amount", eventId: "event-000001", sessionId: "visit-000001", tg_id: 999, props: { amount: 10_000, currency: "RUB", field: "sell", comment: "private", initData: "private" } };
    const results = await Promise.all(Array.from({ length: 4 }, () => api("/events", payload, 101)));
    results.forEach(r => assert.equal(r.status, 200));
    const saved = (await readStore()).activityEvents;
    assert.equal(saved.length, 1);
    assert.equal(saved[0].tg_id, 101);
    assert.deepEqual(saved[0].props, { amount: 10_000, currency: "RUB", field: "sell" });
    for (const name of ["bot_start", "request_created", "exchange_completed", "unknown"]) assert.equal((await api("/events", { name }, 101)).status, 400);
    for (const amount of [-1, 0, "100", null, 1e20]) assert.equal((await api("/events", { ...payload, props: { amount, currency: "RUB" } }, 101)).status, 400);
    assert.equal((await api("/admin/activity", undefined, 101)).status, 403);
    const noAuth = await localFetch(`http://127.0.0.1:${(server.address() as any).port}/api/events`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    assert.equal(noAuth.status, 401);
  });
  await t.test("dates use Danang midnight and reject reversed, nonexistent and oversized periods", async () => {
    const range = activityDateRange("2026-09-30", "2026-09-30");
    assert.equal(range.start, "2026-09-29T17:00:00.000Z");
    assert.equal(range.end, "2026-09-30T17:00:00.000Z");
    for (const [from, to] of [["2026-10-01", "2026-09-30"], ["2026-02-30", "2026-03-01"], ["2026-01-01", "2026-09-30"], ["invalid", "2026-09-30"]]) assert.equal((await api(`/admin/activity?from=${from}&to=${to}`)).status, 400);
  });
  await t.test("unique stages, unfinished visits and authoritative requests are separate", async () => {
    const range = activityDateRange("2026-09-30", "2026-09-30");
    await mutateStore(s => {
      s.activityEvents = [];
      s.config.adminTgIds = [800];
      const event = (id: number, name: string, sessionId = `visit-${id}`, ts = "2026-09-30T05:00:00.000Z") => s.activityEvents.push({ id: `fixture-${s.activityEvents.length}`, tg_id: id, name, ts, sessionId, props: name === "calculator_amount" ? { amount: 1000, currency: "USD" } : {} });
      for (const id of [101, 102, 103, 104, 800, 900]) { event(id, "bot_start"); event(id, "app_open"); event(id, "calculator_amount"); }
      event(101, "bot_start"); event(101, "rates_view"); event(101, "rates_view"); event(101, "calculator_amount");
      event(102, "request_submit_click"); event(103, "request_submit_click");
      event(105, "bot_start", "visit-105", "2026-09-29T16:59:59.999Z");
      event(106, "bot_start", "visit-106", range.end);
      const request = (tgId: number, id: string, state: "done" | "canceled", sessionId: string) => s.requests.push({ id, state, from: { id: tgId }, status: "standard", sellCurrency: "USD", buyCurrency: "VND", sellAmount: 1000, buyAmount: 25_000_000, receiveMethod: "cash", created_at: "2026-09-30T05:01:00.000Z", funds_received_at: state === "done" ? "2026-09-30T05:30:00.000Z" : undefined, activity_session_id: sessionId });
      request(103, "completed", "done", "visit-103");
      request(104, "old-canceled", "canceled", "different-visit");
    });
    const response = await api("/admin/activity?from=2026-09-30&to=2026-09-30");
    assert.equal(response.status, 200);
    const { totals, rows } = response.data;
    assert.deepEqual(totals, { active: 4, botStarts: 4, appOpens: 4, ratesViews: 1, amountEntries: 4, submitClicks: 2, requests: 2, completed: 1, botWithoutRequest: 2, botWithoutExchange: 3, amountWithoutSubmit: 2, clickedWithoutRequest: 1 });
    assert.equal(rows.find((r: any) => r.tgId === 101).botStarts, 2);
    assert.equal(rows.find((r: any) => r.tgId === 101).ratesViews, 2);
    assert.equal(rows.find((r: any) => r.tgId === 102).clickedWithoutRequest, true);
    assert.equal(rows.find((r: any) => r.tgId === 103).amountWithoutSubmit, false);
    assert.equal(rows.find((r: any) => r.tgId === 104).amountWithoutSubmit, true, "a request in another visit must not hide this unfinished visit");
    const history = rows.find((r: any) => r.tgId === 103).timeline;
    assert.equal(history[0].name, "exchange_completed");
    assert.equal(history[1].name, "request_created");
    // An event delivered late must still correlate to a request in the same visit.
    const s = await readStore();
    s.activityEvents.push({ id: "delayed", tg_id: 103, name: "calculator_amount", ts: "2026-09-30T06:00:00.000Z", sessionId: "visit-103" });
    assert.equal(summarizeActivity(s, s.activityEvents, range, [800, 900]).rows.find(r => r.tgId === 103)?.amountWithoutSubmit, false);
  });
  await t.test("request creation preserves the visit ID for conversion tracking", async () => {
    const response = await api("/requests", { sellCurrency: "USD", buyCurrency: "VND", sellAmount: 1000, buyAmount: 25_000_000, payMethod: "cash", receiveMethod: "cash", sessionId: "new-visit-105" }, 105);
    assert.equal(response.status, 200);
    assert.equal((await readStore()).requests.find(r => r.id === response.data.id)?.activity_session_id, "new-visit-105");
  });
  await t.test("bot starts are persisted once per update even before opening the miniapp", async () => {
    const { createBot } = await import("../server/src/bot.ts");
    const { Telegram } = await import("telegraf");
    t.mock.method(Telegram.prototype, "callApi", async () => ({ message_id: 1 }));
    const bot = createBot({ token, webappUrl: "https://example.com", ownerTgIds: [900] });
    bot.botInfo = { id: 123, is_bot: true, first_name: "Test", username: "test_bot" } as any;
    const update: any = { update_id: 333, message: { message_id: 1, date: Math.floor(Date.now() / 1000), chat: { id: 107, type: "private", first_name: "Friend" }, from: { id: 107, is_bot: false, first_name: "Friend" }, text: "/start", entities: [{ offset: 0, length: 6, type: "bot_command" }] } };
    await bot.handleUpdate(update); await bot.handleUpdate(update);
    const events = (await readStore()).activityEvents.filter(e => e.tg_id === 107);
    assert.equal(events.length, 1); assert.equal(events[0].name, "bot_start");
    await recordActivity({ id: "future-concurrent", tg_id: 107, name: "bot_start", ts: new Date().toISOString() });
    assert.equal((await readStore()).activityEvents.filter(e => e.tg_id === 107).length, 2);
  });
});
