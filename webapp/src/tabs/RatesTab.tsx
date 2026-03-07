import React, { useEffect, useMemo, useState } from "react";
import { apiGetTodayRates, getUsdtUsdPairMarkups } from "../lib/api";
import type { TodayRatesResponse } from "../lib/types";

type Cur = "RUB" | "USD" | "USDT" | "EUR" | "THB" | "VND";
type Pair = { id: string; base: Cur; quote: Cur };

const PAIRS: Pair[] = [
  { id: "rub-vnd", base: "RUB", quote: "VND" },
  { id: "usdt-vnd", base: "USDT", quote: "VND" },
  { id: "usd-vnd", base: "USD", quote: "VND" },
  { id: "eur-vnd", base: "EUR", quote: "VND" },
  { id: "thb-vnd", base: "THB", quote: "VND" },
  { id: "rub-usdt", base: "RUB", quote: "USDT" },
  { id: "rub-usd", base: "RUB", quote: "USD" },
  { id: "rub-eur", base: "RUB", quote: "EUR" },
  { id: "rub-thb", base: "RUB", quote: "THB" },
  { id: "usd-usdt", base: "USD", quote: "USDT" },
  { id: "eur-usd", base: "EUR", quote: "USD" },
  { id: "eur-usdt", base: "EUR", quote: "USDT" },
  { id: "thb-usd", base: "THB", quote: "USD" },
  { id: "thb-usdt", base: "THB", quote: "USDT" },
  { id: "thb-eur", base: "THB", quote: "EUR" }
];

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

function fmt(n: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1
  }).format(n);
}

function getUsdtUsdPairRates(rates: any, pairMarkups: { buy: number; sell: number }) {
  const usdt = rates?.USDT;
  const usd = rates?.USD;
  if (!usdt || !usd) return null;

  const baseBuy = Number(usdt.buy_vnd) / Number(usd.sell_vnd);
  const baseSell = Number(usdt.sell_vnd) / Number(usd.buy_vnd);
  if (!Number.isFinite(baseBuy) || !Number.isFinite(baseSell) || baseBuy <= 0 || baseSell <= 0) return null;

  const buy = baseBuy + pairMarkups.buy;
  const sell = baseSell + pairMarkups.sell;
  if (!Number.isFinite(buy) || !Number.isFinite(sell) || buy <= 0 || sell <= 0) return null;

  return { buy, sell };
}

function calcBuySell(
  rates: any,
  base: Cur,
  quote: Cur,
  pairMarkups: { buy: number; sell: number }
): { buy: number | null; sell: number | null } {
  if (!rates) return { buy: null, sell: null };
  if (base === quote) return { buy: 1, sell: 1 };

  const usdtUsd = getUsdtUsdPairRates(rates, pairMarkups);

  if (base === "USDT" && quote === "USD") {
    return usdtUsd ? { buy: usdtUsd.buy, sell: usdtUsd.sell } : { buy: null, sell: null };
  }

  if (base === "USD" && quote === "USDT") {
    if (!usdtUsd) return { buy: null, sell: null };
    return {
      buy: 1 / usdtUsd.sell,
      sell: 1 / usdtUsd.buy
    };
  }

  const br = base === "VND" ? { buy_vnd: 1, sell_vnd: 1 } : rates?.[base];
  if (!br) return { buy: null, sell: null };

  const baseBuy = Number(br.buy_vnd);
  const baseSell = Number(br.sell_vnd);
  if (!Number.isFinite(baseBuy) || !Number.isFinite(baseSell) || baseBuy <= 0 || baseSell <= 0) {
    return { buy: null, sell: null };
  }

  if (quote === "VND") {
    return { buy: baseBuy, sell: baseSell };
  }

  const qr = rates?.[quote];
  if (!qr) return { buy: null, sell: null };

  const quoteBuy = Number(qr.buy_vnd);
  const quoteSell = Number(qr.sell_vnd);
  if (!Number.isFinite(quoteBuy) || !Number.isFinite(quoteSell) || quoteBuy <= 0 || quoteSell <= 0) {
    return { buy: null, sell: null };
  }

  const buy = baseBuy / quoteSell;
  const sell = baseSell / quoteBuy;

  return {
    buy: Number.isFinite(buy) ? buy : null,
    sell: Number.isFinite(sell) ? sell : null
  };
}

export default function RatesTab() {
  const [data, setData] = useState<TodayRatesResponse | null>(null);

  useEffect(() => {
    apiGetTodayRates().then(setData);
  }, []);

  const rates: any = (data as any)?.data?.rates ?? null;
  const pairMarkups = getUsdtUsdPairMarkups(data);
  const updatedAt = (data as any)?.data?.updated_at ? fmtDaNang(new Date((data as any).data.updated_at)) : null;

  const rows = useMemo(() => {
    return PAIRS.map((p) => {
      const { buy, sell } = calcBuySell(rates, p.base, p.quote, pairMarkups);
      return { ...p, buy, sell };
    });
  }, [rates, pairMarkups]);

  return (
    <div className="vx-rates2">
      <div className="vx-head">
        <div>
          <div className="h2 vx-m0">Курс</div>
          <div className="vx-meta">Дата (Дананг): {data?.date ?? "—"}</div>
          <div className="vx-note">Покупка / Продажа — для первой валюты пары</div>
        </div>
        {updatedAt ? <div className="vx-meta">Обновлено: {updatedAt}</div> : null}
      </div>

      {!data ? (
        <div className="vx-meta">Загрузка…</div>
      ) : !rates ? (
        <div className="vx-meta">Курс ещё не задан владельцем.</div>
      ) : (
        <div className="vx-table">
          <div className="vx-tr vx-th">
            <div>Пара</div>
            <div className="vx-end">Покупка</div>
            <div className="vx-end">Продажа</div>
          </div>

          {rows.map((r) => (
            <div key={r.id} className="vx-tr">
              <div>
                <div className="vx-pair">{r.base} → {r.quote}</div>
                <div className="vx-sub">за 1 {r.base}</div>
              </div>

              <div className={"vx-num " + (r.buy == null ? "vx-dash" : "")}>
                {fmt(r.buy)}
              </div>
              <div className={"vx-num " + (r.sell == null ? "vx-dash" : "")}>
                {fmt(r.sell)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
