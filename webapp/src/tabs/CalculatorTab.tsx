import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiGetBonuses, apiGetGFormulas, apiGetMarketRates } from "../lib/api";
import type { BonusesConfig, MarketRatesResponse, UserStatus } from "../lib/types";

type Currency = "RUB" | "USDT" | "USD" | "EUR" | "THB" | "VND";
type ReceiveMethod = "cash" | "transfer" | "atm";
type PayMethod = "cash" | "transfer";

type RateKey = Exclude<Currency, "VND">;
type RateEntry = { buy_vnd: number; sell_vnd: number };
type Rates = Partial<Record<RateKey, RateEntry>>;

type ClientStatus = "standard" | "silver" | "gold";

type Props = {
  me: {
    ok: boolean;
    initData: string;
    user?: { id: number; username?: string; first_name?: string; last_name?: string };
    status?: UserStatus;
    adminChat?: { tgId: number | null; username?: string; deepLink?: string };
  };
};

const CURRENCY_OPTIONS: Currency[] = ["RUB", "USDT", "USD", "EUR", "THB", "VND"];
const ALL_PAY: PayMethod[] = ["cash", "transfer"];
const ALL_RECEIVE: ReceiveMethod[] = ["cash", "transfer", "atm"];

// Формулы с картинки (на эти пары НЕ действуют бонусы/надбавки)
const DEFAULT_G_FORMULAS: Record<string, { buyMul: number; sellMul: number }> = {
  "USDT/RUB": { buyMul: 0.98, sellMul: 1.08 },
  "USD/RUB": { buyMul: 0.98, sellMul: 1.08 },
  "EUR/RUB": { buyMul: 0.94, sellMul: 1.08 },
  "THB/RUB": { buyMul: 0.96, sellMul: 1.1 },
  "USD/USDT": { buyMul: 0.965, sellMul: 1.035 },
  "USDT/USD": { buyMul: 0.965, sellMul: 1.035 },
  "EUR/USD": { buyMul: 0.95, sellMul: 1.05 },
  "EUR/USDT": { buyMul: 0.95, sellMul: 1.05 },
  "USD/THB": { buyMul: 0.95, sellMul: 1.07 },
  "USDT/THB": { buyMul: 0.95, sellMul: 1.07 },
  "EUR/THB": { buyMul: 0.95, sellMul: 1.07 },
};

function getTg() {
  return (window as any).Telegram?.WebApp;
}

// ======= Number formatting/parsing =======
// Thousands separator must be a comma (1,000 / 10,000)
// Only USDT may contain a fractional part, with exactly 1 digit (e.g. 100.1)

function fmtGroupedInt(intPart: string): string {
  const s = String(intPart ?? "").replace(/\D+/g, "");
  if (!s) return "";
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function parseAmount(cur: Currency, input: string): number {
  const raw = String(input ?? "").replace(/\s+/g, "");
  if (!raw) return 0;

  if (cur === "USDT") {
    // Accept either 100.1 or 100,1 (we normalize to dot) while keeping commas as grouping.
    const s0 = raw.replace(/[^\d.,]/g, "");
    const dotCount = (s0.match(/\./g) || []).length;
    const commaCount = (s0.match(/,/g) || []).length;

    // Choose decimal separator
    const useDot = dotCount >= 1;
    const useCommaAsDecimal = !useDot && commaCount === 1 && /^\d+,\d$/.test(s0);

    let s = s0;
    if (useDot) {
      // commas are grouping separators
      s = s.replace(/,/g, "");
    } else if (useCommaAsDecimal) {
      s = s.replace(/,/g, ".");
    } else {
      // treat commas as grouping
      s = s.replace(/,/g, "");
    }

    // keep only digits and a single dot
    const parts = s.split(".");
    const intPart = (parts[0] || "").replace(/\D+/g, "");
    const dec = (parts[1] || "").replace(/\D+/g, "").slice(0, 1);
    const norm = dec ? `${intPart || "0"}.${dec}` : intPart;
    const n = Number(norm);
    return Number.isFinite(n) ? n : 0;
  }

  // integers only
  const digits = raw.replace(/[^\d]/g, "");
  const n = Number(digits);
  return Number.isFinite(n) ? n : 0;
}

function fmtAmount(cur: Currency, n: number): string {
  if (!Number.isFinite(n)) return "";

  if (cur === "USDT") {
    const v = Math.round(n * 10) / 10;
    const sign = v < 0 ? "-" : "";
    const abs = Math.abs(v);
    const intPart = Math.trunc(abs);
    const dec = Math.round((abs - intPart) * 10);
    const grouped = String(intPart).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return dec ? `${sign}${grouped}.${dec}` : `${sign}${grouped}`;
  }

  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function fmtFromInput(cur: Currency, v: string): string {
  const raw = String(v ?? "").replace(/\s+/g, "");
  if (!raw) return "";

  if (cur === "USDT") {
    // Keep digits + optional decimal separator, 1 digit after it.
    let s = raw.replace(/[^\d.,]/g, "");

    // If user typed comma as decimal (single comma, one digit after), normalize to dot.
    const dotCount = (s.match(/\./g) || []).length;
    const commaCount = (s.match(/,/g) || []).length;
    if (dotCount === 0 && commaCount === 1) {
      const [a, b] = s.split(",");
      if (a && b && b.replace(/\D+/g, "").length === 1) s = `${a}.${b}`;
    }

    // Remove grouping commas
    s = s.replace(/,/g, "");

    const [a0, b0] = s.split(".");
    const a = (a0 || "").replace(/\D+/g, "");
    const b = (b0 || "").replace(/\D+/g, "").slice(0, 1);
    const grouped = fmtGroupedInt(a);
    return b ? `${grouped}.${b}` : grouped;
  }

  const digits = raw.replace(/\D+/g, "");
  return fmtGroupedInt(digits);
}

function isMultiple(n: number, step: number) {
  if (!Number.isFinite(n) || step <= 0) return false;
  return n % step === 0;
}

function roundDown(n: number, step: number) {
  if (!Number.isFinite(n) || step <= 0) return 0;
  // handle the only fractional step we use (USDT 0.1)
  if (step === 0.1) return Math.floor((n + 1e-9) * 10) / 10;
  return Math.floor(n / step) * step;
}

function roundUp(n: number, step: number) {
  if (!Number.isFinite(n) || step <= 0) return 0;
  if (step === 0.1) return Math.ceil((n - 1e-9) * 10) / 10;
  return Math.ceil(n / step) * step;
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

function methodLabel(m: ReceiveMethod | PayMethod) {
  if (m === "cash") return "Наличные";
  if (m === "transfer") return "Перевод";
  return "Банкомат";
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

// ======= Способы оплаты (что клиент ОТДАЁТ) =======
// RUB / USDT -> только перевод
// USD / EUR / THB -> только наличные
// VND -> любые
function allowedPayMethods(sellCurrency: Currency): PayMethod[] {
  if (sellCurrency === "RUB" || sellCurrency === "USDT") return ["transfer"];
  if (sellCurrency === "USD" || sellCurrency === "EUR" || sellCurrency === "THB") return ["cash"];
  return ["cash", "transfer"]; // VND
}

// ======= Способы получения (что клиент ПОЛУЧАЕТ) =======
function allowedReceiveMethods(buyCurrency: Currency): ReceiveMethod[] {
  if (buyCurrency === "VND") return ["cash", "transfer", "atm"];
  if (buyCurrency === "RUB" || buyCurrency === "USDT") return ["transfer"];
  return ["cash"]; // USD/EUR/THB
}

// ======= Бонусы лояльности (только * -> VND и только RUB/USD/USDT) =======
function tierBonusForRate(
  sellCurrency: Currency,
  sellAmount: number,
  status: ClientStatus,
  bonuses?: BonusesConfig | null
): number {
  if (sellAmount <= 0) return 0;

  // If bonuses config is present and tiers are disabled, do not apply any status/tier markup
  if (bonuses && bonuses.enabled && bonuses.enabled.tiers === false) return 0;

  // configurable bonuses from server
  if (bonuses?.enabled?.tiers) {
    const list: any[] | undefined = (bonuses.tiers as any)?.[sellCurrency];
    if (Array.isArray(list) && list.length > 0) {
      const t = list.find((x) => {
        const min = Number(x?.min);
        const max = x?.max == null || x?.max === "" ? undefined : Number(x?.max);
        if (!Number.isFinite(min)) return false;
        if (sellAmount < min) return false;
        if (max !== undefined && Number.isFinite(max) && sellAmount >= max) return false;
        return true;
      });
      if (t) {
        const v = Number(t?.[status]);
        return Number.isFinite(v) ? v : 0;
      }
    }
  }

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

function methodBonusForRate(
  sellCurrency: Currency,
  buyCurrency: Currency,
  payMethod: PayMethod,
  receiveMethod: ReceiveMethod,
  bonuses?: BonusesConfig | null
): number {
  if (buyCurrency !== "VND") return 0;

  // If bonuses config is present and method markups are disabled, do not apply any method markup
  if (bonuses && bonuses.enabled && bonuses.enabled.methods === false) return 0;

  // Надбавка зависит от СПОСОБА ПОЛУЧЕНИЯ (перевод/банкомат).
  // Оплата (нал/перевод) на неё не влияет.
  // Наличными (cash) надбавка не применяется.
  void payMethod;
  if (receiveMethod === "cash") return 0;
  if (receiveMethod !== "transfer" && receiveMethod !== "atm") return 0;

  // configurable bonuses from server
  if (bonuses?.enabled?.methods) {
    const row = (bonuses.methods as any)?.[receiveMethod];
    if (row && (sellCurrency === "RUB" || sellCurrency === "USD" || sellCurrency === "USDT")) {
      const v = Number(row?.[sellCurrency]);
      return Number.isFinite(v) ? v : 0;
    }
    return 0;
  }

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
  receiveMethod: ReceiveMethod,
  bonuses?: BonusesConfig | null
): Rates {
  const next: Rates = { ...baseRates };

  if (buyCurrency === "VND" && (sellCurrency === "RUB" || sellCurrency === "USD" || sellCurrency === "USDT")) {
    const r = getRate(baseRates, sellCurrency);
    if (!r) return next;

    const tier = tierBonusForRate(sellCurrency, sellAmountForTier, status, bonuses);
    const method = methodBonusForRate(sellCurrency, buyCurrency, payMethod, receiveMethod, bonuses);
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
function isGModePair(formulas: Record<string, { buyMul: number; sellMul: number }>, a: Currency, b: Currency): boolean {
  if (a === "VND" || b === "VND") return false;
  return !!formulas[`${a}/${b}`] || !!formulas[`${b}/${a}`];
}

function getGPairRates(
  market: MarketRatesResponse | null,
  formulas: Record<string, { buyMul: number; sellMul: number }>,
  base: Currency,
  quote: Currency
): { buy: number; sell: number } | null {
  if (!market || !market.ok) return null;
  const key = `${base}/${quote}`;
  const f = formulas[key];
  const G = Number(market.g?.[key]);
  if (!f || !Number.isFinite(G) || G <= 0) return null;

  // IMPORTANT:
  // In the UI we show parsed G-pair rates with 1 decimal for non‑VND quotes.
  // To avoid mismatches between the shown rate and the calculation,
  // apply the same rounding here BEFORE calculations.
  const digits = quote === "VND" ? 0 : 1;
  const pow = Math.pow(10, digits);
  const round = (x: number) => Math.round(x * pow) / pow;

  return { buy: round(G * f.buyMul), sell: round(G * f.sellMul) };
}

function calcBuyAmountG(
  market: MarketRatesResponse | null,
  formulas: Record<string, { buyMul: number; sellMul: number }>,
  sellCur: Currency,
  buyCur: Currency,
  sellAmount: number
): number {
  if (sellAmount <= 0) return 0;
  if (sellCur === buyCur) return sellAmount;

  const direct = getGPairRates(market, formulas, sellCur, buyCur);
  if (direct) return sellAmount * direct.buy;

  const inverse = getGPairRates(market, formulas, buyCur, sellCur);
  if (inverse) return sellAmount / inverse.sell;

  return Number.NaN;
}

function calcSellAmountG(
  market: MarketRatesResponse | null,
  formulas: Record<string, { buyMul: number; sellMul: number }>,
  sellCur: Currency,
  buyCur: Currency,
  buyAmount: number
): number {
  if (buyAmount <= 0) return 0;
  if (sellCur === buyCur) return buyAmount;

  const direct = getGPairRates(market, formulas, sellCur, buyCur);
  if (direct) return buyAmount / direct.buy;

  const inverse = getGPairRates(market, formulas, buyCur, sellCur);
  if (inverse) return buyAmount * inverse.sell;

  return Number.NaN;
}

function amountStep(cur: Currency): number {
  if (cur === "USD") return 100;
  if (cur === "EUR") return 10;
  if (cur === "THB") return 100;
  if (cur === "USDT") return 0.1;
  return 1;
}

const ATM_VND_STEP = 100000;

export default function CalculatorTab({ me }: Props) {
  const tg = getTg();

  const [loading, setLoading] = useState(true);
  const [rates, setRates] = useState<Rates | null>(null);
  const [market, setMarket] = useState<MarketRatesResponse | null>(null);
  const [bonuses, setBonuses] = useState<BonusesConfig | null>(null);
  const [formulas, setFormulas] = useState<Record<string, { buyMul: number; sellMul: number }>>(DEFAULT_G_FORMULAS);

  const [sellCurrency, setSellCurrency] = useState<Currency>("RUB");
  const [buyCurrency, setBuyCurrency] = useState<Currency>("VND");

  const [sellText, setSellText] = useState("");
  const [buyText, setBuyText] = useState("");

  const lastEdited = useRef<"sell" | "buy">("sell");

  const [payMethod, setPayMethod] = useState<PayMethod>("transfer");
  const [receiveMethod, setReceiveMethod] = useState<ReceiveMethod>("cash");

  const [clientStatus, setClientStatus] = useState<ClientStatus>(normalizeStatus(me?.status));

  const [banner, setBanner] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  useEffect(() => {
    if (!banner) return;
    const t = window.setTimeout(() => setBanner(null), 6000);
    return () => window.clearTimeout(t);
  }, [banner]);

  const gMode = useMemo(() => isGModePair(formulas, sellCurrency, buyCurrency), [formulas, sellCurrency, buyCurrency]);

  // Enforce pay-method restrictions based on SELL currency
  useEffect(() => {
    const allowed = allowedPayMethods(sellCurrency);
    if (!allowed.includes(payMethod)) setPayMethod(allowed[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellCurrency]);

  // Enforce receive-method restrictions based on BUY currency
  useEffect(() => {
    const allowed = allowedReceiveMethods(buyCurrency);
    if (!allowed.includes(receiveMethod)) setReceiveMethod(allowed[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyCurrency]);

  // Load rates (VND) + market (G)
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

    const loadBonuses = async () => {
      try {
        const b = await apiGetBonuses();
        if (alive && b?.ok) setBonuses(b.bonuses);
      } catch {
        // ignore
      }
    };

    const loadFormulas = async () => {
      try {
        const f = await apiGetGFormulas();
        if (alive && f?.ok && f.formulas && typeof f.formulas === "object") {
          setFormulas(f.formulas);
        }
      } catch {
        // ignore
      }
    };

    (async () => {
      setLoading(true);
      await Promise.allSettled([loadRates(), loadMarket(), loadBonuses(), loadFormulas()]);
      if (alive) setLoading(false);
    })();

    const mid = window.setInterval(loadMarket, 15 * 60 * 1000);
    return () => {
      alive = false;
      window.clearInterval(mid);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh status from server (in case it changed)
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

  const sellAmount = useMemo(() => parseAmount(sellCurrency, sellText), [sellCurrency, sellText]);
  const buyAmount = useMemo(() => parseAmount(buyCurrency, buyText), [buyCurrency, buyText]);

  // Re-format inputs when currency changes (e.g. USDT may have decimals)
  useEffect(() => {
    setSellText((t) => {
      const next = fmtFromInput(sellCurrency, t);
      return next === t ? t : next;
    });
  }, [sellCurrency]);

  useEffect(() => {
    setBuyText((t) => {
      const next = fmtFromInput(buyCurrency, t);
      return next === t ? t : next;
    });
  }, [buyCurrency]);

  const allowedPay = useMemo(() => allowedPayMethods(sellCurrency), [sellCurrency]);
  const allowedRecv = useMemo(() => allowedReceiveMethods(buyCurrency), [buyCurrency]);

  // Missing data check
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

    if (!rates) return ["VND rates"];
    if (sellCurrency !== "VND" && !getRate(rates, sellCurrency)) miss.push(sellCurrency);
    if (buyCurrency !== "VND" && !getRate(rates, buyCurrency)) miss.push(buyCurrency);
    return Array.from(new Set(miss));
  }, [gMode, market, rates, sellCurrency, buyCurrency]);

  const canCalc = missingRates.length === 0;

  // ======= Validations =======
  const invalidUsd = sellCurrency === "USD" && sellText.trim() !== "" && !isMultiple(sellAmount, 100);
  const invalidEur = sellCurrency === "EUR" && sellText.trim() !== "" && !isMultiple(sellAmount, 10);
  const invalidThbSell = sellCurrency === "THB" && sellText.trim() !== "" && !isMultiple(sellAmount, 100);
  const invalidThbBuy = buyCurrency === "THB" && buyText.trim() !== "" && !isMultiple(buyAmount, 100);

  const invalidVndBuy =
    buyCurrency === "VND" && receiveMethod === "atm" && buyText.trim() !== "" && !isMultiple(buyAmount, ATM_VND_STEP);

  const hasInvalid = invalidUsd || invalidEur || invalidThbSell || invalidThbBuy || invalidVndBuy;

  // ======= Recalc =======
  useEffect(() => {
    if (!canCalc) return;

    const formatComputed = (cur: Currency, n: number) => {
      if (!Number.isFinite(n)) return "";
      let v = n;
      if (cur === "VND") {
        v = receiveMethod === "atm" ? roundDown(v, ATM_VND_STEP) : Math.floor(v);
      } else {
        v = roundDown(v, amountStep(cur));
      }
      return fmtAmount(cur, v);
    };

    const formatComputedSell = (cur: Currency, n: number) => {
      if (!Number.isFinite(n)) return "";
      let v = n;
      // For computed sell, round UP to required step (so it's feasible)
      v = roundUp(v, amountStep(cur));
      return fmtAmount(cur, v);
    };

    if (gMode) {
      if (lastEdited.current === "sell") {
        const outRaw = calcBuyAmountG(market, formulas, sellCurrency, buyCurrency, sellAmount);
        const next = sellText.trim() !== "" && Number.isFinite(outRaw) ? formatComputed(buyCurrency, outRaw) : "";
        if (next !== buyText) setBuyText(next);
      } else {
        const needRaw = calcSellAmountG(market, formulas, sellCurrency, buyCurrency, buyAmount);
        const next = buyText.trim() !== "" && Number.isFinite(needRaw) ? formatComputedSell(sellCurrency, needRaw) : "";
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
        receiveMethod,
        bonuses
      );

      const outRaw = calcBuyAmountVnd(effectiveRates, sellCurrency, buyCurrency, sellAmount);
      const next = sellText.trim() !== "" && Number.isFinite(outRaw) ? formatComputed(buyCurrency, outRaw) : "";
      if (next !== buyText) setBuyText(next);
    } else {
      // Iteration is needed only because tier bonus depends on sellAmount
      let guess = calcSellAmountVnd(rates, sellCurrency, buyCurrency, buyAmount);

      for (let i = 0; i < 3; i++) {
        const effectiveRates = applyRateBonuses(
          rates,
          sellCurrency,
          buyCurrency,
          Number.isFinite(guess) ? guess : 0,
          clientStatus,
          payMethod,
          receiveMethod,
          bonuses
        );
        const nextGuess = calcSellAmountVnd(effectiveRates, sellCurrency, buyCurrency, buyAmount);
        if (!Number.isFinite(nextGuess)) break;
        if (Math.abs(nextGuess - guess) < 1e-7) {
          guess = nextGuess;
          break;
        }
        guess = nextGuess;
      }

      const next = buyText.trim() !== "" && Number.isFinite(guess) ? formatComputedSell(sellCurrency, guess) : "";
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
    formulas,
    bonuses,
    payMethod,
    receiveMethod,
    clientStatus,
    canCalc,
    gMode,
  ]);

  const rateInfo = useMemo(() => {
    // бонусы показываем только для * -> VND, и только если НЕ gMode
    if (gMode) return null;
    if (!rates) return null;
    if (buyCurrency !== "VND") return null;
    if (!(sellCurrency === "RUB" || sellCurrency === "USD" || sellCurrency === "USDT")) return null;

    const base = getRate(rates, sellCurrency)?.buy_vnd ?? null;
    if (!base) return null;

    const tier = tierBonusForRate(sellCurrency, sellAmount, clientStatus, bonuses);
    const m = methodBonusForRate(sellCurrency, buyCurrency, payMethod, receiveMethod, bonuses);
    return { base, tier, m, eff: base + tier + m };
  }, [gMode, rates, buyCurrency, sellCurrency, sellAmount, clientStatus, payMethod, receiveMethod, bonuses]);

  const canSendBase =
    canCalc && sellCurrency !== buyCurrency && sellText.trim() !== "" && buyText.trim() !== "" && sellAmount > 0 && buyAmount > 0;

  const canSend = canSendBase && !hasInvalid;

  const usdNote =
    sellCurrency === "USD"
      ? "На обмен принимаются только доллары номиналом 100$ нового образца (синие), без надписей и дефектов."
      : null;

  const eurNote =
    sellCurrency === "EUR" ? "На обмен принимаются только банкноты EURO без надписей и дефектов." : null;

  const atmVndNoteText =
    "сумма получения в банкомате должна быть кратной 100,000 VND. Вы можете ввести сумму получения и калькулятор посчитает сумму к оплате.";

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

    const initData = tg?.initData || me.initData || "";
    if (!initData) {
      tg?.showAlert?.("Нет initData. Открой мини-приложение через Telegram (/start).");
      return;
    }

    const payload = {
      sellCurrency,
      buyCurrency,
      sellAmount,
      buyAmount,
      payMethod,
      receiveMethod,
    };

    // 1) Always create the request on the server (so it appears in admin panel instantly)
    let requestId: string | null = null;
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `tma ${initData}`,
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!json?.ok) {
        tg?.HapticFeedback?.notificationOccurred?.("error");
        tg?.showAlert?.(`Ошибка: ${json?.error || "fail"}`);
        return;
      }
      requestId = String(json?.id || "");
      tg?.HapticFeedback?.notificationOccurred?.("success");
    } catch (e: any) {
      tg?.HapticFeedback?.notificationOccurred?.("error");
      tg?.showAlert?.(`Ошибка сети: ${e?.message || e}`);
      return;
    }

    // 2) UX: show confirmation прямо в приложении.
    // Заявка уходит в группу менеджеров через бота (на сервере).
    setBanner({
      type: "ok",
      text: "Ваша заявка принята в работу, в ближайшее время с вами свяжется менеджер 🙌",
    });

    // Optional: clear inputs after submit
    setSellText("");
    setBuyText("");
  }

  return (
    <div className="vx-calc">
      <div className="vx-calcTitle">
        <div className="vx-muted">Статус: {statusLabel(clientStatus)}</div>
      </div>

      {banner ? (
        <div className={banner.type === "err" ? "vx-toast vx-toastErr" : "vx-toast vx-toastOk"}>{banner.text}</div>
      ) : null}

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
            inputMode={sellCurrency === "USDT" ? "decimal" : "numeric"}
            placeholder="Отдаю"
            value={sellText}
            className={invalidUsd || invalidEur || invalidThbSell ? "vx-inputInvalid" : ""}
            onChange={(e) => {
              lastEdited.current = "sell";
              setSellText(fmtFromInput(sellCurrency, e.target.value));
            }}
          />

          <button type="button" onClick={swapCurrencies} className="vx-iconBtn" title="Поменять местами">
            ⇄
          </button>
        </div>

        <div className="vx-sp10" />

        <div className="vx-exRow">
          <select value={buyCurrency} onChange={(e) => setBuyCurrency(e.target.value as Currency)}>
            {CURRENCY_OPTIONS.map((c) => (
              <option key={"buy-" + c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <input
            inputMode={buyCurrency === "USDT" ? "decimal" : "numeric"}
            placeholder="Получаю"
            value={buyText}
            className={invalidVndBuy ? "vx-inputInvalid" : ""}
            onChange={(e) => {
              lastEdited.current = "buy";
              setBuyText(fmtFromInput(buyCurrency, e.target.value));
            }}
          />

          <div className="vx-blankBtn" />
        </div>

        <div className="vx-sectionTitle">Оплата</div>
        <div className="vx-methods">
          {ALL_PAY.map((m) => {
            const disabled = !allowedPay.includes(m);
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
                role="button"
                aria-disabled={disabled}
              >
                {methodLabel(m)}
              </div>
            );
          })}
        </div>

        <div className="vx-sectionTitle">Получение</div>
        <div className="vx-methods">
          {ALL_RECEIVE.map((m) => {
            const disabled = !allowedRecv.includes(m);
            return (
              <div
                key={m}
                className={
                  "vx-pill " +
                  (receiveMethod === m ? "vx-pillActive " : "") +
                  (disabled ? "vx-pillDisabled" : "")
                }
                onClick={() => {
                  if (!disabled) setReceiveMethod(m);
                }}
                role="button"
                aria-disabled={disabled}
              >
                {methodLabel(m)}
              </div>
            );
          })}
        </div>

        {usdNote ? <div className="vx-note">{usdNote}</div> : null}
        {eurNote ? <div className="vx-note">{eurNote}</div> : null}

        {buyCurrency === "VND" && receiveMethod === "atm" ? (
          <div className={"vx-note " + (invalidVndBuy ? "vx-noteWarn" : "")}>{atmVndNoteText}</div>
        ) : null}

        {rateInfo ? (
          <div className="vx-rateLine">
            Курс: <b>{fmtAmount("VND", rateInfo.base)}</b> + статус <b>{fmtAmount("VND", rateInfo.tier)}</b> + способ{" "}
            <b>{fmtAmount("VND", rateInfo.m)}</b> = <b>{fmtAmount("VND", rateInfo.eff)}</b>
          </div>
        ) : gMode ? (
          <div className="vx-rateLine">
            Для этой пары используется <b>G</b>-курс по формуле (без бонусов/банкомата).
          </div>
        ) : null}

        {!canCalc ? <div className="vx-warn">Не хватает данных для расчёта: {missingRates.join(", ")}</div> : null}

        {invalidUsd ? <div className="vx-warn">USD: сумма должна быть кратна 100.</div> : null}
        {invalidEur ? <div className="vx-warn">EUR: сумма должна быть кратна 10.</div> : null}
        {invalidThbSell || invalidThbBuy ? <div className="vx-warn">THB: сумма должна быть кратна 100.</div> : null}

        <div className="vx-sp12" />

        <button className="vx-primary" disabled={!canSend} onClick={sendRequest}>
          Отправить заявку
        </button>
      </div>
    </div>
  );
}
