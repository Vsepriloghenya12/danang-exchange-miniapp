import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import express from 'express';
import { invitationResult, ratesResult, publicAppOrigin, isTestBot } from '../server/src/telegramExperience.ts';
import { launchSection } from '../webapp/src/lib/launchSection.ts';

test('Telegram invitation, inline rates and authenticated media sharing', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'cashalot-telegram-'));
  process.env.STORE_PATH = join(dir, 'store.json');
  process.env.WEBAPP_URL = 'https://cashalot-test-staging.up.railway.app';
  delete process.env.DATABASE_URL;
  const { mutateStore, readStore } = await import('../server/src/store.ts');
  const { createBot } = await import('../server/src/bot.ts');
  const { createApiRouter } = await import('../server/src/routes.ts');
  const { configureTestTelegram } = await import('../server/src/telegramBrand.ts');
  const token = '123:test-token';
  const app = express(); app.use(express.json()); app.use('/api', createApiRouter({ botToken: token }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await rm(dir, { recursive: true, force: true }); });
  const actualFetch = globalThis.fetch;
  const calls: Array<{ method: string; body: any }> = [];
  let failPrepare = false;
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.ok(String(url).startsWith('https://api.telegram.org/bot123:test-token/'));
    assert.ok(options?.signal);
    const method = String(url).split('/').at(-1)!;
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
    calls.push({ method, body });
    if (method === 'getMe') return Response.json({ ok: true, result: { username: 'testcashalot_bot' } });
    if (method === 'savePreparedInlineMessage') {
      if (failPrepare) return Response.json({ ok: false, description: 'Secret Telegram error detail' }, { status: 400 });
      return Response.json({ ok: true, result: { id: `prepared-${body.user_id}`, expiration_date: Math.floor(Date.now() / 1000) + 600 } });
    }
    return Response.json({ ok: true, result: true });
  });
  const auth = (id: number, username = 'client') => {
    const values = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: 'Test', username }) });
    const check = [...values.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
    const secret = createHmac('sha256', 'WebAppData').update(token).digest();
    values.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
    return values.toString();
  };
  const post = async (initData = '', body = {}) => {
    const r = await actualFetch(`http://127.0.0.1:${(server.address() as any).port}/api/referrals/share`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-init-data': initData }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() as any, cache: r.headers.get('cache-control') };
  };

  await t.test('sharing binds the card to the authenticated user and caches only per user', async () => {
    assert.equal((await post()).status, 401);
    const a = await post(auth(101), { tgId: 999, username: 'other_bot', url: 'https://evil.invalid' });
    const b = await post(auth(202));
    assert.equal(a.status, 200); assert.equal(b.status, 200);
    assert.equal(a.body.id, 'prepared-101'); assert.equal(b.body.id, 'prepared-202'); assert.equal(a.cache, 'no-store');
    const prepared = calls.filter(c => c.method === 'savePreparedInlineMessage');
    assert.equal(prepared.length, 2);
    assert.equal(prepared[0].body.user_id, 101);
    assert.equal(prepared[0].body.result.reply_markup.inline_keyboard[0][0].url, 'https://t.me/testcashalot_bot?start=ref_101');
    assert.match(prepared[0].body.result.photo_url, /^https:\/\/cashalot-test-staging\.up\.railway\.app\/brand\/telegram\/invite\.jpg$/);
    await post(auth(101));
    assert.equal(calls.filter(c => c.method === 'savePreparedInlineMessage').length, 2);
    const concurrent = await Promise.all([post(auth(303)), post(auth(303))]);
    assert.ok(concurrent.every(r => r.status === 200));
    assert.equal(calls.filter(c => c.method === 'savePreparedInlineMessage' && c.body.user_id === 303).length, 1);
  });

  await t.test('blocked users and upstream failures do not leak tokens or send a message', async () => {
    await mutateStore(s => { s.config.blacklistUsernames = ['blocked']; });
    assert.equal((await post(auth(404, 'blocked'))).status, 403);
    failPrepare = true;
    const r = await post(auth(505));
    assert.equal(r.status, 503); assert.deepEqual(r.body, { ok: false, error: 'telegram_share_unavailable' });
    assert.equal(calls.some(c => c.method === 'sendMessage' || c.method === 'sendPhoto'), false);
    failPrepare = false;
  });

  await t.test('rates use only today in Da Nang and never expose private store fields', async () => {
    const store = await readStore();
    store.ratesByDate = {
      '2026-10-04': { updated_at: '2026-10-04T10:00:00Z', updated_by: 999, rates: { RUB: { buy_vnd: 305, sell_vnd: 325 }, KZT: { buy_vnd: 49.27, sell_vnd: 52.96 } } as any },
      '2026-10-03': { updated_at: '2026-10-03T10:00:00Z', updated_by: 999, rates: { USD: { buy_vnd: 9999, sell_vnd: 9999 } } as any },
    };
    const result = ratesResult(store, 'testcashalot_bot', process.env.WEBAPP_URL!, new Date('2026-10-03T18:00:00Z'));
    const text = (result.input_message_content as any).message_text;
    assert.match(text, /RUB: 305 \/ 325 VND/); assert.match(text, /KZT: 49,3 \/ 53,0 VND/);
    assert.doesNotMatch(text, /9999|updated_by|client/);
    const tomorrow = ratesResult(store, 'testcashalot_bot', process.env.WEBAPP_URL!, new Date('2026-10-04T18:00:00Z'));
    assert.match((tomorrow.input_message_content as any).message_text, /ещё не опубликованы/);
    const rub = ratesResult(store, 'testcashalot_bot', process.env.WEBAPP_URL!, new Date('2026-10-04T10:00:00Z'), 'руб');
    assert.doesNotMatch((rub.input_message_content as any).message_text, /KZT/);
  });

  await t.test('inline handler returns personal uncached cards and attribution survives /start', async () => {
    const bot = createBot({ token, webappUrl: process.env.WEBAPP_URL });
    bot.botInfo = { id: 123, is_bot: true, first_name: 'Test', username: 'testcashalot_bot', can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: true };
    const sent: Array<{ method: string; body: any }> = [];
    t.mock.method(Object.getPrototypeOf(bot.telegram), 'callApi', async (method: string, body: any) => { sent.push({ method, body }); return true; });
    await bot.handleUpdate({ update_id: 1, inline_query: { id: 'q-1', from: { id: 606, is_bot: false, first_name: 'Inviter' }, query: '', offset: '' } });
    const inline = sent.find(c => c.method === 'answerInlineQuery')!;
    assert.equal(inline.body.is_personal, true); assert.equal(inline.body.cache_time, 0);
    assert.equal(inline.body.results.length, 2);
    assert.match(inline.body.results[1].reply_markup.inline_keyboard[0][0].url, /ref_606$/);
    await bot.handleUpdate({ update_id: 2, message: { message_id: 2, date: Math.floor(Date.now() / 1000), chat: { id: 707, type: 'private', first_name: 'Friend' }, from: { id: 707, is_bot: false, first_name: 'Friend' }, text: '/start ref_606', entities: [{ type: 'bot_command', offset: 0, length: 6 }] } });
    assert.equal((await readStore()).users['707'].referred_by, 606);
    assert.ok(sent.some(c => c.method === 'sendPhoto' && String(c.body.photo).endsWith('/cover.jpg')));
  });

  await t.test('branding fails closed for production and launch hints only select known sections', async () => {
    const before = calls.length;
    await configureTestTelegram(token, 'CashALot_VN_bot', process.env.WEBAPP_URL!);
    assert.equal(calls.length, before);
    assert.equal(isTestBot('testcashalot_bot'), true);
    assert.equal(publicAppOrigin('http://localhost/'), '');
    assert.equal(publicAppOrigin('https://name:secret@example.com/'), '');
    assert.equal(launchSection('?startapp=rates'), 'rates');
    assert.equal(launchSection('', 'bonus'), 'bonus');
    assert.equal(launchSection('?section=admin'), null);
    assert.equal(launchSection('?startapp=rates', 'ref_606'), null);
    assert.throws(() => invitationResult('bad/name', 1, process.env.WEBAPP_URL!));
  });
});
