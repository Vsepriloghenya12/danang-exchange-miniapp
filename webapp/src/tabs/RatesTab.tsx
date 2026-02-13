import React, { useEffect, useMemo, useState } from "react";
import { apiGetTodayRates } from "../lib/api";
import type { TodayRatesResponse } from "../lib/types";

function fmtInt(n: number) {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
}

function fmtDaNang(d: Date) {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(d);
  } catch {
    return d.toLocaleString("ru-RU");
  }
}

export default function RatesTab(_props: any) {
  const [data, setData] = useState<TodayRatesResponse | null>(null);

  useEffect(() => {
    apiGetTodayRates().then(setData);
  }, []);

  const rows = useMemo(() => {
    if (!data?.data?.rates) return [] as Array<{ code: string; buy: number; sell: number }>;
    const r = data.data.rates;
    return [
      { code: "USD", buy: r.USD.buy_vnd, sell: r.USD.sell_vnd },
      { code: "RUB", buy: r.RUB.buy_vnd, sell: r.RUB.sell_vnd },
      { code: "USDT", buy: r.USDT.buy_vnd, sell: r.USDT.sell_vnd },
    ];
  }, [data]);

  const updatedAt = data?.data?.updated_at ? fmtDaNang(new Date(data.data.updated_at)) : null;

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
        .vx-pill b{ font-weight: 950; }
        .vx-upd{ margin-top: 2px; font-size: 12px; font-weight: 800; color: rgba(15,23,42,0.55); }
      `}</style>

      <div className="vx-rHead">
        <div>
          <div className="h2" style={{ margin: 0 }}>
            Актуальный курс
          </div>
          <div className="vx-rMeta">Дата: {data?.date ?? "—"}</div>
        </div>
        {updatedAt ? <div className="vx-rMeta">Обновлено: {updatedAt} (Дананг)</div> : null}
      </div>

      {!data ? (
        <div className="vx-rMeta">Загрузка…</div>
      ) : !data.data ? (
        <div className="vx-rMeta">Курс ещё не задан владельцем.</div>
      ) : (
        <div className="vx-rateList">
          {rows.map((r) => (
            <div key={r.code} className="vx-rateRow">
              <div>
                <div className="vx-code">{r.code} → VND</div>
                <div className="vx-sub">за 1 {r.code}</div>
              </div>
              <div className="vx-right">
                <span className="vx-pill">
                  BUY <b>{fmtInt(r.buy)}</b>
                </span>
                <span className="vx-pill">
                  SELL <b>{fmtInt(r.sell)}</b>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
