import React, { useEffect, useState } from "react";
import { apiGetTodayRates } from "../lib/api";
import type { TodayRatesResponse } from "../lib/types";

export default function RatesTab() {
  const [data, setData] = useState<TodayRatesResponse | null>(null);

  useEffect(() => {
    apiGetTodayRates().then(setData);
  }, []);

  return (
    <div className="card">
      <div className="h1">Курс на сегодня</div>
      {!data ? (
        <div>Загрузка...</div>
      ) : !data.data ? (
        <div>Курс ещё не задан владельцем.</div>
      ) : (
        <>
          <div className="small">Дата: {data.date}</div>
          <div className="hr" />
          <div>USD: BUY {data.data.rates.USD.buy_vnd} • SELL {data.data.rates.USD.sell_vnd}</div>
          <div>RUB: BUY {data.data.rates.RUB.buy_vnd} • SELL {data.data.rates.RUB.sell_vnd}</div>
          <div>USDT: BUY {data.data.rates.USDT.buy_vnd} • SELL {data.data.rates.USDT.sell_vnd}</div>
          <div className="small" style={{ marginTop: 8 }}>
            Обновлено: {new Date(data.data.updated_at).toLocaleString("ru-RU")}
          </div>
        </>
      )}
    </div>
  );
}
