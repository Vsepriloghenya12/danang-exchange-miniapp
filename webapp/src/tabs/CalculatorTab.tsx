import React, { useEffect, useMemo, useState } from "react";
import type { Currency, ReceiveMethod, Rates } from "../lib/types";
import { apiGetTodayRates } from "../lib/api";
import {
  convertDesiredBuyAmountToSellAmount,
  convertSellAmountToBuyAmount,
  formatAmount,
  payMethodByCurrency,
  receiveMethodsByCurrency
} from "../lib/calc";
import { getTg } from "../lib/telegram";

const CURRENCIES: Currency[] = ["RUB", "USD", "USDT", "VND"];

function methodLabel(m: ReceiveMethod) {
  if (m === "cash") return "Наличка";
  if (m === "transfer") return "Перевод";
  return "Банкомат";
}

export default function CalculatorTab({ me }: any) {
  const tg = getTg();
  const [rates, setRates] = useState<Rates | null>(null);

  const [sellCurrency, setSellCurrency] = useState<Currency>("USD");
  const [buyCurrency, setBuyCurrency] = useState<Currency>("VND");

  const [mode, setMode] = useState<"sell" | "buy">("sell");
  const [sellAmount, setSellAmount] = useState<string>("100");
  const [desiredBuyAmount, setDesiredBuyAmount] = useState<string>("");

  const allowedReceive = useMemo(() => receiveMethodsByCurrency(buyCurrency), [buyCurrency]);
  const [receiveMethod, setReceiveMethod] = useState<ReceiveMethod>("cash");
  const [note, setNote] = useState("");

  useEffect(() => {
    apiGetTodayRates().then((r) => {
      if (r?.data?.rates) setRates(r.data.rates);
    });
  }, []);

  useEffect(() => {
    if (!allowedReceive.includes(receiveMethod as any)) {
      setReceiveMethod(allowedReceive[0] as ReceiveMethod);
    }
  }, [allowedReceive, receiveMethod]);

  const calc = useMemo(() => {
    if (!rates) return null;

    const s = Number(sellAmount.replace(",", "."));
    const b = Number(desiredBuyAmount.replace(",", "."));

    if (mode === "sell") {
      if (!Number.isFinite(s) || s <= 0) return null;
      const out = convertSellAmountToBuyAmount({ sellCurrency, buyCurrency, sellAmount: s, rates });
      return { sellAmount: s, buyAmount: out.buyAmount };
    } else {
      if (!Number.isFinite(b) || b <= 0) return null;
      const out = convertDesiredBuyAmountToSellAmount({ sellCurrency, buyCurrency, desiredBuyAmount: b, rates });
      return { sellAmount: out.sellAmount, buyAmount: b };
    }
  }, [rates, mode, sellAmount, desiredBuyAmount, sellCurrency, buyCurrency]);

  const canSend = !!me.ok && !!tg && !!calc;

  const send = () => {
    if (!tg || !calc) return;

    const payload = {
      sellCurrency,
      buyCurrency,
      sellAmount: calc.sellAmount,
      buyAmount: calc.buyAmount,
      receiveMethod,
    };

    tg.sendData(JSON.stringify(payload));
  };

  return (
    <div className="card">
      <div className="h1">Калькулятор</div>

      {!rates ? (
        <div>Курс не задан — владелец должен обновить курс на сегодня.</div>
      ) : (
        <>
          <div className="row">
            <label style={{ flex: 1 }}>
              <div className="small">Продаю</div>
              <select className="input" value={sellCurrency} onChange={(e) => setSellCurrency(e.target.value as Currency)}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <div className="small" style={{ marginTop: 6 }}>
                Оплата: {methodLabel(payMethodByCurrency(sellCurrency) as any)}
              </div>
            </label>

            <label style={{ flex: 1 }}>
              <div className="small">Покупаю</div>
              <select className="input" value={buyCurrency} onChange={(e) => setBuyCurrency(e.target.value as Currency)}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="hr" />

          <div className="row">
            <div className={`tab ${mode === "sell" ? "active" : ""}`} onClick={() => setMode("sell")}>
              Я продаю сумму
            </div>
            <div className={`tab ${mode === "buy" ? "active" : ""}`} onClick={() => setMode("buy")}>
              Я хочу получить сумму
            </div>
          </div>

          {mode === "sell" ? (
            <label style={{ display: "block", marginTop: 10 }}>
              <div className="small">Сколько продаёте ({sellCurrency})</div>
              <input className="input" value={sellAmount} onChange={(e) => setSellAmount(e.target.value)} />
            </label>
          ) : (
            <label style={{ display: "block", marginTop: 10 }}>
              <div className="small">Сколько хотите получить ({buyCurrency})</div>
              <input className="input" value={desiredBuyAmount} onChange={(e) => setDesiredBuyAmount(e.target.value)} />
            </label>
          )}

          <label style={{ display: "block", marginTop: 10 }}>
            <div className="small">Как хотите получить {buyCurrency}</div>
            <select className="input" value={receiveMethod} onChange={(e) => setReceiveMethod(e.target.value as ReceiveMethod)}>
              {allowedReceive.map((m) => (
                <option key={m} value={m}>
                  {methodLabel(m)}
                </option>
              ))}
            </select>
          </label>

          <div className="hr" />

          <div>
            <div className="small">Итог</div>
            {calc ? (
              <>
                <div>
                  Продаёте: <b>{formatAmount(sellCurrency, calc.sellAmount)} {sellCurrency}</b>
                </div>
                <div>
                  Получаете: <b>{formatAmount(buyCurrency, calc.buyAmount)} {buyCurrency}</b>
                </div>
              </>
            ) : (
              <div>Введите сумму для расчёта.</div>
            )}
          </div>

          <div style={{ marginTop: 12 }}>
            <button className="btn" disabled={!canSend} onClick={send}>
              Отправить заявку в группу
            </button>
            {!tg && <div className="small" style={{ marginTop: 8 }}>Откройте мини-приложение из Telegram.</div>}
          </div>
        </>
      )}
    </div>
  );
}
