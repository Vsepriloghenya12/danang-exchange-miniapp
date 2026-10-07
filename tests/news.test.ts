import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';

test('Danang feed, owner access and automatic delivery', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'cashalot-news-'));
  process.env.STORE_PATH = join(dir, 'store.json'); delete process.env.DATABASE_URL;
  process.env.ADMIN_WEB_KEY = 'news-test-owner';
  const { NEWS_SOURCES, parseNewsFeed, relevantToDanang, duplicateNews, newsState, visibleNews, deliveryCandidate, syncNews, publicNewsPost, newsTelegramText } = await import('../server/src/news.ts');
  const { ingestTelegramNews } = await import('../server/src/newsTelegram.ts');
  const { publicTelegramUsername, parsePublicTelegramPage, fetchPublicTelegramPage, pollPublicTelegramSource } = await import('../server/src/newsPublicTelegram.ts');
  const { readStore, mutateStore } = await import('../server/src/store.ts');
  const { createApiRouter } = await import('../server/src/routes.ts');
  const now = new Date('2026-10-04T05:00:00Z');
  const item = (title = 'В Дананге открылся новый музей', link = 'https://www.atorus.ru/danang-museum', date = now.toUTCString()) => `<item><title><![CDATA[${title}]]></title><description><![CDATA[Музей в Дананге принимает посетителей каждый день. <script>alert(1)</script>]]></description><link>${link}</link><pubDate>${date}</pubDate></item>`;
  const rss = (items: string) => `<rss><channel>${items}</channel></rss>`;
  const post = parseNewsFeed(rss(item()), NEWS_SOURCES[0], now)[0];
  await t.test('only fresh Danang news or national entry rules, and no XML entities or unsafe links', () => {
    assert.equal(post.category, 'places'); assert.equal(post.source, 'АТОР'); assert.doesNotMatch(post.summary, /script|alert/);
    assert.ok((post.title + ' ' + post.summary).trim().split(/\s+/).length <= 24);
    assert.equal(relevantToDanang('Открылось кафе в Нячанге', 'Отпуск во Вьетнаме'), false);
    assert.equal(relevantToDanang('Вьетнам изменил правила въезда', ''), true);
    assert.equal(relevantToDanang('Новые отели Вьетнама', ''), false);
    const unrelated = `<item><title>Осень в России</title><description><![CDATA[<p>Золотая осень в России.</p><ul><li>В Дананге открылся парк</li></ul>]]></description><link>https://www.atorus.ru/autumn</link><pubDate>${now.toUTCString()}</pubDate></item>`;
    assert.equal(parseNewsFeed(rss(unrelated), NEWS_SOURCES[0], now).length, 0);
    assert.equal(parseNewsFeed(rss(item('Дананг', 'javascript:alert(1)')), NEWS_SOURCES[0], now).length, 0);
    assert.equal(parseNewsFeed(rss(item('Дананг', 'https://evil.invalid/danang')), NEWS_SOURCES[0], now).length, 0);
    assert.equal(parseNewsFeed(rss(item('Дананг', 'https://www.atorus.ru/a', 'bad')), NEWS_SOURCES[0], now).length, 0);
    assert.equal(parseNewsFeed(rss(item('Дананг', 'https://www.atorus.ru/a', 'Mon, 01 Jan 2024 00:00:00 GMT')), NEWS_SOURCES[0], now).length, 0);
    assert.equal(parseNewsFeed(rss(item('Дананг', 'https://www.atorus.ru/a', 'Mon, 05 Oct 2026 00:00:00 GMT')), NEWS_SOURCES[0], now).length, 0);
    assert.throws(() => parseNewsFeed('<!DOCTYPE a [<!ENTITY x "boom">]>' + rss(item()), NEWS_SOURCES[0], now));
    assert.throws(() => parseNewsFeed('<html>blocked</html>', NEWS_SOURCES[0], now));
    assert.equal(duplicateNews(post, { ...post, id: 'other', url: 'https://tourdom.ru/other' }), true);
  });
  await t.test('expired and hidden posts stay out of public feed and delivery; quiet hours and caps', () => {
    const s = newsState({ config: {} } as any);
    s.posts = [post]; s.channel = { id: -100123, title: 'Твой Вьетнам', connectedAt: '2026-10-04T04:00:00Z' };
    assert.equal(deliveryCandidate(s, now)?.id, post.id);
    s.posts = [{ ...post, hidden: true }, { ...post, id: 'expired', expiresAt: '2026-10-03T00:00:00Z' }];
    assert.equal(visibleNews(s, now).length, 0); assert.equal(deliveryCandidate(s, now), undefined);
    s.posts = [post]; assert.equal(deliveryCandidate(s, new Date('2026-10-04T15:00:00Z')), undefined);
    s.lastSendAt = '2026-10-04T04:00:00Z'; assert.equal(deliveryCandidate(s, now), undefined); delete s.lastSendAt;
    s.channel.connectedAt = '2026-10-04T06:00:00Z'; assert.equal(deliveryCandidate(s, now), undefined);
    s.channel.connectedAt = '2026-10-04T04:00:00Z';
    s.posts.push(...[1, 2, 3].map(i => ({ ...post, id: `sent-${i}`, delivery: { state: 'sent' as const, at: '2026-10-04T01:00:00Z', chatId: -100123 } })));
    assert.equal(deliveryCandidate(s, now), undefined);
  });
  const actualFetch = globalThis.fetch; let telegramCalls = 0; let feedCalls = 0; let failSend = false;
  const tgPage = (items: string, before = '') => `<div class="tgme_channel_info_header_title"><span>Город у моря</span></div><div class="tgme_channel_info_header_username"><a>@danang_news</a></div><section class="tgme_channel_history">${items}${before ? `<a class="tme_messages_more" data-before="${before}"></a>` : ''}</section>`;
  const tgItem = (id: number, text = 'Новое кафе у моря<br><br>Кофе &amp; завтрак.', date = now.toISOString()) => `<div class="tgme_widget_message" data-post="danang_news/${id}"><div class="tgme_widget_message_text"><b>${text}</b></div><a class="tgme_widget_message_date"><time datetime="${date}"></time></a></div>`;
  let tgHtml = tgPage(tgItem(5)); let publicFetches = 0; let publicFailure = false; let olderHtml = '';
  t.mock.method(globalThis, 'fetch', async (url: any, options: any) => {
    if (String(url).startsWith('https://t.me/s/danang_news')) {
      publicFetches++; assert.equal(options.redirect, 'error'); assert.equal(options.headers.cookie, undefined);
      if (publicFailure) return new Response('', { status: 429 });
      return new Response(String(url).includes('?before=') ? olderHtml : tgHtml, { headers: { 'content-type': 'text/html' } });
    }
    if (String(url).startsWith('https://www.atorus.ru/')) { feedCalls++; return new Response(rss(item())); }
    if (String(url).includes('/sendMessage')) { telegramCalls++; assert.equal(JSON.parse(options.body).chat_id, -100123); if (failSend) throw Error('timeout'); return Response.json({ ok: true, result: { message_id: 77 } }); }
    throw Error('Unexpected upstream request');
  });
  await t.test('concurrent refreshes deduplicate; persisted claims prevent duplicate channel sends', async () => {
    await mutateStore(s => { const n = newsState(s); n.sources = ['ator']; n.channel = { id: -100123, title: 'Твой Вьетнам', connectedAt: '2026-10-04T04:00:00Z' }; });
    await Promise.all([syncNews('123:test', now), syncNews('123:test', now)]);
    assert.equal(feedCalls, 1); assert.equal(telegramCalls, 1);
    let n = newsState(await readStore()); assert.equal(n.posts.length, 1); assert.equal(n.posts[0].delivery?.state, 'sent');
    await syncNews('123:test', new Date('2026-10-04T08:00:00Z')); assert.equal(telegramCalls, 1);
    await mutateStore(s => { const n = newsState(s); delete n.posts[0].delivery; delete n.lastSendAt; }); failSend = true;
    await syncNews('123:test', now); assert.equal(telegramCalls, 2);
    n = newsState(await readStore()); assert.equal(n.posts[0].delivery?.state, 'uncertain');
    await syncNews('123:test', new Date('2026-10-04T09:00:00Z')); assert.equal(telegramCalls, 2);
    await mutateStore(s => { newsState(s).enabled = false; }); const before = feedCalls; await syncNews('123:test', now); assert.equal(feedCalls, before);
  });
  const app = express(); app.use(express.json()); app.use('/api', createApiRouter({ botToken: '123:test' }));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api`;
  const req = async (path: string, body?: any, owner = true) => { const r = await actualFetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', ...(owner ? { 'x-admin-key': 'news-test-owner' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, data: await r.json() as any }; };
  t.after(async () => { await new Promise<void>(r => server.close(() => r())); await rm(dir, { recursive: true, force: true }); });
  await t.test('only owners manage sources and posts; public responses omit internal delivery state', async () => {
    assert.equal((await req('/admin/news', undefined, false)).status, 401);
    assert.equal((await req('/admin/news/visibility', { id: post.id, hidden: true }, false)).status, 401);
    assert.equal((await req('/admin/news/settings', { enabled: true, sources: ['http://127.0.0.1'] })).status, 400);
    assert.equal((await req('/admin/news/post', { title: 'Акция в Дананге', category: 'offers' })).status, 400);
    assert.equal((await req('/admin/news/post', { title: 'Место в Дананге', category: 'places', url: 'javascript:alert(1)' })).status, 400);
    const created = await req('/admin/news/post', { title: 'Место в Дананге', category: 'places', summary: 'Собственный обзор' }); assert.equal(created.status, 200);
    let pub = await req('/news', undefined, false); assert.equal(pub.status, 200); assert.ok(pub.data.posts.every((p: any) => !('delivery' in p) && !('hidden' in p)));
    await req('/admin/news/visibility', { id: created.data.id, hidden: true }); pub = await req('/news', undefined, false); assert.ok(!pub.data.posts.some((p: any) => p.id === created.data.id));
    await req('/admin/news/visibility', { id: created.data.id, hidden: false }); pub = await req('/news', undefined, false); assert.ok(pub.data.posts.some((p: any) => p.id === created.data.id));
    assert.equal((await req('/admin/news')).data.enabled, false);
  });
  await t.test('connected Telegram channels only; no echoes, protected content, duplicates or public attribution', async () => {
    await mutateStore(s => { const n = newsState(s); n.enabled = true; n.telegramSources = [{ id: -100456, title: 'Редакция Дананга', username: 'danang_editor', connectedAt: '2026-10-04T04:00:00Z' }]; });
    const msg = { chat: { id: -100456, type: 'channel' }, message_id: 11, date: +now / 1000, text: 'Новое кафе у моря\n\nВ Дананге открылось кафе с видом на пляж.' };
    assert.equal(await ingestTelegramNews({ ...msg, chat: { id: 123, type: 'private' } }, now), false);
    assert.equal(await ingestTelegramNews({ ...msg, chat: { id: -100999, type: 'channel' } }, now), false);
    await ingestTelegramNews({ ...msg, has_protected_content: true }, now);
    assert.equal(newsState(await readStore()).posts.filter(p => p.sourceKind === 'telegram').length, 0);
    await ingestTelegramNews(msg, now); await ingestTelegramNews(msg, now);
    const posts = newsState(await readStore()).posts.filter(p => p.sourceKind === 'telegram'); assert.equal(posts.length, 1);
    const p = posts[0]; assert.equal(p.category, 'places'); assert.equal(p.summary, 'В Дананге открылось кафе с видом на пляж.');
    const pub = publicNewsPost(p); assert.equal(pub.source, ''); assert.equal(pub.url, ''); assert.ok(!('sourceId' in pub));
    assert.doesNotMatch(newsTelegramText(p), /Редакция|danang_editor|Читать в источнике/);
    assert.match(newsTelegramText(post), /АТОР/);
    const api = await req('/news', undefined, false); assert.ok(api.data.posts.some((x: any) => x.id === p.id && x.source === '' && !x.url));
    await mutateStore(s => { newsState(s).channel = { id: -100456, title: 'Own channel', connectedAt: now.toISOString() }; });
    assert.equal(await ingestTelegramNews({ ...msg, message_id: 12 }, now), false);
    await mutateStore(s => { delete newsState(s).channel; newsState(s).enabled = false; });
    await ingestTelegramNews({ ...msg, message_id: 13, text: 'Другая новость Дананга' }, now);
    assert.equal(newsState(await readStore()).posts.filter(p => p.sourceKind === 'telegram').length, 1);
    assert.equal((await req('/admin/news/telegram-source', { channel: '@example' }, false)).status, 401);
    assert.equal((await req('/admin/news/telegram-source', { remove: true, id: -100456 })).status, 200);
    assert.equal(newsState(await readStore()).telegramSources?.length, 0);
    assert.equal(await ingestTelegramNews(msg, now), false);
  });
  await t.test('public Telegram HTML: strict URLs, identity, message dates, safe nested text and media cursors', async () => {
    assert.equal(publicTelegramUsername('https://t.me/s/DaNang_News'), 'danang_news');
    assert.equal(publicTelegramUsername('@DaNang_News'), 'danang_news');
    for (const bad of ['https://evil.test/danang_news', 'http://t.me/danang_news', 'https://t.me@127.0.0.1/danang_news', 'https://t.me/+secret', 'https://t.me/c/123/456', 'https://t.me/danang_news?x=1', 'https://t.me/s/../../admin']) assert.equal(publicTelegramUsername(bad), null);
    const parsed = parsePublicTelegramPage(tgPage(tgItem(6, 'Кафе &amp; море<br><br><i>Открытие</i><script>secret()</script>') + '<div class="tgme_widget_message" data-post="danang_news/7"></div>'), 'danang_news');
    assert.deepEqual(parsed.ids, [6,7]); assert.equal(parsed.messages.length, 1); assert.equal(parsed.messages[0].text, 'Кафе & море\n\nОткрытие');
    assert.throws(() => parsePublicTelegramPage('<html>Login required</html>', 'danang_news'));
    assert.throws(() => parsePublicTelegramPage(tgHtml.replace('@danang_news', '@other'), 'danang_news'));
    const before = publicFetches; await assert.rejects(fetchPublicTelegramPage('../admin')); assert.equal(publicFetches, before);
    publicFailure = true; await assert.rejects(fetchPublicTelegramPage('danang_news'), /частоту/); publicFailure = false;
  });
  await t.test('public channels connect without Bot API, skip old posts and import new posts once with persistent errors', async () => {
    assert.equal((await req('/admin/news/public-telegram-source', { channel: '@danang_news' }, false)).status, 401);
    const fetched = publicFetches;
    assert.equal((await req('/admin/news/public-telegram-source', { channel: 'https://127.0.0.1/' })).status, 400); assert.equal(publicFetches, fetched);
    assert.equal((await req('/admin/news/public-telegram-source', { channel: '@danang_news' })).status, 200);
    let n = newsState(await readStore()); let source = n.publicTelegramSources![0]; assert.equal(source.lastMessageId, 5);
    assert.equal(n.posts.filter(p => p.sourceId === 'telegram:public:danang_news').length, 0);
    await req('/admin/news/public-telegram-source', { channel: 'https://t.me/DaNang_News' });
    assert.equal(newsState(await readStore()).publicTelegramSources?.length, 1);
    await mutateStore(s => { const n = newsState(s); n.enabled = true; n.sources = []; n.publicTelegramSources![0].connectedAt = '2026-10-04T04:00:00Z'; });
    tgHtml = tgPage(tgItem(6));
    await syncNews('', now); await syncNews('', now);
    n = newsState(await readStore()); source = n.publicTelegramSources![0];
    assert.equal(source.lastMessageId, 6); assert.equal(n.posts.filter(p => p.sourceId === 'telegram:public:danang_news').length, 1);
    publicFailure = true; await syncNews('', now); n = newsState(await readStore()); assert.match(n.publicTelegramSources![0].error!, /частоту/); assert.equal(n.publicTelegramSources![0].lastMessageId, 6); publicFailure = false;
    tgHtml = tgPage(tgItem(9), '9'); olderHtml = tgPage(tgItem(8, 'Фестиваль Дананга') + tgItem(6));
    const polled = await pollPublicTelegramSource(source, now); assert.deepEqual(polled.posts.map(p => p.title), ['Новое кафе у моря', 'Фестиваль Дананга']); assert.equal(polled.lastMessageId, 9);
    olderHtml = tgPage(tgItem(8), '9'); await assert.rejects(pollPublicTelegramSource(source, now), /Слишком много/);
    await mutateStore(s => { newsState(s).channel = { id: -100999, title: 'Destination', url: 'https://t.me/danang_news', connectedAt: now.toISOString() }; });
    assert.equal((await req('/admin/news/public-telegram-source', { channel: '@danang_news' })).status, 400);
    await req('/admin/news/public-telegram-source', { remove: true, id: source.id });
    assert.equal(newsState(await readStore()).publicTelegramSources?.length, 0);
  });
  await t.test('public photos and mixed albums: preserve order/caption, skip avatar and link preview, flag unavailable video', async () => {
    const photo = '<a class="tgme_widget_message_photo_wrap" href="https://t.me/danang_news/21" style="background-image:url(\'https://cdn1.telesco.pe/file/photo?x=1&amp;y=2\')"></a>';
    const video = '<a class="tgme_widget_message_video_player" href="https://t.me/danang_news/22"><i class="tgme_widget_message_video_thumb" style="background-image:url(\'https://cdn1.telesco.pe/file/poster\')"></i><video src="https://cdn1.telesco.pe/file/movie.mp4"></video></a>';
    const html = tgPage(tgItem(21, 'Прогулка у моря<br>Фото и видео').replace('</div><a class="tgme_widget_message_date">', `</div>${photo}${video}<a class="tgme_widget_message_link_preview"><img src="https://evil.test/preview"/></a><a class="tgme_widget_message_date">`));
    const message = parsePublicTelegramPage(html, 'danang_news').messages[0];
    assert.deepEqual(message.media.map(m => [m.kind,m.messageId]), [['photo',21],['video',22]]);
    assert.equal(message.media[0].url, 'https://cdn1.telesco.pe/file/photo?x=1&y=2'); assert.ok(message.media[1].posterUrl);
    assert.match(message.text, /Фото и видео/);
    const unsafe = parsePublicTelegramPage(html.replace('https://cdn1.telesco.pe/file/movie.mp4', 'http://127.0.0.1/private'), 'danang_news').messages[0];
    assert.equal(unsafe.media.length, 1); assert.ok(unsafe.mediaWarning);
    const onlyMedia = parsePublicTelegramPage(html.replace('<div class="tgme_widget_message_text"><b>Прогулка у моря<br>Фото и видео</b></div>', ''), 'danang_news').messages[0];
    assert.equal(onlyMedia.text, ''); assert.equal(onlyMedia.media.length, 2);
    const { safeTelegramMediaUrl } = await import('../server/src/newsMedia.ts');
    for (const url of ['https://cdn1.telesco.pe.evil.test/file/x', 'https://cdn1.telesco.pe@127.0.0.1/file/x', 'file:///etc/passwd', 'https://cdn1.telesco.pe:4430/file/x']) assert.equal(safeTelegramMediaUrl(url), undefined);
  });
  await t.test('bot albums collect out-of-order updates once, preserve caption, wait before sending and keep private IDs private', async () => {
    await mutateStore(s => { const n = newsState(s); n.enabled = true; n.posts = []; n.sources = []; delete n.lastSendAt; n.channel = { id: -100123, title: 'Destination', connectedAt: '2026-10-04T04:00:00Z' }; n.telegramSources = [{ id: -100456, title: 'Source', username: 'source_test', connectedAt: '2026-10-04T04:00:00Z' }]; });
    const msg = { chat: { id: -100456, type: 'channel' }, media_group_id: 'album-1', message_id: 22, date: +now/1000, video: { file_id: 'private-video', thumbnail: { file_id: 'private-poster' } } };
    await ingestTelegramNews(msg, now);
    await ingestTelegramNews({ ...msg, video: undefined, message_id: 21, photo: [{ file_id: 'small' }, { file_id: 'private-photo' }], caption: 'Дананг на рассвете\nТёплый день у моря.' }, now);
    await ingestTelegramNews(msg, now);
    let n = newsState(await readStore()); assert.equal(n.posts.length, 1); const p = n.posts[0];
    assert.equal(p.title, 'Дананг на рассвете'); assert.deepEqual(p.media?.map(m => m.messageId), [21,22]);
    assert.equal(deliveryCandidate(n, now), undefined); assert.equal(deliveryCandidate(n, new Date(+now + 61000))?.id, p.id);
    const pub = publicNewsPost(p); assert.match(pub.media[0].url, /^\/api\/news\/media\//); assert.ok(pub.media[1].poster);
    assert.doesNotMatch(JSON.stringify(pub), /private-video|private-photo|private-poster|source_test|fileId|mediaUpdatedAt/);
    await ingestTelegramNews({ ...msg, message_id: 23, has_protected_content: true }, now); assert.equal(newsState(await readStore()).posts[0].media?.length, 2);
  });
  await t.test('media forwarding uses albums, retains long text, and persists partial delivery without duplicate retry', async t => {
    const { sendNewsMedia } = await import('../server/src/newsMedia.ts');
    const calls: string[] = []; let failText = false;
    t.mock.method(globalThis, 'fetch', async (url: any, init: any) => {
      const method = String(url).split('/').at(-1)!; calls.push(method);
      if (method === 'sendMessage') { if (failText) throw Error('timeout'); assert.ok(JSON.parse(init.body).text.length > 1024); return Response.json({ ok: true, result: { message_id: 81 } }); }
      assert.ok(init.body instanceof FormData);
      if (method === 'sendMediaGroup') { const album = JSON.parse(init.body.get('media')); assert.equal(album.length, 2); assert.equal(album[0].media, 'private-photo'); assert.equal(album[1].type, 'video'); return Response.json({ ok: true, result: [{ message_id: 79 },{ message_id: 80 }] }); }
      assert.ok(['sendPhoto','sendVideo'].includes(method)); assert.equal(init.body.get('caption'), 'Короткая подпись'); return Response.json({ ok: true, result: { message_id: 82 } });
    });
    const p = newsState(await readStore()).posts[0]; const ids: number[] = [];
    await sendNewsMedia('test', p, -100123, 'Текст '.repeat(220), undefined, async x => { ids.push(...x); });
    assert.deepEqual(calls, ['sendMediaGroup','sendMessage']); assert.deepEqual(ids, [79,80,81]);
    await sendNewsMedia('test', { ...p, media: [p.media![0]] }, -100123, 'Короткая подпись', undefined, async () => {});
    await sendNewsMedia('test', { ...p, media: [p.media![1]] }, -100123, 'Короткая подпись', undefined, async () => {});
    assert.deepEqual(calls.slice(-2), ['sendPhoto','sendVideo']);
    await mutateStore(s => { newsState(s).posts[0].summary = 'Длинный текст '.repeat(100); }); failText = true;
    await syncNews('test', new Date(+now + 61000));
    const failed = newsState(await readStore()).posts[0]; assert.equal(failed.delivery?.state, 'uncertain'); assert.deepEqual(failed.delivery?.messageIds, [79,80]);
    const count = calls.length; await syncNews('test', new Date(+now + 3 * 3600000)); assert.equal(calls.length, count);
  });
  await t.test('media proxy bounds downloads, renews expired links, supports video ranges and hides removed posts', async t => {
    const { getNewsMedia } = await import('../server/src/newsMedia.ts');
    const photoBytes = new Uint8Array([255,216,255,224,0,0,0,0,0,0,0,0,0,0,0,0]);
    const videoBytes = new Uint8Array([0,0,0,24,102,116,121,112,109,112,52,50,0,0,0,0]);
    let downloads = 0; let renewals = 0;
    t.mock.method(globalThis, 'fetch', async (url: any, init: any) => {
      if (String(url).startsWith('https://t.me/s/danang_news')) {
        renewals++; return new Response(tgPage(tgItem(31).replace('</div><a class="tgme_widget_message_date">', '</div><a class="tgme_widget_message_photo_wrap" href="https://t.me/danang_news/31" style="background-image:url(\'https://cdn1.telesco.pe/file/fresh\')"></a><a class="tgme_widget_message_date">')), { headers: { 'content-type': 'text/html' } });
      }
      assert.equal(init.redirect, 'error'); downloads++;
      if (String(url).endsWith('/expired')) return new Response('', { status: 403 });
      if (String(url).endsWith('/huge')) return new Response(photoBytes, { headers: { 'content-type': 'image/jpeg', 'content-length': '10000001' } });
      if (String(url).endsWith('/html')) return new Response('<script>bad</script>', { headers: { 'content-type': 'text/html' } });
      if (String(url).endsWith('/video')) return new Response(videoBytes, { headers: { 'content-type': 'video/mp4' } });
      return new Response(photoBytes, { headers: { 'content-type': 'image/jpeg' } });
    });
    const id = (await import('node:crypto')).randomBytes(12).toString('hex');
    const p = { ...post, id, publishedAt: new Date().toISOString(), sourceKind: 'telegram' as const, url: 'https://t.me/danang_news/31', media: [{ kind: 'photo' as const, messageId: 31, url: 'https://cdn1.telesco.pe/file/expired' }, { kind: 'video' as const, messageId: 32, url: 'https://cdn1.telesco.pe/file/video' }] };
    await mutateStore(s => { newsState(s).posts = [p]; });
    const file = await getNewsMedia(p, 0, 'test'); assert.equal(file.size, photoBytes.length); assert.equal(renewals, 1);
    const before = downloads; await getNewsMedia(p, 0, 'test'); assert.equal(downloads, before);
    const response = await actualFetch(`${base}/news/media/${id}/1`, { headers: { range: 'bytes=4-7' } }); assert.equal(response.status, 206); assert.equal(await response.text(), 'ftyp');
    for (const suffix of ['huge','html']) await assert.rejects(getNewsMedia({ ...p, url: '', media: [{ kind: 'photo', messageId: 33, url: `https://cdn1.telesco.pe/file/${suffix}` }] },0,'test'));
    await mutateStore(s => { newsState(s).posts[0].hidden = true; });
    assert.equal((await actualFetch(`${base}/news/media/${id}/1`)).status, 404);
    assert.equal((await actualFetch(`${base}/news/media/${id}/1000`)).status, 404);
  });
  await t.test('remove channel footer and generated dates while retaining dates in news text', async () => {
    const { cleanNewsText, newsLanguage } = await import('../server/src/newsText.ts');
    const content = 'Открытие 07.10.2026\n\n🌴Новости Дананга';
    assert.equal(cleanNewsText(content), 'Открытие 07.10.2026');
    const sample = { ...post, title: 'Открытие', summary: content, sourceId: 'telegram:test', sourceKind: 'telegram' as const };
    const text = newsTelegramText(sample); assert.doesNotMatch(text, /Новости Дананга|04\.10\.2026/); assert.match(text, /07\.10\.2026/);
    assert.equal(publicNewsPost(sample).summary, 'Открытие 07.10.2026');
    assert.equal(newsLanguage('Đà Nẵng khai trương công viên mới'), 'vi'); assert.equal(newsLanguage('Новое кафе'), 'ru');
    assert.ok(relevantToDanang('Đà Nẵng khai trương công viên mới', ''));
  });
  await t.test('Vietnamese news wait for Russian translation, preserve source, respect quota and reject failed translations', async t => {
    const { queueVietnamese, translatePendingNews, translateVietnamese, translationChunks } = await import('../server/src/newsTranslation.ts');
    assert.ok(translationChunks('Đà Nẵng '.repeat(300)).every(c => Buffer.byteLength(c) <= 500));
    let calls = 0; let failed = false;
    t.mock.method(globalThis, 'fetch', async (url: any) => {
      calls++; const u = new URL(String(url)); assert.equal(u.hostname, 'api.mymemory.translated.net'); assert.equal(u.searchParams.get('langpair'), 'vi|ru');
      if (failed) return Response.json({ responseStatus: 429, quotaFinished: true });
      return Response.json({ responseStatus: 200, responseData: { translatedText: 'В Дананге открылся новый парк' } });
    });
    const p = queueVietnamese({ ...post, id: 'vietnamese', title: 'Đà Nẵng khai trương công viên mới', summary: 'Công viên mở cửa vào ngày 8 tháng 10.', language: 'vi' });
    await mutateStore(s => { const n = newsState(s); n.posts = [p]; n.enabled = true; delete n.translationUsage; });
    assert.equal(visibleNews(newsState(await readStore()), now).length, 0);
    await translatePendingNews(now); let n = newsState(await readStore()); assert.equal(n.posts[0].language, 'ru'); assert.equal(n.posts[0].translation?.state, 'done');
    assert.equal(n.posts[0].url, p.url); assert.equal(visibleNews(n,now).length, 1); assert.ok(!('translation' in publicNewsPost(n.posts[0])));
    const before = calls; await translatePendingNews(now); assert.equal(calls, before);
    failed = true; await assert.rejects(translateVietnamese('Đà Nẵng'), /лимит/);
    await mutateStore(s => { const n = newsState(s); n.posts = [{ ...p, id: 'blocked' }]; n.translationUsage = { day: now.toISOString().slice(0,10), chars: 4800 }; });
    const full = calls; await translatePendingNews(now); assert.equal(calls, full); n = newsState(await readStore()); assert.equal(visibleNews(n,now).length, 0); assert.match(n.posts[0].translation!.error!, /лимит/);
  });
  await t.test('weather prepares before 08:00 Da Nang, sends once, replaces only its previous pin and retries pin failures', async t => {
    const { syncWeather, formatWeather, weatherDay } = await import('../server/src/newsWeather.ts');
    const actions: { method: string; body: any }[] = []; let clock = new Date('2026-10-08T00:47:00Z'); let nextId = 500; let pinFails = false; let sendFails = false;
    const forecast = () => ({ properties: { meta: { updated_at: clock.toISOString() }, timeseries: [8,12,18,23].map(h => ({ time: `2026-10-${String(Number(weatherDay(clock).slice(-2))).padStart(2,'0')}T${String(h-7).padStart(2,'0')}:00:00Z`, data: { instant: { details: { air_temperature: h===12?31:26, wind_speed: 4.2 } }, next_1_hours: { summary: { symbol_code: 'rain' } } } })) } });
    t.mock.method(globalThis, 'fetch', async (url: any, init: any) => {
      if (String(url).includes('api.met.no')) { actions.push({ method: 'forecast', body: {} }); assert.match(init.headers['user-agent'], /CashALot/); return Response.json(forecast()); }
      const method = String(url).split('/').at(-1)!; const body = JSON.parse(init.body); actions.push({ method, body });
      if (method === 'sendMessage' && sendFails || method === 'pinChatMessage' && pinFails) throw Error('timeout');
      return Response.json({ ok: true, result: method === 'sendMessage' ? { message_id: ++nextId } : true });
    });
    assert.match(formatWeather(forecast(),weatherDay(clock),clock).summary, /Утро \+26° · день \+31° · вечер \+26°/);
    assert.throws(() => formatWeather({ properties: { meta: { updated_at: '2020-01-01' }, timeseries: [] } },weatherDay(clock),clock), /устарел/);
    await mutateStore(s => { const n = newsState(s); n.enabled = true; n.posts = []; n.channel = { id: -100123, title: 'Destination', connectedAt: now.toISOString() }; n.weather = { enabled: true, jobs: [], lastPin: { chatId: -100123, messageId: 400 } }; });
    await syncWeather('test',new Date('2026-10-08T00:40:00Z')); assert.equal(actions.length,0);
    await syncWeather('test',clock); assert.deepEqual(actions.map(a=>a.method),['forecast']);
    clock = new Date('2026-10-08T01:00:00Z');
    await Promise.all([syncWeather('test',clock),syncWeather('test',clock)]);
    assert.deepEqual(actions.map(a=>a.method),['forecast','sendMessage','pinChatMessage','unpinChatMessage']);
    assert.equal(actions[3].body.message_id,400); assert.equal(actions[2].body.message_id,501);
    await syncWeather('test',clock); assert.equal(actions.length,4);
    let n = newsState(await readStore()); assert.equal(n.weather?.lastPin?.messageId,501); assert.equal(n.posts.length,1);
    clock = new Date('2026-10-09T01:00:00Z'); pinFails = true;
    await syncWeather('test',clock); n = newsState(await readStore()); assert.equal(n.weather?.lastPin?.messageId,501); assert.ok(n.weather?.error);
    const sends = actions.filter(a=>a.method==='sendMessage').length; pinFails = false; clock = new Date('2026-10-09T01:16:00Z');
    await syncWeather('test',clock); assert.equal(actions.filter(a=>a.method==='sendMessage').length,sends); assert.equal(actions.at(-1)?.body.message_id,501);
    assert.equal(newsState(await readStore()).weather?.lastPin?.messageId,502);
    clock = new Date('2026-10-10T01:00:00Z'); sendFails = true; await syncWeather('test',clock);
    const total = actions.length; await syncWeather('test',new Date('2026-10-10T01:20:00Z')); assert.equal(actions.length,total);
    n = newsState(await readStore()); assert.equal(n.weather?.jobs.at(-1)?.state,'uncertain');
    await mutateStore(s=>{newsState(s).enabled=false;}); await syncWeather('test',new Date('2026-10-11T01:00:00Z')); assert.equal(actions.length,total);
  });
});
