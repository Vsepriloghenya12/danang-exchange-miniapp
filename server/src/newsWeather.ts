import { randomUUID } from 'node:crypto';
import { readStore, mutateStore } from './store.js';
import { newsState, type NewsPost } from './news.js';
import { telegramRequest } from './telegramExperience.js';

const ZONE = 'Asia/Ho_Chi_Minh';
export const weatherDay = (now: Date) => now.toLocaleDateString('en-CA', { timeZone: ZONE });
const localHour = (now: Date) => Number(now.toLocaleString('en-US', { timeZone: ZONE, hour: 'numeric', hourCycle: 'h23' }));
type Pin = { chatId: string | number; messageId: number };
type WeatherJob = { day: string; chatId: string | number; text: string; summary: string; title: string; state: 'ready' | 'sending' | 'sent' | 'uncertain'; messageId?: number; pinned?: boolean; error?: string; sentAt?: string };
export type NewsWeather = { enabled: boolean; jobs: WeatherJob[]; lease?: { id: string; until: string }; retryAt?: string; checkedAt?: string; error?: string; lastPin?: Pin; oldPins?: Pin[] };
export function weatherState(n: ReturnType<typeof newsState>): NewsWeather { return n.weather ||= { enabled: false, jobs: [] }; }
const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export function formatWeather(data: any, day: string, now: Date) {
  const updated = Date.parse(data?.properties?.meta?.updated_at || '');
  if (!Number.isFinite(updated) || updated < +now - 12 * 3600000 || updated > +now + 300000) throw Error('Прогноз устарел. Ожидаем свежие данные.');
  const points = (data?.properties?.timeseries || []).filter((p: any) => Number.isFinite(Date.parse(p.time)) && weatherDay(new Date(p.time)) === day && localHour(new Date(p.time)) >= 8 && localHour(new Date(p.time)) <= 23);
  const slots = [8,12,18].map(h => points.find((p: any) => localHour(new Date(p.time)) === h));
  if (slots.some(p => !number(p?.data?.instant?.details?.air_temperature))) throw Error('Прогноз на утро, день и вечер ещё не готов.');
  const temperatures = points.map((p: any) => p.data?.instant?.details?.air_temperature).filter(number);
  const winds = points.map((p: any) => p.data?.instant?.details?.wind_speed).filter(number);
  const symbols: string[] = points.map((p: any) => p.data?.next_1_hours?.summary?.symbol_code || p.data?.next_6_hours?.summary?.symbol_code || '');
  const condition = symbols.some(s => /thunder/.test(s)) ? 'Возможны грозы' : symbols.some(s => /heavyrain/.test(s)) ? 'Ожидается сильный дождь' : symbols.some(s => /rain/.test(s)) ? 'Возможен дождь' : symbols.some(s => /fog/.test(s)) ? 'Местами туман' : symbols.some(s => /cloud/.test(s)) ? 'Переменная облачность' : symbols.some(s => /clearsky|fair/.test(s)) ? 'Преимущественно ясно' : 'Состояние неба не указано в прогнозе';
  const temp = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}°`;
  const title = 'Погода в Дананге на сегодня';
  const summary = `Утро ${temp(slots[0].data.instant.details.air_temperature)} · день ${temp(slots[1].data.instant.details.air_temperature)} · вечер ${temp(slots[2].data.instant.details.air_temperature)}\n\n${condition}.\nВ течение дня: ${temp(Math.min(...temperatures))}…${temp(Math.max(...temperatures))}.${winds.length ? `\nВетер до ${Math.ceil(Math.max(...winds))} м/с.` : ''}`;
  const text = `🌤 <b>${title}</b>\n\n${summary}\n\n<a href="https://www.met.no/en/free-meteorological-data/Licensing-and-crediting">MET Norway · CC BY 4.0</a> · сводка прогноза`;
  return { title, summary, text };
}
async function fetchWeather(day: string, now: Date) {
  const r = await fetch('https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=16.0544&lon=108.2022', { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'CashALotNews/1.0 https://t.me/tvoi_vietnam_danang', accept: 'application/json' } });
  if (!r.ok) throw Error('Сервис погоды временно недоступен.');
  const raw = await r.text(); if (raw.length > 2_000_000) throw Error('Некорректный прогноз.');
  return formatWeather(JSON.parse(raw), day, now);
}
let running: Promise<void> | undefined;
export function syncWeather(token: string, now = new Date()) {
  if (running) return running;
  running = runWeather(token, now).finally(() => { running = undefined; }); return running;
}
async function runWeather(token: string, now: Date) {
  if (!token) return;
  const leaseId = randomUUID(); const day = weatherDay(now); const hour = localHour(now);
  const minute = Number(now.toLocaleString('en-US', { timeZone: ZONE, minute: 'numeric' }));
  const { result: acquired } = await mutateStore(s => {
    const n = newsState(s), w = weatherState(n);
    if (!n.enabled || !w.enabled || !n.channel || w.lease && Date.parse(w.lease.until) > +now || w.retryAt && Date.parse(w.retryAt) > +now) return false;
    // Prepare at 07:47; post at 08:00. After downtime catch up only until 10:00.
    if (!(hour === 7 && minute >= 47 || hour >= 8 && hour < 10) && !w.jobs.some(j => j.day === day && j.messageId && !j.pinned && String(j.chatId) === String(n.channel!.id)) && !w.oldPins?.length) return false;
    w.lease = { id: leaseId, until: new Date(+now + 180000).toISOString() }; return true;
  });
  if (!acquired) return;
  try {
    const n = newsState(await readStore()); const channel = n.channel!; const w = weatherState(n);
    let job = w.jobs.find(j => j.day === day && String(j.chatId) === String(channel.id));
    if (!job && (hour === 7 || hour >= 8 && hour < 10)) {
      const forecast = await fetchWeather(day, now);
      job = { day, chatId: channel.id, ...forecast, state: 'ready' };
      const prepared = job;
      await mutateStore(s => { const current = newsState(s); if (current.channel?.id !== channel.id) return; const state = weatherState(current); state.jobs = [...state.jobs.filter(j => j.day >= new Date(+now - 7*86400000).toISOString().slice(0,10)), prepared]; state.checkedAt = now.toISOString(); delete state.error; });
    }
    if (job?.state === 'ready' && hour >= 8 && hour < 10) {
      const { result: claim } = await mutateStore(s => {
        const n = newsState(s), state = weatherState(n); const current = state.jobs.find(j => j.day === day && j.chatId === channel.id);
        if (!n.enabled || !state.enabled || n.channel?.id !== channel.id || state.lease?.id !== leaseId || current?.state !== 'ready') return false;
        current.state = 'sending'; current.sentAt = now.toISOString(); return true;
      });
      if (claim) {
        try {
          const sent = await telegramRequest(token, 'sendMessage', { chat_id: channel.id, text: job.text, parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
          await mutateStore(s => {
            const n = newsState(s), state = weatherState(n); const j = state.jobs.find(j => j.day === day && j.chatId === channel.id); if (!j) return;
            j.messageId = sent.message_id; j.state = 'sent';
            const id = `weather-${String(channel.id)}-${day}`;
            const post: NewsPost = { id, title: j.title, summary: j.summary, source: 'MET Norway', sourceId: 'weather', sourceKind: 'website', url: 'https://www.met.no/en/free-meteorological-data/Licensing-and-crediting', category: 'life', language: 'ru', publishedAt: now.toISOString(), addedAt: now.toISOString(), expiresAt: new Date(`${day}T23:59:59+07:00`).toISOString(), hidden: false, delivery: { state: 'sent', at: now.toISOString(), chatId: channel.id, messageId: sent.message_id } };
            if (!n.posts.some(p => p.id === id)) n.posts.unshift(post);
          });
        } catch {
          await mutateStore(s => { const state = weatherState(newsState(s)); const j = state.jobs.find(j => j.day === day && j.chatId === channel.id); if (j && !j.messageId) j.state = 'uncertain'; state.error = 'Отправка погоды не подтверждена. Проверьте канал; повтор автоматически не отправляется.'; });
        }
      }
    }
    const latest = weatherState(newsState(await readStore()));
    const toPin = latest.jobs.filter(j => j.messageId && !j.pinned && j.chatId === channel.id && j.day === day).at(-1);
    if (toPin) {
      await telegramRequest(token, 'pinChatMessage', { chat_id: channel.id, message_id: toPin.messageId, disable_notification: true });
      await mutateStore(s => {
        const state = weatherState(newsState(s)); const j = state.jobs.find(j => j.day === day && j.chatId === channel.id); if (!j) return;
        j.pinned = true; const previous = state.lastPin;
        if (previous && (previous.messageId !== j.messageId || previous.chatId !== j.chatId)) (state.oldPins ||= []).push(previous);
        state.lastPin = { chatId: j.chatId, messageId: j.messageId! }; delete state.error;
      });
    }
    for (const pin of weatherState(newsState(await readStore())).oldPins || []) {
      await telegramRequest(token, 'unpinChatMessage', { chat_id: pin.chatId, message_id: pin.messageId });
      await mutateStore(s => { const state = weatherState(newsState(s)); state.oldPins = state.oldPins?.filter(p => p.chatId !== pin.chatId || p.messageId !== pin.messageId); });
    }
  } catch {
    await mutateStore(s => { const w = weatherState(newsState(s)); w.error = 'Не удалось получить или закрепить прогноз. Проверьте доступ к погоде и право бота «Редактировать сообщения» в канале.'; w.retryAt = new Date(+now + 15*60000).toISOString(); });
  } finally {
    await mutateStore(s => { const w = weatherState(newsState(s)); if (w.lease?.id === leaseId) delete w.lease; });
  }
}
export function startWeatherWorker(token: string) {
  const tick = () => { void syncWeather(token).catch(() => console.error('Weather worker failed.')); };
  const first = setTimeout(tick, 17000); first.unref();
  const timer = setInterval(tick, 60000); timer.unref();
}
