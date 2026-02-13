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
  return (Math.round(n * 100) / 100).toString();
}

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

// sell -> VND по buy_vnd (если sell != VND)
// VND -> buy по sell_vnd (если buy != VND)
function calcBuyAmount(rates: Rates, sellCurrency: Currency, buyCurrency: Currency, sellAmount: number): number {
  if (sellAmount <= 0) return 0;
  if (sellCurrency === buyCurrency) return sellAmount;

  let vnd: number;
  if (sellCurrency === "VND") vnd = sellAmount;
  else vnd = sellAmount * rates[sellCurrency].buy_vnd;

  if (buyCurrency === "VND") return vnd;
  return vnd / rates[buyCurrency].sell_vnd;
}

function calcSellAmount(rates: Rates, sellCurrency: Currency, buyCurrency: Currency, buyAmount: number): number {
  if (buyAmount <= 0) return 0;
  if (sellCurrency === buyCurrency) return buyAmount;

  const vndCost = buyCurrency === "VND" ? buyAmount : buyAmount * rates[buyCurrency].sell_vnd;
  if (sellCurrency === "VND") return vndCost;
  return vndCost / rates[sellCurrency].buy_vnd;
}

export default function CalculatorTab() {
  const tg = getTg();

  const [loading, setLoading] = useState(true);
  const [rates, setRates] = useState<Rates | null>(null);

  const [sellCurrency, setSellCurrency] = useState<Currency>("USD");
  const [buyCurrency, setBuyCurrency] = useState<Currency>("VND");

  const [sellText, setSellText] = useState("");
  const [buyText, setBuyText] = useState("");

  const lastEdited = useRef<"sell" | "buy">("sell");
  const [receiveMethod, setReceiveMethod] = useState<ReceiveMethod>("cash");

  useEffect(() => {
    const allowed = allowedReceiveMethods(buyCurrency);
    if (!allowed.includes(receiveMethod)) setReceiveMethod(allowed[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyCurrency]);

  useEffect(() => {
    tg?.ready?.();
    tg?.expand?.();

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sellAmount = useMemo(() => parseNum(sellText), [sellText]);
  const buyAmount = useMemo(() => parseNum(buyText), [buyText]);

  useEffect(() => {
    if (!rates) return;

    if (lastEdited.current === "sell") {
      const out = calcBuyAmount(rates, sellCurrency, buyCurrency, sellAmount);
      const next = sellText ? formatAmount(buyCurrency, out) : "";
      if (next !== buyText) setBuyText(next);
    } else {
      const need = calcSellAmount(rates, sellCurrency, buyCurrency, buyAmount);
      const next = buyText ? formatAmount(sellCurrency, need) : "";
      if (next !== sellText) setSellText(next);
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
    const a = sellText;
    const b = buyText;
    setSellText(b);
    setBuyText(a);
  }

  async function sendRequest() {
    if (!canSend || !rates) return;

    const tg2 = getTg();
    const initData = tg2?.initData || "";
    if (!initData) {
      tg2?.showAlert?.("Нет initData. Открой мини-приложение через /start в Telegram.");
      return;
    }

    const payload = {
      sellCurrency,
      buyCurrency,
      sellAmount: parseNum(sellText),
      buyAmount: parseNum(buyText),
      receiveMethod
    };

    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `tma ${initData}`
        },
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      if (!json?.ok) {
        tg2?.HapticFeedback?.notificationOccurred?.("error");
        tg2?.showAlert?.(`Ошибка: ${json?.error || "fail"}`);
        return;
      }

      tg2?.HapticFeedback?.notificationOccurred?.("success");
      tg2?.showPopup?.({
        title: "Отправлено",
        message: "Заявка отправлена в группу ✅",
        buttons: [{ type: "ok" }]
      });
    } catch (e: any) {
      tg2?.HapticFeedback?.notificationOccurred?.("error");
      tg2?.showAlert?.(`Ошибка сети: ${e?.message || e}`);
    }
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
            style={{ padding: "10px 12px", borderRadius: 10, cursor: "pointer" }}
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
