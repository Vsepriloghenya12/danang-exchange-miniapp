import React, { useEffect, useMemo, useState } from "react";
import { apiGetTodayRates } from "../lib/api";
import type { Currency, Rates, TodayRatesResponse } from "../lib/types";

type Pair = { id: string; base: Currency; quote: Currency };

const PAIRS: Pair[] = [
  { id: "rub-vnd", base: "RUB", quote: "VND" },
  { id: "usdt-vnd", base: "USDT", quote: "VND" },
  { id: "usd-vnd", base: "USD", quote: "VND" },

  { id: "eur-vnd", base: "EUR", quote: "VND" },
  { id: "thb-vnd", base: "THB", quote: "VND" },

  { id: "rub-usdt", base: "RUB", quote: "USDT" },
  { id: "rub-usd", base: "RUB", quote: "USD" },
  { id: "rub-eur", base: "RUB", quote: "EUR" },
  { id: "rub-thb", base: "RUB", quote: "THB" }, // ← было "rud-thb"

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

function fmtRate(quote: Currency, n: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  const max =
    quote === "VND" ? 0 : 6; // чтобы кросс-пары читались нормально
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: max }).format(n);
}

// 1 BASE -> сколько QUOTE (логика: BASE продаём → в VND по buy_vnd; VND → QUOTE по sell_vnd)
function pairRate(rates: any, base: Currency, quote: Currency): number | null {
  if (!rates) return null;
  if (base === quote) return 1;

  const baseToVnd =
    base === "VND" ? 1 : Number(rates?.[base]?.buy_vnd);
  if (!Number.isFinite(baseToVnd) || baseToVnd <= 0) return null;

  if (quote === "VND") return baseToVnd;

  const quoteSellVnd = Number(rates?.[quote]?.sell_vnd);
  if (!Number.isFinite(quoteSellVnd) || quoteSellVnd <= 0) return null;

  return baseToVnd / quoteSellVnd;
}

export default function RatesTab() {
  const [data, setData] = useState<TodayRatesResponse | null>(null);

  useEffect(() => {
    apiGetTodayRates().then(setData);
  }, []);

  const rates: Rates | null = (data as any)?.data?.rates ?? null;
  const updatedAt = data?.data?.updated_at ? fmtDaNang(new Date(data.data.updated_at)) : null;

  const rows = useMemo(() => {
    return PAIRS.map((p) => {
      const v = pairRate(rates as any, p.base, p.quote);
      return { ...p, value: v };
    });
  }, [rates]);

  return (
    <div className="vx-rates">
      <style>{`
        .vx-rates{ display:flex; flex-direction:column; gap:10px; }
        .vx-rHead{ display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
        .vx-rMeta{ font-size:12px; color: rgba(15,23,42,0.55); font-weight: 800; }

        .vx-rateList{ display:flex; flex-direction:column; gap:8px; }
        .vx-rateRow{
          border: 1px solid rgba(15,23,42,0.10);
          background: rgba(255,255,255,0.62);
          border-radius: 18px;
          padding: 10px 12px;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap: 10px;
        }
        .vx-code{ font-size: 14px; font-weight: 950; letter-spacing: -0.01em; color: #0f172a; }
        .vx-sub{ font-size: 11px; font-weight: 800; color: rgba(15,23,42,0.55); margin-top: 2px; }
        .vx-right{ display:flex; gap: 8px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
        .vx-pill{
          border-radius: 999px;
          border: 1px solid rgba(15,23,42,0.10);
          background: rgba(255,255,255,0.78);
          padding: 7px 10px;
          font-size: 11px;
          font-weight: 950;
          color: #0f172a;
          white-space: nowrap;
        }
      `}</style>

      <div className="vx-rHead">
        <div>
          <div className="h2" style={{ margin: 0 }}>Курс</div>
          <div className="vx-rMeta">Дата (Дананг): {data?.date ?? "—"}</div>
        </div>
        {updatedAt ? <div className="vx-rMeta">Обновлено: {updatedAt}</div> : null}
      </div>

      {!data ? (
        <div className="vx-rMeta">Загрузка…</div>
      ) : !rates ? (
        <div className="vx-rMeta">Курс ещё не задан владельцем.</div>
      ) : (
        <div className="vx-rateList">
          {rows.map((r) => (
            <div key={r.id} className="vx-rateRow">
              <div>
                <div className="vx-code">{r.base} → {r.quote}</div>
                <div className="vx-sub">1 {r.base} = {fmtRate(r.quote, r.value)} {r.quote}</div>
              </div>
              <div className="vx-right">
                <span className="vx-pill">{fmtRate(r.quote, r.value)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
