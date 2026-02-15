import React, { useEffect, useMemo, useRef, useState } from "react";

type Currency = "RUB" | "USD" | "USDT" | "VND";
type ReceiveMethod = "cash" | "transfer" | "atm";
type ClientStatus = "standard" | "silver" | "gold";

type Rates = {
  USD: { buy_vnd: number; sell_vnd: number };
  RUB: { buy_vnd: number; sell_vnd: number };
  USDT: { buy_vnd: number; sell_vnd: number };
};

type RateKey = Exclude<Currency, "VND">;
function isRateKey(c: Currency): c is RateKey {
  return c !== "VND";
}

function getTg() {
  return (window as any).Telegram?.WebApp;
}

function parseNum(input: string): number {
  const s = (input || "")
    .replace(/\s+/g, "")
    .replace(",", ".")
    .replace(/[^\d.]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function formatAmount(cur: Currency, n: number) {
  if (!Number.isFinite(n)) return "";
  if (cur === "VND") return Math.round(n).toString();
  return (Math.round(n * 100) / 100).toString();
}

function allowedReceiveMethods(buyCurrency: Currency): ReceiveMethod[] {
  // Это правила UI по твоей логике
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

function normalizeStatus(s: any): ClientStatus {
  const v = String(s ?? "").toLowerCase().trim();
  if (["gold", "голд", "золото"].includes(v)) return "gold";
  if (["silver", "силвер", "сильвер", "серебро"].includes(v)) return "silver";
  return "standard"; // bronze/none/unknown -> standard
}

function statusLabel(s: ClientStatus) {
  if (s === "gold") return "Голд";
  if (s === "silver") return "Сильвер";
  return "Стандарт";
}

/**
 * Надбавка за способ получения:
 * - актуально ТОЛЬКО когда получаем VND
 * - перевод/банкомат: RUB +1, USD/USDT +100
 */
function methodBonusForRate(sellCurrency: Currency, buyCurrency: Currency, receiveMethod: ReceiveMethod): number {
  if (buyCurrency !== "VND") return 0;
  if (receiveMethod !== "transfer" && receiveMethod !== "atm") return 0;

  if (sellCurrency === "RUB") return 1;
  if (sellCurrency === "USD" || sellCurrency === "USDT") return 100;

  return 0;
}

/**
 * Надбавка по статусу/сумме:
 * - RUB: +1..+5 (по таблице ₽)
 * - USD/USDT: +100..+300 (по таблице $)
 */
function tierBonusForRate(sellCurrency: Currency, sellAmount: number, status: ClientStatus): number {
  if (sellAmount <= 0) return 0;

  // ₽ таблица
  if (sellCurrency === "RUB") {
    const a = sellAmount;

    // <50k
    if (a < 50_000) {
      if (status === "silver") return 1;
      if (status === "gold") return 2;
      return 0;
    }
    // 50-100k
    if (a < 100_000) {
      if (status === "standard") return 1;
      if (status === "silver") return 2;
      return 3;
    }
    // 100-200k
    if (a < 200_000) {
      if (status === "standard") return 2;
      if (status === "silver") return 3;
      return 4;
    }
    // 200k+
    if (status === "standard") return 3;
    if (status === "silver") return 4;
    return 5;
  }

  // $ таблица (USD/USDT)
  if (sellCurrency === "USD" || sellCurrency === "USDT") {
    const a = sellAmount;

    // <1000
    if (a < 1000) {
      if (status === "silver") return 100;
      if (status === "gold") return 100;
      return 0;
    }
    // 1000-3000
    if (a < 3000) {
      if (status === "standard") return 100;
      if (status === "silver") return 150;
      return 200;
    }
    // 3000+
    if (status === "standard") return 150;
    if (status === "silver") return 200;
    return 300;
  }

  return 0;
}

function applyRateBonuses(
  baseRates: Rates,
  sellCurrency: Currency,
  buyCurrency: Currency,
  sellAmountForTier: number,
  status: ClientStatus,
  receiveMethod: ReceiveMethod
): Rates {
  const next: Rates = {
    USD: { ...baseRates.USD },
    RUB: { ...baseRates.RUB },
    USDT: { ...baseRates.USDT },
  };

  // Бонусы применяем только когда клиент ОТДАЁТ (RUB/USD/USDT) и ПОЛУЧАЕТ VND
  if (buyCurrency === "VND" && isRateKey(sellCurrency)) {
    const tier = tierBonusForRate(sellCurrency, sellAmountForTier, status);
    const method = methodBonusForRate(sellCurrency, buyCurrency, receiveMethod);
    next[sellCurrency].buy_vnd = baseRates[sellCurrency].buy_vnd + tier + method;
  }

  return next;
}

// sell -> VND по buy_vnd (если sell != VND)
// VND -> buy по sell_vnd (если buy != VND)
function calcBuyAmount(rates: Rates, sellCurrency: Currency, buyCurrency: Currency, sellAmount: number): number {
  if (sellAmount <= 0) return 0;
  if (sellCurrency === buyCurrency) return sellAmount;

  let vnd: number;
  if (sellCurrency === "VND") vnd = sellAmount;
  else vnd = sellAmount * rates[sellCurrency as RateKey].buy_vnd;

  if (buyCurrency === "VND") return vnd;
  return vnd / rates[buyCurrency as RateKey].sell_vnd;
}

function calcSellAmount(rates: Rates, sellCurrency: Currency, buyCurrency: Currency, buyAmount: number): number {
  if (buyAmount <= 0) return 0;
  if (sellCurrency === buyCurrency) return buyAmount;

  const vndCost = buyCurrency === "VND" ? buyAmount : buyAmount * rates[buyCurrency as RateKey].sell_vnd;
  if (sellCurrency === "VND") return vndCost;
  return vndCost / rates[sellCurrency as RateKey].buy_vnd;
}

export default function CalculatorTab(_props: any) {
  const tg = getTg();

  const [loading, setLoading] = useState(true);
  const [rates, setRates] = useState<Rates | null>(null);

  const [sellCurrency, setSellCurrency] = useState<Currency>("USD");
  const [buyCurrency, setBuyCurrency] = useState<Currency>("VND");

  const [sellText, setSellText] = useState("");
  const [buyText, setBuyText] = useState("");

  const lastEdited = useRef<"sell" | "buy">("sell");
  const [receiveMethod, setReceiveMethod] = useState<ReceiveMethod>("cash");

  const [clientStatus, setClientStatus] = useState<ClientStatus>(normalizeStatus(_props?.user?.status));

  // адаптируем метод под выбранную валюту получения
  useEffect(() => {
    const allowed = allowedReceiveMethods(buyCurrency);
    if (!allowed.includes(receiveMethod)) setReceiveMethod(allowed[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyCurrency]);

  // загрузка курсов
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

  // подтянуть статус с бэка (если есть /api/me)
  useEffect(() => {
    const tg2 = getTg();
    const initData = tg2?.initData || "";
    if (!initData) return;

    (async () => {
      try {
        const res = await fetch("/api/me", {
          headers: { Authorization: `tma ${initData}` },
        });
        const json = await res.json();
        const raw =
          json?.data?.status ??
          json?.status ??
          json?.data?.user?.status ??
          json?.user?.status;

        if (raw) setClientStatus(normalizeStatus(raw));
      } catch {
        // если /api/me нет — игнор
      }
    })();
  }, []);

  const sellAmount = useMemo(() => parseNum(sellText), [sellText]);
  const buyAmount = useMemo(() => parseNum(buyText), [buyText]);

  // пересчет
  useEffect(() => {
    if (!rates) return;

    if (lastEdited.current === "sell") {
      const effectiveRates = applyRateBonuses(rates, sellCurrency, buyCurrency, sellAmount, clientStatus, receiveMethod);
      const out = calcBuyAmount(effectiveRates, sellCurrency, buyCurrency, sellAmount);
      const next = sellText ? formatAmount(buyCurrency, out) : "";
      if (next !== buyText) setBuyText(next);
    } else {
      // если вводят "получу" — надбавка зависит от того, сколько получится "отдать"
      let guess = calcSellAmount(rates, sellCurrency, buyCurrency, buyAmount);

      for (let i = 0; i < 3; i++) {
        const effectiveRates = applyRateBonuses(rates, sellCurrency, buyCurrency, guess, clientStatus, receiveMethod);
        const nextGuess = calcSellAmount(effectiveRates, sellCurrency, buyCurrency, buyAmount);
        if (Math.abs(nextGuess - guess) < 1e-7) {
          guess = nextGuess;
          break;
        }
        guess = nextGuess;
      }

      const next = buyText ? formatAmount(sellCurrency, guess) : "";
      if (next !== sellText) setSellText(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellText, buyText, sellCurrency, buyCurrency, rates, receiveMethod, clientStatus]);

  // вывод курса с надбавками (для прозрачности)
  const rateInfo = useMemo(() => {
    if (!rates) return null;
    if (buyCurrency !== "VND") return null;
    if (!(sellCurrency === "RUB" || sellCurrency === "USD" || sellCurrency === "USDT")) return null;

    const amt = parseNum(sellText);
    const base = rates[sellCurrency].buy_vnd;
    const tier = tierBonusForRate(sellCurrency, amt, clientStatus);
    const m = methodBonusForRate(sellCurrency, buyCurrency, receiveMethod);
    return { base, tier, m, eff: base + tier + m };
  }, [rates, sellCurrency, buyCurrency, sellText, clientStatus, receiveMethod]);

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
      tg2?.showAlert?.("Нет initData. Открой мини-приложение через Telegram (/start).");
      return;
    }

    const payload = {
      sellCurrency,
      buyCurrency,
      sellAmount: parseNum(sellText),
      buyAmount: parseNum(buyText),
      receiveMethod,
    };

    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `tma ${initData}`,
        },
        body: JSON.stringify(payload),
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
        message: "Заявка отправлена ✅",
        buttons: [{ type: "ok" }],
      });
    } catch (e: any) {
      tg2?.HapticFeedback?.notificationOccurred?.("error");
      tg2?.showAlert?.(`Ошибка сети: ${e?.message || e}`);
    }
  }

  return (
    <div className="vx-calc">
      <style>{`
        .vx-calc{ display:flex; flex-direction:column; gap:12px; }
        .vx-calcTitle{ display:flex; align-items:baseline; justify-content:space-between; gap:10px; }
        .vx-muted{ font-size:12px; color: rgba(15,23,42,0.55); font-weight:800; }

        .vx-calcBox{
          border: 1px solid rgba(15,23,42,0.10);
          background: rgba(255,255,255,0.62);
          border-radius: 22px;
          padding: 12px;
          overflow: hidden;
        }

        .vx-exRow{ display:grid; grid-template-columns: 92px 1fr 48px; gap:10px; align-items:center; }
        @media (max-width: 360px){ .vx-exRow{ grid-template-columns: 84px 1fr 44px; } }

        .vx-iconBtn{
          height:48px;
          width:48px;
          display:grid;
          place-items:center;
          border-radius: 18px;
          border: 1px solid rgba(15,23,42,0.16);
          background: rgba(255,255,255,0.92);
          box-shadow: 0 6px 16px rgba(2,6,23,0.06);
          cursor:pointer;
          font-weight: 900;
          color: #0f172a;
          user-select:none;
        }
        .vx-iconBtnGhost{ opacity:0; pointer-events:none; }

        .vx-calcBox *{ box-sizing:border-box; }
        .vx-exRow > *{ min-width: 0; }
        .vx-exRow select, .vx-exRow input{
          width: 100%;
          max-width: 100%;
          height: 48px;
          border-radius: 18px;
          border: 1px solid rgba(15,23,42,0.12);
          background: rgba(255,255,255,0.92);
          padding: 0 14px;
          font-size: 14px;
          font-weight: 900;
          color: #0f172a;
          outline: none;
        }
        .vx-exRow input::placeholder{ color: rgba(15,23,42,0.45); font-weight: 800; }

        .vx-methods{ display:flex; gap:8px; flex-wrap:wrap; }
        .vx-pill{
          border-radius: 999px;
          border: 1px solid rgba(15,23,42,0.12);
          background: rgba(255,255,255,0.70);
          padding: 10px 12px;
          font-size: 12px;
          font-weight: 900;
          color: #0f172a;
          cursor:pointer;
          user-select:none;
        }
        .vx-pillActive{
          border-color: rgba(15,23,42,0.10);
          background: linear-gradient(135deg, rgba(34,197,94,0.22), rgba(6,182,212,0.18));
        }

        .vx-rateLine{
          margin-top: 10px;
          font-size: 12px;
          font-weight: 900;
          color: rgba(15,23,42,0.72);
        }
        .vx-rateLine b{ color: rgba(15,23,42,0.92); }

        .vx-primary{
          height: 52px;
          border-radius: 18px;
          border: 0;
          width: 100%;
          cursor: pointer;
          font-weight: 950;
          letter-spacing: -0.01em;
          color: white;
          background: linear-gradient(135deg, #22c55e, #06b6d4);
          box-shadow: 0 18px 40px rgba(34,197,94,0.22);
        }
        .vx-primary:disabled{ opacity: 0.55; cursor: not-allowed; }

        .vx-help{ font-size: 12px; color: rgba(15,23,42,0.60); font-weight: 700; line-height: 1.35; }
      `}</style>

      <div className="vx-calcTitle">
        <div style={{ fontSize: 18, fontWeight: 950 }}>Калькулятор</div>
        <div className="vx-muted">Статус: {statusLabel(clientStatus)}</div>
      </div>

      {loading && <div className="vx-help">Загрузка курсов…</div>}
      {!loading && !rates && (
        <div className="vx-help">Курсы не загружены. Проверь, что владелец задал курс на сегодня.</div>
      )}

      <div className="vx-calcBox">
        <div className="vx-exRow">
          <select value={sellCurrency} onChange={(e) => setSellCurrency(e.target.value as Currency)}>
            <option value="RUB">RUB</option>
            <option value="USD">USD</option>
            <option value="USDT">USDT</option>
            <option value="VND">VND</option>
          </select>

          <input
            inputMode="decimal"
            placeholder="Отдаю"
            value={sellText}
            onChange={(e) => {
              lastEdited.current = "sell";
              setSellText(e.target.value);
            }}
          />

          <button type="button" onClick={swapCurrencies} className="vx-iconBtn" title="Поменять местами">
            ⇄
          </button>
        </div>

        <div style={{ height: 10 }} />

        <div className="vx-exRow">
          <select value={buyCurrency} onChange={(e) => setBuyCurrency(e.target.value as Currency)}>
            <option value="RUB">RUB</option>
            <option value="USD">USD</option>
            <option value="USDT">USDT</option>
            <option value="VND">VND</option>
          </select>

          <input
            inputMode="decimal"
            placeholder="Получаю"
            value={buyText}
            onChange={(e) => {
              lastEdited.current = "buy";
              setBuyText(e.target.value);
            }}
          />

          <div className="vx-iconBtn vx-iconBtnGhost" aria-hidden="true">
            ⇄
          </div>
        </div>

        <div style={{ height: 12 }} />

        <div className="vx-methods">
          {allowedReceiveMethods(buyCurrency).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setReceiveMethod(m)}
              className={"vx-pill " + (receiveMethod === m ? "vx-pillActive" : "")}
            >
              {methodLabel(m)}
            </button>
          ))}
        </div>

        {rateInfo && (
          <div className="vx-rateLine">
            Курс: <b>{rateInfo.base}</b>
            {rateInfo.m ? (
              <>
                {" "}
                + <b>{rateInfo.m}</b>
              </>
            ) : null}
            {rateInfo.tier ? (
              <>
                {" "}
                + <b>{rateInfo.tier}</b>
              </>
            ) : null}
            {" = "}
            <b>{rateInfo.eff}</b>
          </div>
        )}

        <div style={{ height: 12 }} />

        <button type="button" onClick={sendRequest} disabled={!canSend} className="vx-primary">
          Оформить заявку
        </button>

        <div style={{ height: 10 }} />
        <div className="vx-help">Вводи сумму в любом поле — второе пересчитается автоматически.</div>
      </div>
    </div>
  );
}
