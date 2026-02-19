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

// ✅ округления/условия
const VND_STEP = 10_000;
const ATM_VND_STEP = 100_000;

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
  "EUR/THB": { buyMul: 0.95, sellMul: 1.07 },
};

function getTg() {
  return (window as any).Telegram?.WebApp;
}

// ✅ все суммы — целые числа
function parseIntSafe(input: string): number {
  const s = String(input ?? "")
    .replace(/\s+/g, "")
    .replace(/[^\d]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function formatAmount(_cur: Currency, n: number) {
  if (!Number.isFinite(n)) return "";
  return String(Math.trunc(n));
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

// Получение (как было): VND — cash/transfer/atm, RUB/USDT — transfer, остальное — cash
function allowedReceiveMethods(buyCurrency: Currency): ReceiveMethod[] {
  if (buyCurrency === "VND") return ["cash", "transfer", "atm"];
  if (buyCurrency === "RUB") return ["transfer"];
  if (buyCurrency === "USDT") return ["transfer"];
  return ["cash"]; // USD/EUR/THB
}

// ✅ Ограничения по тому, ЧЕМ клиент ОТДАЁТ валюту
// RUB — только перевод
// USDT — только перевод
// USD/EUR/THB — только наличные
// VND — любой способ
function allowedPayMethods(sellCurrency: Currency): PayMethod[] {
  if (sellCurrency === "RUB" || sellCurrency === "USDT") return ["transfer"];
  if (sellCurrency === "USD" || sellCurrency === "EUR" || sellCurrency === "THB") return ["cash"];
  return ["cash", "transfer"]; // VND
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

function statusLabel(s: ClientStatus) {
  if (s === "gold") return "Голд";
  if (s === "silver") return "Сильвер";
  return "Стандарт";
}

/**
 * Бонус по статусу/сумме (используется ТОЛЬКО для * -> VND и только RUB/USD/USDT)
 */
function tierBonusForRate(sellCurrency: Currency, sellAmount: number, status: ClientStatus): number {
  if (sellAmount <= 0) return 0;

  if (sellCurrency === "RUB") {
    const a = sellAmount;
    if (a < 50_000) {
      if (status === "silver") return 1;
      if (status === "gold") return 2;
      return 0;
    }
    if (a < 100_000) {
      if (status === "standard") return 1;
      if (status === "silver") return 2;
      return 3;
    }
    if (a < 200_000) {
      if (status === "standard") return 2;
      if (status === "silver") return 3;
      return 4;
    }
    if (status === "standard") return 3;
    if (status === "silver") return 4;
    return 5;
  }

  if (sellCurrency === "USD" || sellCurrency === "USDT") {
    const a = sellAmount;

    if (a < 1000) {
      if (status === "silver") return 100;
      if (status === "gold") return 150;
      return 0;
    }

    if (a < 3000) {
      if (status === "standard") return 100;
      if (status === "silver") return 150;
      return 200;
    }

    if (status === "standard") return 150;
    if (status === "silver") return 200;
    return 250;
  }

  return 0;
}

/**
 * Доп. бонус ATM/Перевод — ТОЛЬКО когда покупаем VND.
 * И если хоть что-то "Наличные" — бонус отменяем.
 */
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

  // бонусы только для * -> VND и только RUB/USD/USDT
  if (buyCurrency === "VND" && (sellCurrency === "RUB" || sellCurrency === "USD" || sellCurrency === "USDT")) {
    const r = getRate(baseRates, sellCurrency);
    if (!r) return next;

    const tier = tierBonusForRate(sellCurrency, sellAmountForTier, status);
    const method = methodBonusForRate(sellCurrency, buyCurrency, payMethod, receiveMethod);
    next[sellCurrency as RateKey] = { buy_vnd: r.buy_vnd + tier + method, sell_vnd: r.sell_vnd };
  }

  return next;
}

// ---------- VND-конвертация (как раньше) ----------
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

// ---------- G-конвертация (формулы с картинки) ----------
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
  const G = Number(market.g?.[key]);
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

  // ✅ подстройка метода оплаты под правила
  useEffect(() => {
    const allowed = allowedPayMethods(sellCurrency);
    if (!allowed.includes(payMethod)) setPayMethod(allowed[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellCurrency]);

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
        if (alive) setMarket({ ok: false, error: "market_fetch_failed", stale: true });
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

  // статус с сервера
  useEffect(() => {
    const tg2 = getTg();
    const initData = tg2?.initData || "";
    if (!initData) return;

    (async () => {
      try {
        const res = await fetch("/api/me", { headers: { Authorization: `tma ${initData}` } });
        const json = await res.json();
        const raw = json?.data?.status ?? json?.status ?? json?.data?.user?.status ?? json?.user?.status;
        if (raw) setClientStatus(normalizeStatus(raw));
      } catch {
        // ignore
      }
    })();
  }, []);

  const sellAmount = useMemo(() => parseIntSafe(sellText), [sellText]);
  const buyAmount = useMemo(() => parseIntSafe(buyText), [buyText]);

  // чего не хватает для расчёта
  const missingRates = useMemo(() => {
    const miss: string[] = [];

    if (gMode) {
      if (!market || !market.ok) miss.push("G");
      else {
        const has = !!market.g?.[`${sellCurrency}/${buyCurrency}`] || !!market.g?.[`${buyCurrency}/${sellCurrency}`];
        if (!has) miss.push("G");
      }
      return Array.from(new Set(miss));
    }

    if (!rates) return ["VND rates"]; // общий маркер
    if (sellCurrency !== "VND" && !getRate(rates, sellCurrency)) miss.push(sellCurrency);
    if (buyCurrency !== "VND" && !getRate(rates, buyCurrency)) miss.push(buyCurrency);
    return Array.from(new Set(miss));
  }, [gMode, market, rates, sellCurrency, buyCurrency]);

  const canCalc = missingRates.length === 0;

  // --- Валидации условий ---
  const invalidUsd = sellCurrency === "USD" && sellAmount > 0 && !isMultiple(sellAmount, 100);
  const invalidEur = sellCurrency === "EUR" && sellAmount > 0 && !isMultiple(sellAmount, 10);
  const invalidVndSell = sellCurrency === "VND" && sellAmount > 0 && !isMultiple(sellAmount, VND_STEP);
  const invalidVndBuy = buyCurrency === "VND" && buyAmount > 0 && !isMultiple(buyAmount, VND_STEP);
  const invalidAtmVnd = buyCurrency === "VND" && receiveMethod === "atm" && buyAmount > 0 && !isMultiple(buyAmount, ATM_VND_STEP);

  const hasInvalid = invalidUsd || invalidEur || invalidVndSell || invalidVndBuy || invalidAtmVnd;

  // пересчёт
  useEffect(() => {
    if (!canCalc) return;

    const buyOutStep = (cur: Currency) => (cur === "VND" ? VND_STEP : 1);
    const sellNeedStep = (cur: Currency) => {
      if (cur === "VND") return VND_STEP;
      if (cur === "USD") return 100;
      if (cur === "EUR") return 10;
      return 1;
    };

    if (gMode) {
      if (lastEdited.current === "sell") {
        const outRaw = calcBuyAmountG(market, sellCurrency, buyCurrency, sellAmount);
        const out = sellText && Number.isFinite(outRaw) ? roundDown(outRaw, buyOutStep(buyCurrency)) : 0;
        const next = sellText && Number.isFinite(outRaw) ? formatAmount(buyCurrency, out) : "";
        if (next !== buyText) setBuyText(next);
      } else {
        const needRaw = calcSellAmountG(market, sellCurrency, buyCurrency, buyAmount);
        const need = buyText && Number.isFinite(needRaw) ? roundUp(needRaw, sellNeedStep(sellCurrency)) : 0;
        const next = buyText && Number.isFinite(needRaw) ? formatAmount(sellCurrency, need) : "";
        if (next !== sellText) setSellText(next);
      }
      return;
    }

    if (!rates) return;

    if (lastEdited.current === "sell") {
      const effectiveRates = applyRateBonuses(rates, sellCurrency, buyCurrency, sellAmount, clientStatus, payMethod, receiveMethod);
      const outRaw = calcBuyAmountVnd(effectiveRates, sellCurrency, buyCurrency, sellAmount);
      const out = sellText && Number.isFinite(outRaw) ? roundDown(outRaw, buyOutStep(buyCurrency)) : 0;
      const next = sellText && Number.isFinite(outRaw) ? formatAmount(buyCurrency, out) : "";
      if (next !== buyText) setBuyText(next);
    } else {
      let guess = calcSellAmountVnd(rates, sellCurrency, buyCurrency, buyAmount);

      // итерация нужна только из-за бонуса, зависящего от sellAmount
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

      const need = buyText && Number.isFinite(guess) ? roundUp(guess, sellNeedStep(sellCurrency)) : 0;
      const next = buyText && Number.isFinite(guess) ? formatAmount(sellCurrency, need) : "";
      if (next !== sellText) setSellText(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellText, buyText, sellCurrency, buyCurrency, rates, market, receiveMethod, payMethod, clientStatus, canCalc, gMode]);

  const rateInfo = useMemo(() => {
    // бонусы показываем только для * -> VND, и только если НЕ gMode
    if (gMode) return null;
    if (!rates) return null;
    if (buyCurrency !== "VND") return null;
    if (!(sellCurrency === "RUB" || sellCurrency === "USD" || sellCurrency === "USDT")) return null;

    const base = getRate(rates, sellCurrency)?.buy_vnd ?? null;
    if (!base) return null;

    const tier = tierBonusForRate(sellCurrency, sellAmount, clientStatus);
    const m = methodBonusForRate(sellCurrency, buyCurrency, payMethod, receiveMethod);
    return { base, tier, m, eff: base + tier + m };
  }, [gMode, rates, sellCurrency, buyCurrency, sellAmount, clientStatus, receiveMethod, payMethod]);

  const canSend = canCalc && sellCurrency !== buyCurrency && sellAmount > 0 && buyAmount > 0 && !!receiveMethod && !hasInvalid;

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

    const tg2 = getTg();
    const initData = tg2?.initData || "";
    if (!initData) {
      tg2?.showAlert?.("Нет initData. Открой мини-приложение через Telegram (/start)." );
      return;
    }

    const payload = {
      sellCurrency,
      buyCurrency,
      sellAmount: parseIntSafe(sellText),
      buyAmount: parseIntSafe(buyText),
      payMethod,
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

  const payAllowed = useMemo(() => allowedPayMethods(sellCurrency), [sellCurrency]);

  return (
    <div className="vx-calc">
      <style>{`
        .vx-calc{ display:flex; flex-direction:column; gap:12px; }
        .vx-calcTitle{ display:flex; align-items:baseline; justify-content:space-between; gap:10px; }
        .vx-calcTitle .vx-muted{ font-size:12px; color: rgba(15,23,42,0.55); font-weight:800; }

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

        .vx-rateLine{
          margin-top: 10px;
          font-size: 12px;
          font-weight: 900;
          color: rgba(15,23,42,0.72);
        }
        .vx-rateLine b{ color: rgba(15,23,42,0.92); }

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
        <div className="vx-muted">Статус: {statusLabel(clientStatus)}</div>
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
            className={(invalidUsd || invalidEur || invalidVndSell) ? "vx-inputInvalid" : ""}
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
          {(["cash", "transfer"] as PayMethod[]).map((m) => {
            const disabled = !payAllowed.includes(m);
            return (
              <div
                key={m}
                className={
                  "vx-pill " +
                  (payMethod === m ? "vx-pillActive " : "") +
                  (disabled ? "vx-pillDisabled" : "")
                }
                onClick={() => {
                  if (!disabled) setPayMethod(m);
                }}
              >
                {methodLabel(m)}
              </div>
            );
          })}
        </div>

        <div className="vx-sectionTitle">Получение</div>
        <div className="vx-methods">
          {allowedReceiveMethods(buyCurrency).map((m) => (
            <div
              key={m}
              className={"vx-pill " + (receiveMethod === m ? "vx-pillActive" : "")}
              onClick={() => setReceiveMethod(m)}
            >
              {methodLabel(m)}
            </div>
          ))}
        </div>

        {rateInfo ? (
          <div className="vx-rateLine">
            Курс: <b>{rateInfo.base}</b> + статус <b>{rateInfo.tier}</b> + способ <b>{rateInfo.m}</b> = <b>{rateInfo.eff}</b>
          </div>
        ) : gMode ? (
          <div className="vx-rateLine">Для этой пары используется <b>G</b>-курс по формуле (без бонусов/банкомата).</div>
        ) : null}

        {!canCalc ? <div className="vx-warn">Не хватает данных для расчёта: {missingRates.join(", ")}</div> : null}

        {sellCurrency === "USD" ? (
          <div className="vx-note">
            На обмен принимаются только доллары номиналом 100$ нового образца (синие), без надписей и дефектов.
          </div>
        ) : null}

        {sellCurrency === "EUR" ? (
          <div className="vx-note">На обмен принимаются только банкноты EURO без надписей и дефектов.</div>
        ) : null}

        {(sellCurrency === "VND" || buyCurrency === "VND") ? (
          <div className="vx-note">Донги округляются и вводятся шагом 10000.</div>
        ) : null}

        {buyCurrency === "VND" && receiveMethod === "atm" ? (
          <div className={"vx-note " + (invalidAtmVnd ? "vx-noteWarn" : "")}>Сумма получения в банкомате должна быть кратна 100000.</div>
        ) : null}

        {invalidUsd ? <div className="vx-warn">USD: сумма должна быть кратна 100.</div> : null}
        {invalidEur ? <div className="vx-warn">EUR: сумма должна быть кратна 10.</div> : null}
        {(invalidVndSell || invalidVndBuy) ? <div className="vx-warn">VND: сумма должна быть кратна 10000.</div> : null}
        
        <div style={{ height: 12 }} />

        <button className="vx-primary" disabled={!canSend} onClick={sendRequest}>
          Отправить заявку
        </button>
      </div>
    </div>
  );
}
