import React, { useEffect, useMemo, useState } from "react";
import { apiGetMarketRates, apiGetTodayRates } from "../lib/api";
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

const G_FORMULAS: Record<string, { buyMul: number; sellMul: number }> = {
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

// ✅ VND — без копеек, остальные — 2 знака
function fmt(quote: Cur, n: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  const digits = quote === "VND" ? 0 : 2;
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

function calcFromG(market: MarketRatesResponse | null, base: Cur, quote: Cur): { buy: number | null; sell: number | null } {
  if (!market || !market.ok) return { buy: null, sell: null };
  const key = `${base}/${quote}`;
  const f = G_FORMULAS[key];
  const G = Number(market.g?.[key]);
  if (!f || !Number.isFinite(G) || G <= 0) return { buy: null, sell: null };
  return { buy: G * f.buyMul, sell: G * f.sellMul };
}

export default function RatesTab() {
  const [today, setToday] = useState<TodayRatesResponse | null>(null);
  const [market, setMarket] = useState<MarketRatesResponse | null>(null);

  useEffect(() => {
    apiGetTodayRates().then(setToday);
  }, []);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const m = await apiGetMarketRates();
        if (alive) setMarket(m);
      } catch {
        if (alive) setMarket({ ok: false, error: "market_fetch_failed", stale: true });
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
      const { buy, sell } = p.mode === "g" ? calcFromG(market, p.base, p.quote) : calcFromVnd(rates, p.base, p.quote);
      return { ...p, buy, sell };
    });
  }, [rates, market]);

  return (
    <div className="vx-rates2">
      <div className="vx-head">
        <div>
          <div className="h2 vx-m0">Курс</div>
          <div className="vx-meta">Дата (Дананг): {today?.date ?? "—"}</div>
          {updatedAt ? <div className="vx-meta">Обновлено (VND): {updatedAt}</div> : null}
          {marketUpdatedAt ? (
            <div className="vx-meta">
              Обновлено (G): {marketUpdatedAt}
              {market?.ok && market.stale ? " (устар.)" : ""}
            </div>
          ) : null}
        </div>
      </div>

      {!today ? (
        <div className="vx-meta">Загрузка…</div>
      ) : !rates ? (
        <div className="vx-meta">Курс ещё не задан владельцем.</div>
      ) : (
        <div className="vx-table">
          <div className="vx-tr vx-th">
            <div>Пара</div>
            <div className="vx-end">BUY</div>
            <div className="vx-end">SELL</div>
          </div>

          {rows.map((r) => (
            <div key={r.id} className="vx-tr">
              <div>
                <div className="vx-pair">
                  {r.base} → {r.quote}
                </div>
                <div className="vx-sub">за 1 {r.base}</div>
              </div>

              <div className={"vx-num " + (r.buy == null ? "vx-dash" : "")}>{fmt(r.quote, r.buy)}</div>
              <div className={"vx-num " + (r.sell == null ? "vx-dash" : "")}>{fmt(r.quote, r.sell)}</div>
            </div>
          ))}

          {market && !market.ok ? (
            <div className="vx-meta vx-mt10">
              Не удалось обновить G: {market.error}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
