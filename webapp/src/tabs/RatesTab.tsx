import React, { useEffect, useMemo, useState } from "react";
import { apiGetGFormulas, apiGetMarketRates, apiGetTodayRates } from "../lib/api";
import type { MarketRatesResponse, TodayRatesResponse } from "../lib/types";

type Cur = "RUB" | "USD" | "USDT" | "EUR" | "THB" | "VND";
type Pair = { id: string; base: Cur; quote: Cur; mode: "vnd" | "g" };

// ✅ первые 5 валютных пар — НЕ ТРОГАЕМ (как было)
// ✅ остальные считаем по формулам с картинки: BUY = G*m, SELL = G*m
const PAIRS: Pair[] = [
  { id: "rub-vnd", base: "RUB", quote: "VND", mode: "vnd" },
  { id: "usdt-vnd", base: "USDT", quote: "VND", mode: "vnd" },
  { id: "usd-vnd", base: "USD", quote: "VND", mode: "vnd" },
  { id: "eur-vnd", base: "EUR", quote: "VND", mode: "vnd" },
  { id: "thb-vnd", base: "THB", quote: "VND", mode: "vnd" },

  // пары из таблицы
  { id: "usdt-rub", base: "USDT", quote: "RUB", mode: "g" },
  { id: "usd-rub", base: "USD", quote: "RUB", mode: "g" },
  { id: "eur-rub", base: "EUR", quote: "RUB", mode: "g" },
  { id: "thb-rub", base: "THB", quote: "RUB", mode: "g" },
  { id: "usd-usdt", base: "USD", quote: "USDT", mode: "g" },
  { id: "eur-usd", base: "EUR", quote: "USD", mode: "g" },
  { id: "eur-usdt", base: "EUR", quote: "USDT", mode: "g" },
  { id: "usd-thb", base: "USD", quote: "THB", mode: "g" },
  { id: "usdt-thb", base: "USDT", quote: "THB", mode: "g" },
  { id: "eur-thb", base: "EUR", quote: "THB", mode: "g" }
];

const DEFAULT_G_FORMULAS: Record<string, { buyMul: number; sellMul: number }> = {
  "USDT/RUB": { buyMul: 0.98, sellMul: 1.08 },
  "USD/RUB": { buyMul: 0.98, sellMul: 1.08 },
  "EUR/RUB": { buyMul: 0.94, sellMul: 1.08 },
  "THB/RUB": { buyMul: 0.96, sellMul: 1.1 },
  "USD/USDT": { buyMul: 0.965, sellMul: 1.035 },
  "EUR/USD": { buyMul: 0.95, sellMul: 1.05 },
  "EUR/USDT": { buyMul: 0.95, sellMul: 1.05 },
  "USD/THB": { buyMul: 0.95, sellMul: 1.07 },
  "USDT/THB": { buyMul: 0.95, sellMul: 1.07 },
  "EUR/THB": { buyMul: 0.95, sellMul: 1.07 }
};

function fmtDaNang(d: Date) {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    })
      .format(d)
      .replace(",", "");
  } catch {
    return d.toLocaleString("ru-RU");
  }
}

// ✅ VND — без копеек, парсинг‑пары — с 1 знаком, кроме USD → USDT (3 знака)
function fmt(pairId: string, quote: Cur, n: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  const digits = quote === "VND" ? 0 : pairId === "usd-usdt" ? 3 : 1;
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(n);
}

// Покупка/Продажа ПЕРВОЙ валюты пары через курсы к VND (как было)
function calcFromVnd(rates: any, base: Cur, quote: Cur): { buy: number | null; sell: number | null } {
  if (!rates) return { buy: null, sell: null };
  if (base === quote) return { buy: 1, sell: 1 };

  const br = base === "VND" ? { buy_vnd: 1, sell_vnd: 1 } : rates?.[base];
  if (!br) return { buy: null, sell: null };

  const baseBuy = Number(br.buy_vnd);
  const baseSell = Number(br.sell_vnd);
  if (!Number.isFinite(baseBuy) || !Number.isFinite(baseSell) || baseBuy <= 0 || baseSell <= 0) {
    return { buy: null, sell: null };
  }

  if (quote === "VND") return { buy: baseBuy, sell: baseSell };

  const qr = rates?.[quote];
  if (!qr) return { buy: null, sell: null };

  const quoteBuy = Number(qr.buy_vnd);
  const quoteSell = Number(qr.sell_vnd);
  if (!Number.isFinite(quoteBuy) || !Number.isFinite(quoteSell) || quoteBuy <= 0 || quoteSell <= 0) {
    return { buy: null, sell: null };
  }

  return {
    buy: baseBuy / quoteSell,
    sell: baseSell / quoteBuy
  };
}

function gRateDecimals(base: Cur, quote: Cur): number {
  return base === "USD" && quote === "USDT" ? 3 : 1;
}

function roundRate(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function calcFromG(
  market: MarketRatesResponse | null,
  formulas: Record<string, { buyMul: number; sellMul: number }> | null,
  base: Cur,
  quote: Cur
): { buy: number | null; sell: number | null } {
  if (!market || !market.ok) return { buy: null, sell: null };
  const key = `${base}/${quote}`;
  const f = (formulas && formulas[key]) || DEFAULT_G_FORMULAS[key];
  const G = Number(market.g?.[key]);
  if (!f || !Number.isFinite(G) || G <= 0) return { buy: null, sell: null };
  const decimals = gRateDecimals(base, quote);
  return {
    buy: roundRate(G * f.buyMul, decimals),
    sell: roundRate(G * f.sellMul, decimals),
  };
}

type Props = { embedded?: boolean; limit?: number };

export default function RatesTab({ embedded = false, limit }: Props = {}) {
  const [today, setToday] = useState<TodayRatesResponse | null>(null);
  const [market, setMarket] = useState<MarketRatesResponse | null>(null);
  const [formulas, setFormulas] = useState<Record<string, { buyMul: number; sellMul: number }>>(DEFAULT_G_FORMULAS);

  useEffect(() => {
    apiGetTodayRates().then(setToday);
  }, []);

  useEffect(() => {
    apiGetGFormulas()
      .then((r: any) => {
        if (r && r.ok && r.formulas && typeof r.formulas === "object") {
          setFormulas(r.formulas);
        }
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const m = await apiGetMarketRates();
        if (alive) setMarket(m);
      } catch {
        if (alive) setMarket({ ok: false, error: "market_fetch_failed", stale: true } as any);
      }
    };

    load();
    const id = window.setInterval(load, 15 * 60 * 1000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const rates: any = (today as any)?.data?.rates ?? null;
  const updatedAt = (today as any)?.data?.updated_at ? fmtDaNang(new Date((today as any).data.updated_at)) : null;
  const marketUpdatedAt = market?.ok && market.updated_at ? fmtDaNang(new Date(market.updated_at)) : null;

  const rows = useMemo(() => {
    return PAIRS.map((p) => {
      const { buy, sell } =
        p.mode === "g" ? calcFromG(market, formulas, p.base, p.quote) : calcFromVnd(rates, p.base, p.quote);
      return { ...p, buy, sell };
    });
  }, [rates, market, formulas]);

  const metaParts = useMemo(() => {
    const parts: string[] = [];
    parts.push(`${today?.date ?? "—"}`);
    if (updatedAt) parts.push(`VND ${updatedAt}`);
    if (marketUpdatedAt) parts.push(`G ${marketUpdatedAt}${market?.ok && (market as any).stale ? " (устар.)" : ""}`);
    return parts;
  }, [today?.date, updatedAt, marketUpdatedAt, market?.ok]);

  const shown = rows.slice(0, limit ?? rows.length);

  const content = !today ? (
    <div className="vx-meta">Загрузка…</div>
  ) : !rates ? (
    <div className="vx-meta">Курс ещё не задан владельцем.</div>
  ) : (
    <>
      <div className={"mx-rateTable" + (embedded ? " mx-rateTableEmbedded" : "")}
        role="table"
        aria-label="Курс">
        <div className="mx-rateRow mx-rateHead" role="row">
          <div className="mx-rateCell mx-ratePairH" role="columnheader">Пара</div>
          <div className="mx-rateCell mx-rateBuyH" role="columnheader">Покупка</div>
          <div className="mx-rateCell mx-rateSellH" role="columnheader">Продажа</div>
        </div>

        {shown.map((r) => (
          <div key={r.id} className="mx-rateRow" role="row">
            <div className="mx-rateCell mx-ratePair" role="cell">
              {r.base} → {r.quote}
            </div>
            <div className={"mx-rateCell mx-rateBuy " + (r.buy == null ? "vx-dash" : "")} role="cell">
              {fmt(r.id, r.quote, r.buy)}
            </div>
            <div className={"mx-rateCell mx-rateSell " + (r.sell == null ? "vx-dash" : "")} role="cell">
              {fmt(r.id, r.quote, r.sell)}
            </div>
          </div>
        ))}
      </div>

      {market && !market.ok && !embedded ? (
        <div className="vx-meta vx-mt10">Не удалось обновить G: {(market as any).error}</div>
      ) : null}
    </>
  );

  if (embedded) return <>{content}</>;

  return (
    <div className="vx-rates2">
      <div className="vx-head">
        <div>
          <div className="h2 vx-m0">Курс</div>
          <div className="vx-meta vx-metaLine">
            {metaParts.map((p) => (
              <span key={p}>{p}</span>
            ))}
          </div>
        </div>
      </div>
      {content}
    </div>
  );
}
