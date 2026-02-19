import React, { useEffect, useMemo, useState } from "react";
import { apiGetTodayRates } from "../lib/api";
import type { TodayRatesResponse } from "../lib/types";

type Cur = "RUB" | "USD" | "USDT" | "EUR" | "THB" | "VND";
type Pair = { id: string; base: Cur; quote: Cur };

// Порядок как был, но КРОСС-ПАРЫ перевёрнуты (валюты поменяны местами)
const PAIRS: Pair[] = [
  { id: "rub-vnd", base: "RUB", quote: "VND" },
  { id: "usdt-vnd", base: "USDT", quote: "VND" },
  { id: "usd-vnd", base: "USD", quote: "VND" },

  { id: "eur-vnd", base: "EUR", quote: "VND" },
  { id: "thb-vnd", base: "THB", quote: "VND" },

  // было: rub-usdt, rub-usd, rub-eur, rub-thb
  // стало:
  { id: "usdt-rub", base: "USDT", quote: "RUB" },
  { id: "usd-rub", base: "USD", quote: "RUB" },
  { id: "eur-rub", base: "EUR", quote: "RUB" },
  { id: "thb-rub", base: "THB", quote: "RUB" },

  // было: usd-usdt, eur-usd, eur-usdt
  // стало:
  { id: "usdt-usd", base: "USDT", quote: "USD" },
  { id: "usd-eur", base: "USD", quote: "EUR" },
  { id: "usdt-eur", base: "USDT", quote: "EUR" },

  // было: thb-usd, thb-usdt, thb-eur
  // стало:
  { id: "usd-thb", base: "USD", quote: "THB" },
  { id: "usdt-thb", base: "USDT", quote: "THB" },
  { id: "eur-thb", base: "EUR", quote: "THB" }
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

// ✅ 2 знака после запятой для всех НЕ-VND
function fmt(quote: Cur, n: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";

  const digits = quote === "VND" ? 0 : 2;

  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(n);
}

function calcBuySell(rates: any, base: Cur, quote: Cur): { buy: number | null; sell: number | null } {
  if (!rates) return { buy: null, sell: null };
  if (base === quote) return { buy: 1, sell: 1 };

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

  // BUY: сколько quote за 1 base (по выгодному для клиента направлению)
  const buy = baseBuy / quoteSell;
  // SELL: сколько quote за 1 base (обратная сторона спреда)
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
  const updatedAt = (data as any)?.data?.updated_at ? fmtDaNang(new Date((data as any).data.updated_at)) : null;

  const rows = useMemo(() => {
    return PAIRS.map((p) => {
      const { buy, sell } = calcBuySell(rates, p.base, p.quote);
      return { ...p, buy, sell };
    });
  }, [rates]);

  return (
    <div className="vx-rates2">
      <div className="vx-head">
        <div>
          <div className="h2 vx-m0">Курс</div>
          <div className="vx-meta">Дата (Дананг): {data?.date ?? "—"}</div>
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
                <div className="vx-pair">
                  {r.base} → {r.quote}
                </div>
                <div className="vx-sub">за 1 {r.base}</div>
              </div>

              <div className={"vx-num " + (r.buy == null ? "vx-dash" : "")}>{fmt(r.quote, r.buy)}</div>
              <div className={"vx-num " + (r.sell == null ? "vx-dash" : "")}>{fmt(r.quote, r.sell)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
