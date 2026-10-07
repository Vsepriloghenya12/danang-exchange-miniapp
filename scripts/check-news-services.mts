import { NEWS_SOURCES, parseNewsFeed } from '../server/src/news.ts';
import { translateVietnamese } from '../server/src/newsTranslation.ts';
import { formatWeather, weatherDay } from '../server/src/newsWeather.ts';
const now = new Date();
for (const source of NEWS_SOURCES.filter(s => s.language === 'vi')) {
  const r = await fetch(source.url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  const posts = parseNewsFeed(await r.text(),source,now);
  console.log(JSON.stringify({ source: source.name, status: r.status, relevant: posts.length, latest: posts[0]?.title }));
}
try { console.log('Translation:',await translateVietnamese('Đà Nẵng khai trương công viên mới')); }
catch (e) { console.log('Translation unavailable:', e instanceof Error ? e.message : 'unknown'); process.exitCode = 1; }
const forecast = await (await fetch('https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=16.0544&lon=108.2022', { headers: { 'user-agent': 'CashALotNews/1.0 https://t.me/tvoi_vietnam_danang' } })).json();
const tomorrow = new Date(+now + 86400000);
console.log('Tomorrow preview:',formatWeather(forecast,weatherDay(tomorrow),now).summary);
