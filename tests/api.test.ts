import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { EXCHANGE_RATE_PAIRS } from "../webapp/src/domain/exchange.ts";
import { MARKUP_DIRECTIONS, defaultBonuses } from "../webapp/src/domain/pricing.ts";

test("API persists all pairs and publishes with bounded Telegram requests", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "danang-regression-"));
  process.env.STORE_PATH = join(dir, "store.json");
  delete process.env.DATABASE_URL;
  process.env.ADMIN_WEB_KEY = "test-only-key";
  process.env.GROUP_CHAT_ID = "@test_rates_channel";
  process.env.TMA_LINK = "https://t.me/test_rates_bot?startapp=rates";
  const { createApiRouter } = await import("../server/src/routes.ts");
  const app = express();
  app.use(express.json());
  app.use("/api", createApiRouter({ botToken: "test-token" }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
    await rm(dir, { recursive: true, force: true });
  });
  const address = server.address() as { port: number };
  const localFetch = globalThis.fetch;
  const calls: Array<{ method: string; body: any }> = [];
  let mode: "ok" | "denied" | "timeout" | "photo-rejected" = "ok";
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.ok(String(url).startsWith("https://api.telegram.org/"), "Unexpected external request");
    assert.ok(init?.signal, "Telegram requests must have a timeout");
    const method = String(url).split("/").at(-1)!;
    const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
    calls.push({ method, body });
    if (mode === "timeout") throw new DOMException("Timed out", "TimeoutError");
    if (mode === "denied") return Response.json({ ok: false, description: "Forbidden: bot is not a member of the channel chat" });
    if (mode === "photo-rejected" && method === "sendPhoto") return Response.json({ ok: false, description: "Bad Request: message caption is too long" });
    if (method === "getMe") return Response.json({ ok: true, result: { username: "test_rates_bot" } });
    return Response.json({ ok: true, result: { message_id: 42 } });
  });
  const api = async (path: string, body?: any, auth = true) => {
    const response = await localFetch(`http://127.0.0.1:${address.port}/api${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(auth ? { "x-admin-key": "test-only-key" } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() as any };
  };

  const rates = Object.fromEntries(EXCHANGE_RATE_PAIRS.filter(p => p.mode === "vnd").map(p => [p.base, { buy_vnd: 100.25, sell_vnd: 110.75 }]));
  const cross = Object.fromEntries(EXCHANGE_RATE_PAIRS.filter(p => p.mode === "g").map(p => [`${p.base}/${p.quote}`, { buy: 10.125, sell: 11.375 }]));
  assert.equal((await api("/admin/rates/today", { rates, cross })).status, 200);
  const savedRates = (await api("/rates/today")).data.data;
  assert.deepEqual(savedRates.rates, rates);
  assert.deepEqual(savedRates.cross, cross);

  const bonuses = defaultBonuses();
  bonuses.pairs = Object.fromEntries(MARKUP_DIRECTIONS.map(d => [d.key, { tiers: [{ min: 0, standard: 0.1, silver: 0.2, gold: 0.3 }], methods: { cash: 0.01, transfer: 0.02, atm: 0.03 } }]));
  assert.equal((await api("/admin/bonuses", { bonuses })).status, 200);
  assert.deepEqual((await api("/bonuses")).data.bonuses.pairs, bonuses.pairs);

  assert.equal((await api("/admin/publish-template")).data.chatId, "@test_rates_channel");
  assert.equal((await api("/admin/publish-target", { chatId: "@other_channel" }, false)).status, 401);
  assert.equal((await api("/admin/publish-target", { chatId: "invalid" })).status, 400);
  assert.equal((await api("/admin/publish-target", { chatId: "https://t.me/other_channel" })).status, 200);
  assert.equal((await api("/admin/publish-template")).data.chatId, "@other_channel");

  const payload = { template: "Курс {{date}}\n{{rates}}" };
  const published = await api("/admin/publish", payload);
  assert.equal(published.status, 200);
  assert.equal(published.data.message_id, 42);
  assert.equal(calls.at(-1)?.body.chat_id, "@other_channel");
  assert.ok(!calls.at(-1)?.body.text.includes("{{"));

  mode = "denied";
  const denied = await api("/admin/publish", payload);
  assert.equal(denied.status, 502);
  assert.match(denied.data.message, /администраторы/);

  mode = "timeout";
  const callsBefore = calls.length;
  const timedOut = await api("/admin/publish", payload);
  assert.equal(timedOut.status, 504);
  assert.match(timedOut.data.message, /не ответил вовремя/);
  assert.equal(calls.length, callsBefore + 1, "Never retry an ambiguous send timeout");

  mode = "photo-rejected";
  const fallback = await api("/admin/publish", { ...payload, imageDataUrl: "data:image/png;base64,aGVsbG8=" });
  assert.equal(fallback.data.mode, "message_fallback");
  assert.deepEqual(calls.slice(-2).map(c => c.method), ["sendPhoto", "sendMessage"]);

  mode = "ok";
  delete process.env.TMA_LINK;
  delete process.env.BOT_USERNAME;
  assert.equal((await api("/admin/publish", payload)).status, 200);
  assert.deepEqual(calls.slice(-2).map(c => c.method), ["getMe", "sendMessage"]);
});
