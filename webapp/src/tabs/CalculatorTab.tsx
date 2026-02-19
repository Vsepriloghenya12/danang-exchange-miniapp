import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiGetMarketRates } from "../lib/api";
import type { MarketRatesResponse } from "../lib/types";

type Currency = "RUB" | "USDT" | "USD" | "EUR" | "THB" | "VND";
type ReceiveMethod = "cash" | "transfer" | "atm";
type PayMethod = "cash" | "transfer";
type ClientStatus = "standard" | "silver" | "gold";

type RateKey = Exclude<Currency, "VND">;
type RateEntry = { buy_vnd: number; sell_vnd: number };
type Rates = Partial<Record<RateKey, RateEntry>>;

const CURRENCY_OPTIONS: Currency[] = ["RUB", "USDT", "USD", "EUR", "THB", "VND"];
const ALL_RECEIVE_METHODS: ReceiveMethod[] = ["cash", "transfer", "atm"];
const ALL_PAY_METHODS: PayMethod[] = ["cash", "transfer"];

// Формулы с картинки (на эти пары НЕ действуют бонусы/надбавки)
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

function getTg() {
  return (window as any).Telegram?.WebApp;
}

function parseIntSafe(input: string): number {
  const s = String(input ?? "")
    .replace(/\s+/g, "")
    .replace(/[^\d]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function roundDown(n: number, step: number) {
  if (!Number.isFinite(n) || step <= 0) return 0;
  return Math.floor(n / step) * step;
}
function roundUp(n: number, step: number) {
  if (!Number.isFinite(n) || step <= 0) return 0;
  return Math.ceil(n / step) * step;
}
function isMultiple(n: number, step: number) {
  if (!Number.isFinite(n) || step <= 0) return false;
  return n % step === 0;
}

// ✅ все суммы — целые числа
function formatInt(n: number) {
  if (!Number.isFinite(n)) return "";
  return String(Math.trunc(n));
}

function getRate(rates: Rates | null, c: Currency): RateEntry | null {
  if (!rates) return null;
  if (c === "VND") return { buy_vnd: 1, sell_vnd: 1 };
  const r = rates[c as RateKey];
  if (!r) return null;
  const buy = Number(r.buy_vnd);
  const sell = Number(r.sell_vnd);
  if (!Number.isFinite(buy) || !Number.isFinite(sell) || buy <= 0 || sell <= 0) return null;
  return { buy_vnd: buy, sell_vnd: sell };
}

// ✅ ОГРАНИЧЕНИЯ (как ты попросил)
// RUB — отдаёт только переводом
// USDT — отдаёт только переводом
// USD/EUR/THB — отдаёт только наличными
// VND — отдаёт любым способом
function allowedPayMethods(sellCurrency: Currency): PayMethod[] {
  if (sellCurrency === "RUB" || sellCurrency === "USDT") return ["transfer"];
  if (sellCurrency === "USD" || sellCurrency === "EUR" || sellCurrency === "THB") return ["cash"];
  return ["cash", "transfer"]; // VND
}

// Получение (логика как раньше, но дополнили на случай, если будут получать USD/EUR/THB)
function allowedReceiveMethods(buyCurrency: Currency): ReceiveMethod[] {
  if (buyCurrency === "VND") return ["cash", "transfer", "atm"];
  if (buyCurrency === "RUB" || buyCurrency === "USDT") return ["transfer"];
  // USD/EUR/THB
  return ["cash"];
}

function methodLabel(m: ReceiveMethod | PayMethod) {
  if (m === "cash") return "Наличные";
  if (m === "transfer") return "Перевод";
  return "Банкомат";
}

function normalizeStatus(s: any): ClientStatus {
  const v = String(s ?? "").toLowerCase().trim();
  if (["gold", "голд", "золото"].includes(v)) return "gold";
  if (["silver", "силвер", "сильвер", "серебро"].includes(v)) return "silver";
  return "standard";
}

// -------- Бонусы (используются ТОЛЬКО для * -> VND и только RUB/USD/USDT) --------
function tierBonusForRate(sellCurrency: Currency, sellAmount: number, status: ClientStatus): number {
  if (sellAmount <= 0) return 0;

  if (sellCurrency === "RUB") {
    const a = sellAmount;
    if (a < 50_000) return status === "silver" ? 1 : status === "gold" ? 2 : 0;
    if (a < 100_000) return status === "standard" ? 1 : status === "silver" ? 2 : 3;
    if (a < 200_000) return status === "standard" ? 2 : status === "silver" ? 3 : 4;
    return status === "standard" ? 3 : status === "silver" ? 4 : 5;
  }

  if (sellCurrency === "USD" || sellCurrency === "USDT") {
    const a = sellAmount;
    if (a < 1000) return status === "silver" ? 100 : status === "gold" ? 150 : 0;
    if (a < 3000) return status === "standard" ? 100 : status === "silver" ? 150 : 200;
    return status === "standard" ? 150 : status === "silver" ? 200 : 250;
  }

  return 0;
}

// Бонус способа — только когда покупаем VND. Если хоть что-то "cash" — бонуса нет.
function methodBonusForRate(
  sellCurrency: Currency,
  buyCurrency: Currency,
  payMethod: PayMethod,
  receiveMethod: ReceiveMethod
): number {
  if (buyCurrency !== "VND") return 0;
  if (payMethod === "cash" || receiveMethod === "cash") return 0;
  if (receiveMethod !== "transfer" && receiveMethod !== "atm") return 0;

  if (sellCurrency === "RUB") return 1;
  if (sellCurrency === "USD" || sellCurrency === "USDT") return 100;
  return 0;
}

function applyRateBonuses(
  baseRates: Rates,
  sellCurrency: Currency,
  buyCurrency: Currency,
  sellAmountForTier: number,
  status: ClientStatus,
  payMethod: PayMethod,
  receiveMethod: ReceiveMethod
): Rates {
  const next: Rates = { ...baseRates };

  if (buyCurrency === "VND" && (sellCurrency === "RUB" || sellCurrency === "USD" || sellCurrency === "USDT")) {
    const r = getRate(baseRates, sellCurrency);
    if (!r) return next;

    const tier = tierBonusForRate(sellCurrency, sellAmountForTier, status);
    const method = methodBonusForRate(sellCurrency, buyCurrency, payMethod, receiveMethod);
    next[sellCurrency as RateKey] = { buy_vnd: r.buy_vnd + tier + method, sell_vnd: r.sell_vnd };
  }

  return next;
}

// ---------- VND-конвертация ----------
function calcBuyAmountVnd(rates: Rates, sellCurrency: Currency, buyCurrency: Currency, sellAmount: number): number {
  if (sellAmount <= 0) return 0;
  if (sellCurrency === buyCurrency) return sellAmount;

  let vnd: number;

  if (sellCurrency === "VND") vnd = sellAmount;
  else {
    const sr = getRate(rates, sellCurrency);
    if (!sr) return Number.NaN;
    vnd = sellAmount * sr.buy_vnd;
  }

  if (buyCurrency === "VND") return vnd;

  const br = getRate(rates, buyCurrency);
  if (!br) return Number.NaN;
  return vnd / br.sell_vnd;
}

function calcSellAmountVnd(rates: Rates, sellCurrency: Currency, buyCurrency: Currency, buyAmount: number): number {
  if (buyAmount <= 0) return 0;
  if (sellCurrency === buyCurrency) return buyAmount;

  const vndCost = (() => {
    if (buyCurrency === "VND") return buyAmount;
    const br = getRate(rates, buyCurrency);
    if (!br) return Number.NaN;
    return buyAmount * br.sell_vnd;
  })();

  if (!Number.isFinite(vndCost)) return Number.NaN;
  if (sellCurrency === "VND") return vndCost;

  const sr = getRate(rates, sellCurrency);
  if (!sr) return Number.NaN;
  return vndCost / sr.buy_vnd;
}

// ---------- G-конвертация ----------
function isGModePair(a: Currency, b: Currency): boolean {
  if (a === "VND" || b === "VND") return false;
  return !!G_FORMULAS[`${a}/${b}`] || !!G_FORMULAS[`${b}/${a}`];
}

function getGPairRates(
  market: MarketRatesResponse | null,
  base: Currency,
  quote: Currency
): { buy: number; sell: number } | null {
  if (!market || !market.ok) return null;
  const key = `${base}/${quote}`;
  const f = G_FORMULAS[key];
  const G = Number((market as any).g?.[key]);
  if (!f || !Number.isFinite(G) || G <= 0) return null;
  return { buy: G * f.buyMul, sell: G * f.sellMul };
}

function calcBuyAmountG(market: MarketRatesResponse | null, sellCur: Currency, buyCur: Currency, sellAmount: number): number {
  if (sellAmount <= 0) return 0;
  if (sellCur === buyCur) return sellAmount;

  const direct = getGPairRates(market, sellCur, buyCur);
  if (direct) return sellAmount * direct.buy;

  const inverse = getGPairRates(market, buyCur, sellCur);
  if (inverse) return sellAmount / inverse.sell;

  return Number.NaN;
}

function calcSellAmountG(market: MarketRatesResponse | null, sellCur: Currency, buyCur: Currency, buyAmount: number): number {
  if (buyAmount <= 0) return 0;
  if (sellCur === buyCur) return buyAmount;

  const direct = getGPairRates(market, sellCur, buyCur);
  if (direct) return buyAmount / direct.buy;

  const inverse = getGPairRates(market, buyCur, sellCur);
  if (inverse) return buyAmount * inverse.sell;

  return Number.NaN;
}

export default function CalculatorTab({ me }: { me: any }) {
  const tg = getTg();

  const [loading, setLoading] = useState(true);
  const [rates, setRates] = useState<Rates | null>(null);
  const [market, setMarket] = useState<MarketRatesResponse | null>(null);

  const [sellCurrency, setSellCurrency] = useState<Currency>("USD");
  const [buyCurrency, setBuyCurrency] = useState<Currency>("VND");

  const [sellText, setSellText] = useState("");
  const [buyText, setBuyText] = useState("");

  const lastEdited = useRef<"sell" | "buy">("sell");

  const [payMethod, setPayMethod] = useState<PayMethod>("cash");
  const [receiveMethod, setReceiveMethod] = useState<ReceiveMethod>("cash");

  const [clientStatus, setClientStatus] = useState<ClientStatus>(normalizeStatus(me?.status));

  const gMode = useMemo(() => isGModePair(sellCurrency, buyCurrency), [sellCurrency, buyCurrency]);

  // ✅ Автоподстройка "Оплата" под ограничения
  useEffect(() => {
    const allowed = allowedPayMethods(sellCurrency);
    if (!allowed.includes(payMethod)) setPayMethod(allowed[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellCurrency]);

  // ✅ Автоподстройка "Получение" под ограничения
  useEffect(() => {
    const allowed = allowedReceiveMethods(buyCurrency);
    if (!allowed.includes(receiveMethod)) setReceiveMethod(allowed[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyCurrency]);

  // загрузка курсов VND + G
  useEffect(() => {
    tg?.ready?.();
    tg?.expand?.();

    let alive = true;

    const loadRates = async () => {
      try {
        const res = await fetch("/api/rates/today");
        const json = await res.json();
        const r: Rates | null = json?.data?.rates ?? null;
        if (alive) setRates(r);
      } catch {
        if (alive) setRates(null);
      }
    };

    const loadMarket = async () => {
      try {
        const m = await apiGetMarketRates();
        if (alive) setMarket(m);
      } catch {
        if (alive) setMarket({ ok: false, error: "market_fetch_failed", stale: true } as any);
      }
    };

    (async () => {
      setLoading(true);
      await Promise.allSettled([loadRates(), loadMarket()]);
      if (alive) setLoading(false);
    })();

    const mid = window.setInterval(loadMarket, 15 * 60 * 1000);

    return () => {
      alive = false;
      window.clearInterval(mid);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // статус с сервера (на всякий случай)
  useEffect(() => {
    const initData = tg?.initData || "";
    if (!initData) return;

    (async () => {
      try {
        const res = await fetch("/api/me", { headers: { Authorization: `tma ${initData}` } });
        const json = await res.json();
        const raw = json?.data?.status ?? json?.status;
        if (raw) setClientStatus(normalizeStatus(raw));
      } catch {
        // ignore
      }
    })();
  }, [tg]);

  const sellAmount = useMemo(() => parseIntSafe(sellText), [sellText]);
  const buyAmount = useMemo(() => parseIntSafe(buyText), [buyText]);

  // правила округления/шага
  const vndStep = 10000;

  // чего не хватает для расчёта
  const missingRates = useMemo(() => {
    const miss: string[] = [];

    if (gMode) {
      if (!market || !(market as any).ok) miss.push("G");
      else {
        const has =
          !!(market as any).g?.[`${sellCurrency}/${buyCurrency}`] || !!(market as any).g?.[`${buyCurrency}/${sellCurrency}`];
        if (!has) miss.push("G");
      }
      return Array.from(new Set(miss));
    }

    if (!rates) return ["VND rates"];
    if (sellCurrency !== "VND" && !getRate(rates, sellCurrency)) miss.push(sellCurrency);
    if (buyCurrency !== "VND" && !getRate(rates, buyCurrency)) miss.push(buyCurrency);
    return Array.from(new Set(miss));
  }, [gMode, market, rates, sellCurrency, buyCurrency]);

  const canCalc = missingRates.length === 0;

  // ---- Валидации условий (подсветка + запрет отправки) ----
  const invalidUsd = sellCurrency === "USD" && sellAmount > 0 && !isMultiple(sellAmount, 100);
  const invalidEur = sellCurrency === "EUR" && sellAmount > 0 && !isMultiple(sellAmount, 10);
  const invalidVndSell = sellCurrency === "VND" && sellAmount > 0 && !isMultiple(sellAmount, vndStep);
  const invalidVndBuy = buyCurrency === "VND" && buyAmount > 0 && !isMultiple(buyAmount, vndStep);

  const invalidAtmVnd =
    buyCurrency === "VND" && receiveMethod === "atm" && buyAmount > 0 && !isMultiple(buyAmount, 100000);

  // пересчёт
  useEffect(() => {
    if (!canCalc) return;

    // Шаг округления для VND: 10 000
    const roundBuy = (cur: Currency, n: number) => (cur === "VND" ? roundDown(n, vndStep) : roundDown(n, 1));
    // Требуемый sell лучше округлять вверх
    const sellStep = (cur: Currency) => {
      if (cur === "VND") return vndStep;
      if (cur === "USD") return 100;
      if (cur === "EUR") return 10;
      return 1;
    };

    if (gMode) {
      if (lastEdited.current === "sell") {
        const outRaw = calcBuyAmountG(market, sellCurrency, buyCurrency, sellAmount);
        const out = sellText && Number.isFinite(outRaw) ? roundBuy(buyCurrency, outRaw) : 0;
        const next = sellText && Number.isFinite(outRaw) ? formatInt(out) : "";
        if (next !== buyText) setBuyText(next);
      } else {
        const needRaw = calcSellAmountG(market, sellCurrency, buyCurrency, buyAmount);
        const need = buyText && Number.isFinite(needRaw) ? roundUp(needRaw, sellStep(sellCurrency)) : 0;
        const next = buyText && Number.isFinite(needRaw) ? formatInt(need) : "";
        if (next !== sellText) setSellText(next);
      }
      return;
    }

    if (!rates) return;

    if (lastEdited.current === "sell") {
      const effectiveRates = applyRateBonuses(
        rates,
        sellCurrency,
        buyCurrency,
        sellAmount,
        clientStatus,
        payMethod,
        receiveMethod
      );
      const outRaw = calcBuyAmountVnd(effectiveRates, sellCurrency, buyCurrency, sellAmount);
      const out = sellText && Number.isFinite(outRaw) ? roundBuy(buyCurrency, outRaw) : 0;
      const next = sellText && Number.isFinite(outRaw) ? formatInt(out) : "";
      if (next !== buyText) setBuyText(next);
    } else {
      // итерация для бонусов (только для *->VND)
      let guess = calcSellAmountVnd(rates, sellCurrency, buyCurrency, buyAmount);

      for (let i = 0; i < 3; i++) {
        const effectiveRates = applyRateBonuses(
          rates,
          sellCurrency,
          buyCurrency,
          Number.isFinite(guess) ? guess : 0,
          clientStatus,
          payMethod,
          receiveMethod
        );
        const nextGuess = calcSellAmountVnd(effectiveRates, sellCurrency, buyCurrency, buyAmount);
        if (!Number.isFinite(nextGuess)) break;
        if (Math.abs(nextGuess - guess) < 1e-7) {
          guess = nextGuess;
          break;
        }
        guess = nextGuess;
      }

      const need = buyText && Number.isFinite(guess) ? roundUp(guess, sellStep(sellCurrency)) : 0;
      const next = buyText && Number.isFinite(guess) ? formatInt(need) : "";
      if (next !== sellText) setSellText(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sellText,
    buyText,
    sellCurrency,
    buyCurrency,
    rates,
    market,
    receiveMethod,
    payMethod,
    clientStatus,
    canCalc,
    gMode
  ]);

  const canSendBase =
    canCalc && sellCurrency !== buyCurrency && parseIntSafe(sellText) > 0 && parseIntSafe(buyText) > 0 && !!receiveMethod;

  const hasInvalid =
    invalidUsd || invalidEur || invalidAtmVnd || invalidVndSell || invalidVndBuy;

  const canSend = canSendBase && !hasInvalid;

  function swapCurrencies() {
    setSellCurrency(buyCurrency);
    setBuyCurrency(sellCurrency);
    const a = sellText;
    const b = buyText;
    setSellText(b);
    setBuyText(a);
  }

  async function sendRequest() {
    if (!canSend) return;

    const initData = tg?.initData || "";
    if (!initData) {
      tg?.showAlert?.("Нет initData. Открой мини-приложение через Telegram (/start).");
      return;
    }

    const payload = {
      sellCurrency,
      buyCurrency,
      sellAmount: parseIntSafe(sellText),
      buyAmount: parseIntSafe(buyText),
      payMethod,
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
        tg?.HapticFeedback?.notificationOccurred?.("error");
        tg?.showAlert?.(`Ошибка: ${json?.error || "fail"}`);
        return;
      }

      tg?.HapticFeedback?.notificationOccurred?.("success");
      tg?.showPopup?.({
        title: "Отправлено",
        message: "Заявка отправлена ✅",
        buttons: [{ type: "ok" }]
      });
    } catch (e: any) {
      tg?.HapticFeedback?.notificationOccurred?.("error");
      tg?.showAlert?.(`Ошибка сети: ${e?.message || e}`);
    }
  }

  const allowedPay = useMemo(() => allowedPayMethods(sellCurrency), [sellCurrency]);
  const allowedRecv = useMemo(() => allowedReceiveMethods(buyCurrency), [buyCurrency]);

  // подсказки
  const usdNote =
    sellCurrency === "USD"
      ? "На обмен принимаются только доллары номиналом 100$ нового образца (синие), без надписей и дефектов."
      : null;

  const eurNote =
    sellCurrency === "EUR" ? "На обмен принимаются только банкноты EURO без надписей и дефектов." : null;

  const atmVndNote =
    buyCurrency === "VND" && receiveMethod === "atm"
      ? "Сумма получения в банкомате должна быть кратна 100000."
      : null;

  const vndStepNote =
    (sellCurrency === "VND" || buyCurrency === "VND")
      ? "Донги округляются и вводятся шагом 10000."
      : null;

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

        .vx-inputInvalid{
          border-color: rgba(185,28,28,0.55) !important;
          box-shadow: 0 0 0 3px rgba(185,28,28,0.12) !important;
        }

        .vx-sectionTitle{
          margin-top: 10px;
          font-size: 12px;
          font-weight: 900;
          color: rgba(15,23,42,0.62);
        }

        .vx-methods{ display:flex; gap:8px; flex-wrap:wrap; margin-top: 6px; }
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
        .vx-pillDisabled{
          opacity: 0.35;
          cursor: not-allowed;
          filter: grayscale(0.2);
        }

        .vx-note{
          margin-top: 10px;
          font-size: 12px;
          font-weight: 900;
          line-height: 1.35;
          border: 1px solid rgba(15,23,42,0.10);
          background: rgba(255,255,255,0.72);
          border-radius: 16px;
          padding: 10px 12px;
          color: rgba(15,23,42,0.78);
        }
        .vx-noteWarn{
          border-color: rgba(185,28,28,0.20);
          background: rgba(185,28,28,0.06);
          color: rgba(185,28,28,0.88);
        }

        .vx-warn{
          margin-top: 10px;
          font-size: 12px;
          font-weight: 900;
          color: rgba(185,28,28,0.85);
          line-height: 1.35;
        }

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
        <div className="vx-muted">Статус: {clientStatus}</div>
      </div>

      {loading && <div className="vx-help">Загрузка курсов…</div>}
      {!loading && (!rates || (!market && gMode)) && <div className="vx-help">Курсы не загружены.</div>}

      <div className="vx-calcBox">
        <div className="vx-exRow">
          <select value={sellCurrency} onChange={(e) => setSellCurrency(e.target.value as Currency)}>
            {CURRENCY_OPTIONS.map((c) => (
              <option key={"sell-" + c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <input
            inputMode="numeric"
            placeholder="Отдаю"
            value={sellText}
            className={
              (invalidUsd || invalidEur || invalidVndSell) ? "vx-inputInvalid" : ""
            }
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
            {CURRENCY_OPTIONS.map((c) => (
              <option key={"buy-" + c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <input
            inputMode="numeric"
            placeholder="Получаю"
            value={buyText}
            className={(invalidAtmVnd || invalidVndBuy) ? "vx-inputInvalid" : ""}
            onChange={(e) => {
              lastEdited.current = "buy";
              setBuyText(e.target.value);
            }}
          />

          <div style={{ width: 48, height: 48 }} />
        </div>

        <div className="vx-sectionTitle">Оплата</div>
        <div className="vx-methods">
          {ALL_PAY_METHODS.map((m) => {
            const disabled = !allowedPay.includes(m);
            return (
              <div
                key={m}
                className={"vx-pill " + (payMethod === m ? "vx-pillActive " : "") + (disabled ? "vx-pillDisabled" : "")}
                onClick={() => {
                  if (!disabled) setPayMethod(m);
                }}
                aria-disabled={disabled}
                role="button"
              >
                {methodLabel(m)}
              </div>
            );
          })}
        </div>

        <div className="vx-sectionTitle">Получение</div>
        <div className="vx-methods">
          {ALL_RECEIVE_METHODS.map((m) => {
            const disabled = !allowedRecv.includes(m);
            return (
              <div
                key={m}
                className={"vx-pill " + (receiveMethod === m ? "vx-pillActive " : "") + (disabled ? "vx-pillDisabled" : "")}
                onClick={() => {
                  if (!disabled) setReceiveMethod(m);
                }}
                aria-disabled={disabled}
                role="button"
              >
                {methodLabel(m)}
              </div>
            );
          })}
        </div>

        {usdNote ? <div className="vx-note">{usdNote}</div> : null}
        {eurNote ? <div className="vx-note">{eurNote}</div> : null}
        {vndStepNote ? <div className="vx-note">{vndStepNote}</div> : null}

        {atmVndNote ? (
          <div className={"vx-note " + (invalidAtmVnd ? "vx-noteWarn" : "")}>
            {atmVndNote}
          </div>
        ) : null}

        {!canCalc ? <div className="vx-warn">Не хватает данных для расчёта: {missingRates.join(", ")}</div> : null}

        {invalidUsd ? <div className="vx-warn">USD: сумма должна быть кратна 100.</div> : null}
        {invalidEur ? <div className="vx-warn">EUR: сумма должна быть кратна 10.</div> : null}
        {invalidVndSell || invalidVndBuy ? <div className="vx-warn">VND: сумма должна быть кратна 10000.</div> : null}
        {invalidAtmVnd ? <div className="vx-warn">Сумма получения в банкомате должна быть кратна 100000.</div> : null}

        <div style={{ height: 12 }} />

        <button className="vx-primary" disabled={!canSend} onClick={sendRequest}>
          Отправить заявку
        </button>
      </div>
    </div>
  );
}
