import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHmac } from "node:crypto";
import express from "express";

test("referrals: signed attribution, completed exchanges and an atomic CashCoin ledger", async t => {
  const dir = await mkdtemp(join(tmpdir(), "cashalot-referrals-"));
  process.env.STORE_PATH = join(dir, "store.json");
  delete process.env.DATABASE_URL;
  process.env.ADMIN_WEB_KEY = "referral-test-key";
  process.env.BOT_USERNAME = "referral_test_bot";
  const botToken = "123:test-token";
  const { createApiRouter } = await import("../server/src/routes.ts");
  const { mutateStore, readStore, upsertUserFromTelegram } = await import("../server/src/store.ts");
  const { captureCoinQuote } = await import("../server/src/referrals.ts");
  const app = express(); app.use(express.json()); app.use("/api", createApiRouter({ botToken, ownerTgIds: [900] }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await rm(dir, { recursive: true, force: true }); });
  const localFetch = globalThis.fetch;
  const notifications: any[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.ok(String(url).startsWith("https://api.telegram.org/"));
    assert.ok(init.signal, "Telegram call should have a timeout");
    if (init.body) notifications.push(JSON.parse(String(init.body)));
    return Response.json({ ok: true, result: { username: "referral_test_bot" } });
  });
  function signed(id: number, start?: string) {
    const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: `User ${id}`, username: `user${id}` }), ...(start ? { start_param: start } : {}) });
    const data = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
    const key = createHmac("sha256", "WebAppData").update(botToken).digest();
    params.set("hash", createHmac("sha256", key).update(data).digest("hex"));
    return params.toString();
  }
  const api = async (path: string, body?: any, user?: number | string) => {
    if (path === "/requests" && body && body.bonusQuoteKey === undefined) {
      const quote = await api("/referrals/quote", body, user);
      if (quote.status !== 200) return quote;
      body = { ...body, bonusQuoteKey: quote.data.bonus.key };
    }
    const response = await localFetch(`http://127.0.0.1:${(server.address() as any).port}/api${path}`, {
      method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...(user === undefined ? { "x-admin-key": "referral-test-key" } : { "x-telegram-init-data": typeof user === "number" ? signed(user) : user }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() as any };
  };
  const order = { sellCurrency: "USD", buyCurrency: "VND", sellAmount: 1000, buyAmount: 24_000_000, payMethod: "cash", receiveMethod: "cash" };
  await api("/auth", {}, 1);
  await api("/auth", {}, 3);

  await t.test("signed start_param keeps attribution immutable and rejects referral cycles", async () => {
    assert.equal((await api("/auth", {}, signed(2, "ref_1"))).status, 200);
    await api("/auth", {}, signed(2, "ref_3"));
    await api("/auth", {}, signed(1, "ref_2"));
    await api("/auth", {}, signed(4, "ref_4"));
    await api("/auth", {}, signed(5, "ref_999999"));
    await api("/auth", { start_param: "ref_1" }, 6);
    const forged = signed(7, "ref_1").replace("ref_1", "ref_3");
    assert.equal((await api("/auth", {}, forged)).status, 401);
    const s = await readStore();
    assert.equal(s.users["2"].referred_by, 1);
    for (const id of [1, 3, 4, 5, 6]) assert.equal(s.users[String(id)].referred_by, undefined);
    assert.equal(s.users["7"], undefined);
    const mine = await api("/referrals?tgId=2", undefined, 1);
    assert.equal(mine.data.link, "https://t.me/referral_test_bot?start=ref_1");
    assert.equal(mine.data.invitedCount, 1);
    assert.equal(mine.data.balanceCents, 0);
    assert.equal((await api("/admin/referrals", undefined, 2)).status, 403);
    assert.equal((await api("/admin/referrals/payout", {}, 2)).status, 403);
  });

  await t.test("daily limit and contact cards without exchanges", async () => {
    await mutateStore(s => { s.contacts.push({ id: "known", tg_id: 50, created_at: "2020-01-01", updated_at: "2020-01-01" }); });
    await upsertUserFromTelegram({ id: 50 }, "ref_1");
    assert.equal((await readStore()).users["50"].referred_by, 1);
    await Promise.all(Array.from({ length: 21 }, (_, i) => upsertUserFromTelegram({ id: i + 1000 }, "ref_3")));
    const users = Object.values((await readStore()).users);
    assert.equal(users.filter(u => u.referred_by === 3).length, 20);
    assert.equal(users.filter(u => u.referral_rejected === "daily_limit").length, 1);
  });

  await t.test("no rate means no invented bonus; rejected writes do not break subsequent requests", async () => {
    assert.equal((await api("/requests", order, 2)).data.error, "referral_rates_missing");
    assert.equal((await api("/requests", order, 6)).status, 200);
    assert.equal((await readStore()).requests.filter(r => r.from.id === 2).length, 0);
  });
  const date = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  await mutateStore(s => {
    s.config.adminTgIds = [800];
    s.ratesByDate[date] = { updated_at: new Date().toISOString(), updated_by: 900, rates: { USD: { buy_vnd: 24_000, sell_vnd: 25_000 }, RUB: { buy_vnd: 250, sell_vnd: 260 }, USDT: { buy_vnd: 25_000, sell_vnd: 25_100 }, EUR: { buy_vnd: 27_500, sell_vnd: 28_000 }, THB: { buy_vnd: 750, sell_vnd: 760 }, KZT: { buy_vnd: 50, sell_vnd: 51 } } };
  });
  let firstId: string;
  await t.test("cancellation is free of credits; completion requires confirmation; immutable quote", async () => {
    const cancel = await api("/requests", order, 2);
    assert.equal((await api(`/admin/requests/${cancel.data.id}/state`, { state: "canceled" })).status, 200);
    assert.equal((await readStore()).bonusLedger.length, 0);
    const created = await api("/requests", order, 2); firstId = created.data.id;
    assert.equal(created.status, 200);
    assert.ok(notifications.some(n => n.text?.includes("Отдаёт: 1,000 + 5 б = 1,005") && n.text?.includes("Получит: 24,000,000 + 120,000 б = 24,120,000")));
    assert.equal((await api(`/admin/requests/${firstId}/state`, { state: "done" })).data.error, "funds_received_required");
    await mutateStore(s => { s.ratesByDate[date].rates.USD.sell_vnd = 50_000; });
    assert.equal((await readStore()).bonusLedger.length, 0);
    const results = await Promise.all(Array.from({ length: 6 }, () => api(`/admin/requests/${firstId}/state`, { state: "done", fundsReceived: true })));
    for (const r of results) assert.equal(r.status, 200);
    const s = await readStore();
    assert.equal(s.bonusLedger.length, 1);
    assert.equal(s.bonusLedger.find(e => e.kind === "welcome"), undefined);
    assert.equal(s.requests.find(r => r.id === firstId)?.cashcoin?.welcomeSell, 5);
    assert.equal(s.bonusLedger.find(e => e.kind === "referrer")?.cents, 46385);
    assert.equal((await api(`/admin/requests/${firstId}/state`, { state: "canceled" })).data.error, "referral_completed_locked");
    assert.equal((await api(`/staff/requests/${firstId}`, { ...order, sellAmount: 2 }, 800)).data.error, "request_not_editable");
    const second = await api("/requests", order, 2);
    assert.equal((await api(`/staff/requests/${second.data.id}/state`, { state: "done", fundsReceived: true }, 800)).status, 200);
    assert.equal((await readStore()).bonusLedger.length, 1);
    const report = (await api("/admin/referrals")).data;
    const row = report.referrals.find((r: any) => r.friend.tgId === 2);
    assert.deepEqual(row.volume, { USD: 2000 });
    assert.equal(row.completedCount, 2);
    assert.equal(row.inviterCents, 46385);
    assert.equal((await api("/admin/users")).data.users.find((u: any) => u.tg_id === 1).referral.balanceCents, 46385);
  });

  await t.test("a first gift is reserved for one order, and staff completion credits once", async () => {
    await api("/auth", {}, signed(8, "ref_1"));
    const a = await api("/requests", { ...order, sellCurrency: "RUB", sellAmount: 100_000, payMethod: "transfer" }, 8);
    assert.equal(a.status, 200);
    const b = await api("/requests", order, 8);
    assert.equal(b.data.error, "referral_first_pending");
    assert.equal(b.data.requestId, a.data.id);
    assert.equal((await api("/referrals/quote", order, 6)).data.requestId, undefined, "Do not expose another client’s reserved request");
    const results = await Promise.all([api(`/staff/requests/${a.data.id}/state`, { state: "done", fundsReceived: true }, 800), api(`/admin/requests/${a.data.id}/state`, { state: "done", fundsReceived: true })]);
    results.forEach(r => assert.equal(r.status, 200, JSON.stringify(r.data)));
    const s = await readStore();
    assert.equal(s.bonusLedger.filter(e => e.id === "welcome:8").length, 0);
    assert.equal(s.bonusLedger.filter(e => e.id === "referrer:8").length, 1);
    const quote = captureCoinQuote(s, new Date().toISOString());
    assert.equal(quote.rates["RUB>VND"], 250);
    assert.equal(quote.rates["VND>RUB"], 1 / 260);
    assert.equal(quote.rates["USDT>RUB"], 25_000 / 260);
  });

  await t.test("payouts are authorized, bounded by available coins and idempotent", async () => {
    assert.equal((await api("/admin/referrals/payout", { id: "legacy-payout-001", tgId: 1, cents: 1, note: "old USD client" })).data.error, "referral_currency_changed");
    const before = (await api("/referrals", undefined, 1)).data.balanceCents;
    const payout = { currency: "CashCoin", id: "test-payout-000001", tgId: 1, cents: 150, note: "Выдано 375 VND" };
    const results = await Promise.all(Array.from({ length: 5 }, () => api("/admin/referrals/payout", payout)));
    results.forEach(r => assert.equal(r.status, 200));
    assert.equal((await api("/referrals", undefined, 1)).data.balanceCents, before - 150);
    assert.equal((await api("/admin/referrals/payout", { ...payout, cents: 100 })).data.error, "referral_payout_conflict");
    assert.equal((await api("/admin/referrals/payout", { ...payout, id: "test-payout-000002", cents: before })).data.error, "referral_insufficient_balance");
    assert.equal((await api("/admin/referrals/payout", { ...payout, id: "test-payout-000003", cents: -1 })).data.error, "referral_bad_payout");
    assert.equal((await api("/admin/referrals/payout", { ...payout, id: "test-payout-000004", cents: 1.5 })).status, 400);
    const mine = (await api("/referrals", undefined, 1)).data;
    assert.equal(mine.paidCents, 150);
    assert.ok(mine.history.every((e: any) => e.peer_id === undefined && e.note === undefined));
  });

  await t.test("parallel requests cannot spend the same coins; cancellation releases the reservation", async () => {
    const available = (await api("/referrals", undefined, 1)).data.availableCents;
    const quote = (await api("/referrals/quote", { ...order, redeemMinor: available }, 1)).data.bonus;
    const payload = { ...order, redeemMinor: available, bonusQuoteKey: quote.key };
    const results = await Promise.all([api("/requests", payload, 1), api("/requests", payload, 1)]);
    assert.equal(results.filter(r => r.status === 200).length, 1);
    const id = results.find(r => r.status === 200)!.data.id;
    assert.equal((await api("/referrals", undefined, 1)).data.availableCents, 0);
    assert.equal((await api("/admin/referrals/payout", { currency: "CashCoin", id: "test-payout-reserved", tgId: 1, cents: 1, note: "reserved" })).data.error, "referral_insufficient_balance");
    await api(`/admin/requests/${id}/state`, { state: "canceled" });
    assert.equal((await api("/referrals", undefined, 1)).data.availableCents, available);
    const replacement = await api("/requests", payload, 1);
    assert.equal(replacement.status, 200);
    assert.equal((await api(`/admin/requests/${id}/state`, { state: "in_progress" })).data.error, "referral_insufficient_balance");
    const done = () => api(`/admin/requests/${replacement.data.id}/state`, { state: "done", fundsReceived: true });
    await Promise.all([done(), done()]);
    assert.equal((await api("/referrals", undefined, 1)).data.balanceCents, 0);
    assert.equal((await readStore()).bonusLedger.filter(e => e.id === `redemption:${replacement.data.id}`).length, 1);
  });

  await t.test("only the owner in the dedicated staging service can create an idempotent test credit", async () => {
    const credit = { id: "cashcoin-test-credit-01", tgId: 3, cents: 100000, note: "Test coins" };
    assert.equal((await api("/admin/referrals/test-credit", credit)).status, 403);
    process.env.RAILWAY_ENVIRONMENT_ID = "0f1345a1-eaec-4a5b-ac62-1b256c0de3b1";
    process.env.RAILWAY_SERVICE_ID = "1c1b2d05-972a-458a-b30c-606e2264e467";
    assert.equal((await api("/admin/referrals/test-credit", credit, 3)).status, 403);
    const results = await Promise.all([api("/admin/referrals/test-credit", credit), api("/admin/referrals/test-credit", credit)]);
    results.forEach(r => assert.equal(r.status, 200));
    assert.equal((await api("/referrals", undefined, 3)).data.balanceCents, 100000);
    delete process.env.RAILWAY_ENVIRONMENT_ID; delete process.env.RAILWAY_SERVICE_ID;
  });

  await t.test("existing accounts qualify before their first exchange, including after cancellation", async () => {
    await api("/auth", {}, 51);
    const canceled = await api("/requests", order, 51);
    await api(`/admin/requests/${canceled.data.id}/state`, { state: "canceled" });
    await api("/auth", {}, signed(51, "ref_1"));
    await api("/auth", {}, signed(51, "ref_3"));
    assert.equal((await readStore()).users["51"].referred_by, 1);
    const gifted = await api("/requests", order, 51);
    assert.equal(gifted.status, 200);
    assert.equal(gifted.data.cashcoin.welcomeSell, 5);
    assert.equal(gifted.data.cashcoin.welcomeBuy, 120000);
    assert.equal(gifted.data.cashcoin.totalBuy, 24120000);
    await api(`/admin/requests/${gifted.data.id}/state`, { state: "done", fundsReceived: true });
    assert.equal((await readStore()).bonusLedger.filter(e => e.id === "referrer:51").length, 1);
    const cardOnly = await api("/requests", order, 50);
    assert.equal(cardOnly.data.cashcoin.welcomeSell, 5);

    await api("/auth", {}, 52);
    const completed = await api("/requests", order, 52);
    await api(`/admin/requests/${completed.data.id}/state`, { state: "done", fundsReceived: true });
    await api("/auth", {}, signed(52, "ref_1"));
    assert.equal((await readStore()).users["52"].referred_by, undefined);
    await upsertUserFromTelegram({ id: 53 });
    await mutateStore(s => { s.requests.push({ ...s.requests.find(r => r.id === completed.data.id)!, id: "funds-already-received", from: { id: 53 }, state: "in_progress" }); });
    await upsertUserFromTelegram({ id: 53 }, "ref_1");
    assert.equal((await readStore()).users["53"].referred_by, undefined);
  });

  await t.test("bot /start preserves attribution when the miniapp opens later", async () => {
    const { createBot } = await import("../server/src/bot.ts");
    const { Telegram } = await import("telegraf");
    t.mock.method(Telegram.prototype, "callApi", async () => ({ message_id: 1 }));
    const bot = createBot({ token: botToken, webappUrl: "https://example.com", ownerTgIds: [900] });
    bot.botInfo = { id: 123, is_bot: true, first_name: "Test", username: "referral_test_bot", can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: true } as any;
    await upsertUserFromTelegram({ id: 9, first_name: "Friend" });
    await bot.handleUpdate({ update_id: 1, message: { message_id: 1, date: Math.floor(Date.now() / 1000), chat: { id: 9, type: "private", first_name: "Friend" }, from: { id: 9, is_bot: false, first_name: "Friend" }, text: "/start ref_1", entities: [{ offset: 0, length: 6, type: "bot_command" }] } });
    assert.equal((await readStore()).users["9"].referred_by, 1);
    await api("/auth", {}, 9);
    assert.equal((await readStore()).users["9"].referred_by, 1);
  });
});
