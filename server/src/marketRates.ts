// Рыночные курсы "G" (как в Google) для кросс‑пар.
// Обновление кэша каждые 15 минут.

type MarketOk = {
  ok: true;
  updated_at: string; // когда мы обновили кэш
  source: string;
  stale: boolean;
  g: Record<string, number>; // "USD/RUB" => G
};

type MarketErr = {
  ok: false;
  error: string;
  stale: boolean;
  updated_at?: string;
  source?: string;
  g?: Record<string, number>;
};

export type MarketSnapshot = MarketOk | MarketErr;

const REFRESH_MS = 15 * 60 * 1000;
const HTTP_TIMEOUT_MS = 8000;

let cache: MarketOk | null = null;
let lastFetchAt = 0;
let inFlight: Promise<MarketOk> | null = null;
let timer: NodeJS.Timeout | null = null;

async function fetchJson(url: string): Promise<any> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), HTTP_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { "user-agent": "danang-exchange-miniapp" } });
    const txt = await r.text();
    let json: any;
    try {
      json = JSON.parse(txt);
    } catch {
      json = null;
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    if (!json) throw new Error("bad_json");
    return json;
  } finally {
    clearTimeout(t);
  }
}

async function fetchUsdBase(): Promise<{ RUB: number; THB: number; EUR: number; source: string }> {
  // 1) exchangerate.host
  try {
    const j = await fetchJson("https://api.exchangerate.host/latest?base=USD&symbols=RUB,THB,EUR");
    const RUB = Number(j?.rates?.RUB);
    const THB = Number(j?.rates?.THB);
    const EUR = Number(j?.rates?.EUR);
    if ([RUB, THB, EUR].every((n) => Number.isFinite(n) && n > 0)) {
      return { RUB, THB, EUR, source: "exchangerate.host" };
    }
  } catch {
    // ignore
  }

  // 2) open.er-api.com
  try {
    const j = await fetchJson("https://open.er-api.com/v6/latest/USD");
    const RUB = Number(j?.rates?.RUB);
    const THB = Number(j?.rates?.THB);
    const EUR = Number(j?.rates?.EUR);
    if ([RUB, THB, EUR].every((n) => Number.isFinite(n) && n > 0)) {
      return { RUB, THB, EUR, source: "open.er-api.com" };
    }
  } catch {
    // ignore
  }

  // 3) exchangerate-api.com
  try {
    const j = await fetchJson("https://api.exchangerate-api.com/v4/latest/USD");
    const RUB = Number(j?.rates?.RUB);
    const THB = Number(j?.rates?.THB);
    const EUR = Number(j?.rates?.EUR);
    if ([RUB, THB, EUR].every((n) => Number.isFinite(n) && n > 0)) {
      return { RUB, THB, EUR, source: "exchangerate-api.com" };
    }
  } catch {
    // ignore
  }

  throw new Error("market_source_unavailable");
}

function buildG(usd: { RUB: number; THB: number; EUR: number }): Record<string, number> {
  const USD_RUB = usd.RUB; // 1 USD -> RUB
  const USD_THB = usd.THB; // 1 USD -> THB
  const USD_EUR = usd.EUR; // 1 USD -> EUR

  const EUR_USD = 1 / USD_EUR; // 1 EUR -> USD
  const EUR_RUB = EUR_USD * USD_RUB; // 1 EUR -> RUB
  const EUR_THB = EUR_USD * USD_THB; // 1 EUR -> THB
  const THB_RUB = USD_RUB / USD_THB; // 1 THB -> RUB

  const g: Record<string, number> = {
    // таблица с картинки
    "USDT/RUB": USD_RUB, // считаем USDT ~= USD
    "USD/RUB": USD_RUB,
    "EUR/RUB": EUR_RUB,
    "THB/RUB": THB_RUB,
    "USD/USDT": 1,
    "EUR/USD": EUR_USD,
    "EUR/USDT": EUR_USD,
    "USD/THB": USD_THB,
    "USDT/THB": USD_THB,
    "EUR/THB": EUR_THB
  };

  for (const k of Object.keys(g)) {
    const v = Number(g[k]);
    if (!Number.isFinite(v) || v <= 0) delete g[k];
  }

  return g;
}

async function refresh(): Promise<MarketOk> {
  const usd = await fetchUsdBase();
  const g = buildG(usd);

  const ok: MarketOk = {
    ok: true,
    updated_at: new Date().toISOString(),
    source: usd.source,
    stale: false,
    g
  };

  cache = ok;
  lastFetchAt = Date.now();
  return ok;
}

export async function getMarketSnapshot(): Promise<MarketSnapshot> {
  const now = Date.now();
  // `cache && ...` returns a non-boolean union; keep this strictly boolean for TS narrowing.
  const fresh = !!cache && now - lastFetchAt < REFRESH_MS;
  if (fresh && cache) return cache;

  if (!inFlight) {
    inFlight = refresh().finally(() => {
      inFlight = null;
    });
  }

  try {
    return await inFlight;
  } catch (e: any) {
    if (cache) return { ...cache, stale: true };
    return { ok: false, error: e?.message || "market_fetch_failed", stale: true };
  }
}

export function startMarketUpdater() {
  if (timer) return;

  // первый прогрев
  getMarketSnapshot().catch(() => null);

  timer = setInterval(() => {
    getMarketSnapshot().catch(() => null);
  }, REFRESH_MS);

  // чтобы не держать процесс при завершении
  timer.unref?.();
}
