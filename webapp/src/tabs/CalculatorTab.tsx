import React, { useEffect, useMemo, useRef, useState } from "react";

type Currency = "RUB" | "USD" | "USDT" | "VND";
type ReceiveMethod = "cash" | "transfer" | "atm";

type Rates = {
  USD: { buy_vnd: number; sell_vnd: number };
  RUB: { buy_vnd: number; sell_vnd: number };
  USDT: { buy_vnd: number; sell_vnd: number };
};

function getTg() {
  return (window as any).Telegram?.WebApp;
}

function parseNum(input: string): number {
  const s = (input || "").replace(",", ".").replace(/[^\d.]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function formatAmount(cur: Currency, n: number) {
  if (!Number.isFinite(n)) return "";
  if (cur === "VND") return Math.round(n).toString();
  // USD/USDT/RUB — 2 знака достаточно
  return (Math.round(n * 100) / 100).toString();
}

// Методы получения итоговой валюты (buyCurrency)
function allowedReceiveMethods(buyCurrency: Currency): ReceiveMethod[] {
  if (buyCurrency === "USD") return ["cash"];
  if (buyCurrency === "RUB") return ["transfer"];
  if (buyCurrency === "USDT") return ["transfer"];
  return ["cash", "transfer", "atm"]; // VND
}

function methodLabel(m: ReceiveMethod) {
  if (m === "cash") return "Наличные";
  if (m === "transfer") return "Перевод";
  return "Банкомат";
}

// Конвертация по правилам:
// sell -> VND по buy_vnd (если sell != VND)
// VND -> buy по sell_vnd (если buy != VND)
function calcBuyAmount(
  rates: Rates,
  sellCurrency: Currency,
  buyCurrency: Currency,
  sellAmount: number
): number {
  if (sellAmount <= 0) return 0;
  if (sellCurrency === buyCurrency) return sellAmount;

  // to VND
  let vnd: number;
  if (sellCurrency === "VND") vnd = sellAmount;
  else vnd = sellAmount * rates[sellCurrency].buy_vnd;

  // to buy
  if (buyCurrency === "VND") return vnd;
  return vnd / rates[buyCurrency].sell_vnd;
}

function calcSellAmount(
  rates: Rates,
  sellCurrency: Currency,
  buyCurrency: Currency,
  buyAmount: number
): number {
  if (buyAmount <= 0) return 0;
  if (sellCurrency === buyCurrency) return buyAmount;

  // buyAmount -> VND cost (если buy != VND)
  const vndCost = buyCurrency === "VND" ? buyAmount : buyAmount * rates[buyCurrency].sell_vnd;

  // VND -> sell needed
  if (sellCurrency === "VND") return vndCost;
  return vndCost / rates[sellCurrency].buy_vnd;
}

export default function CalculatorTab() {
  const tg = getTg();

  const [loading, setLoading] = useState(true);
  const [rates, setRates] = useState<Rates | null>(null);

  const [sellCurrency, setSellCurrency] = useState<Currency>("USD");
  const [buyCurrency, setBuyCurrency] = useState<Currency>("VND");

  const [sellText, setSellText] = useState<string>("");
  const [buyText, setBuyText] = useState<string>("");

  // кто последний редактировал
  const lastEdited = useRef<"sell" | "buy">("sell");

  const [receiveMethod, setReceiveMethod] = useState<ReceiveMethod>("cash");

  // при смене buyCurrency — подгоняем метод под допустимые
  useEffect(() => {
    const allowed = allowedReceiveMethods(buyCurrency);
    if (!allowed.includes(receiveMethod)) setReceiveMethod(allowed[0]);
  }, [buyCurrency]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    tg?.expand?.();

    // грузим курс дня
    (async () => {
      try {
        const res = await fetch("/api/rates/today");
        const json = await res.json();
        const r: Rates | null = json?.data?.rates ?? null;
        setRates(r);
      } catch {
        setRates(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const sellAmount = useMemo(() => parseNum(sellText), [sellText]);
  const buyAmount = useMemo(() => parseNum(buyText), [buyText]);

  // пересчёт при вводе
  useEffect(() => {
    if (!rates) return;

    if (lastEdited.current === "sell") {
      const out = calcBuyAmount(rates, sellCurrency, buyCurrency, sellAmount);
      setBuyText(sellText ? formatAmount(buyCurrency, out) : "");
    } else {
      const need = calcSellAmount(rates, sellCurrency, buyCurrency, buyAmount);
      setSellText(buyText ? formatAmount(sellCurrency, need) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellText, buyText, sellCurrency, buyCurrency, rates]);

  const canSend =
    !!rates &&
    sellCurrency !== buyCurrency &&
    parseNum(sellText) > 0 &&
    parseNum(buyText) > 0 &&
    !!receiveMethod;

  function swapCurrencies() {
    setSellCurrency(buyCurrency);
    setBuyCurrency(sellCurrency);
    // меняем поля местами
    const a = sellText;
    const b = buyText;
    setSellText(b);
    setBuyText(a);
  }

  function sendRequest() {
    if (!canSend || !rates) return;

    const payload = {
      sellCurrency,
      buyCurrency,
      sellAmount: parseNum(sellText),
      buyAmount: parseNum(buyText),
      receiveMethod
      // note удалили полностью
    };

    try {
      tg?.sendData?.(JSON.stringify(payload));
      tg?.HapticFeedback?.notificationOccurred?.("success");
    } catch {}
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 12 }}>
      <div style={{ fontSize: 16, fontWeight: 700 }}>Калькулятор</div>

      {loading && <div>Загрузка курсов…</div>}
      {!loading && !rates && (
        <div style={{ opacity: 0.85 }}>
          Курсы не загружены. Проверь, что владелец задал курс на сегодня.
        </div>
      )}

      {/* Выбор валют + ввод в обе стороны */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 10,
          background: "rgba(255,255,255,0.06)",
          borderRadius: 12,
          padding: 12
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            value={sellCurrency}
            onChange={(e) => setSellCurrency(e.target.value as Currency)}
            style={{ padding: 10, borderRadius: 10, flex: 1 }}
          >
            <option value="RUB">RUB</option>
            <option value="USD">USD</option>
            <option value="USDT">USDT</option>
            <option value="VND">VND</option>
          </select>

          <input
            inputMode="decimal"
            placeholder="Сумма"
            value={sellText}
            onChange={(e) => {
              lastEdited.current = "sell";
              setSellText(e.target.value);
            }}
            style={{ padding: 10, borderRadius: 10, flex: 2 }}
          />

          <button
            onClick={swapCurrencies}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              cursor: "pointer"
            }}
            title="Поменять местами"
          >
            ⇄
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            value={buyCurrency}
            onChange={(e) => setBuyCurrency(e.target.value as Currency)}
            style={{ padding: 10, borderRadius: 10, flex: 1 }}
          >
            <option value="RUB">RUB</option>
            <option value="USD">USD</option>
            <option value="USDT">USDT</option>
            <option value="VND">VND</option>
          </select>

          <input
            inputMode="decimal"
            placeholder="Сумма"
            value={buyText}
            onChange={(e) => {
              lastEdited.current = "buy";
              setBuyText(e.target.value);
            }}
            style={{ padding: 10, borderRadius: 10, flex: 2 }}
          />
        </div>

        {/* Метод получения (по buyCurrency) */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {allowedReceiveMethods(buyCurrency).map((m) => (
            <button
              key={m}
              onClick={() => setReceiveMethod(m)}
              style={{
                padding: "10px 12px",
                borderRadius: 999,
                cursor: "pointer",
                border: "1px solid rgba(255,255,255,0.18)",
                background: receiveMethod === m ? "rgba(255,255,255,0.16)" : "transparent"
              }}
            >
              {methodLabel(m)}
            </button>
          ))}
        </div>

        <button
          onClick={sendRequest}
          disabled={!canSend}
          style={{
            padding: 12,
            borderRadius: 12,
            cursor: canSend ? "pointer" : "not-allowed",
            opacity: canSend ? 1 : 0.5
          }}
        >
          Отправить заявку
        </button>

        <div style={{ fontSize: 12, opacity: 0.8 }}>
          Вводи сумму в любом поле — второе пересчитается автоматически.
        </div>
      </div>
    </div>
  );
}
