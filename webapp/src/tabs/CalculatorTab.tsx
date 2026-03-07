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

function amountMaxDecimals(cur: Currency): number {
  if (cur === "USDT") return 8;
  if (cur === "VND") return 0;
  return 6;
}

function countDigits(value: string): number {
  return String(value ?? "").replace(/\D+/g, "").length;
}

function detectDecimalSeparator(unsigned: string, maxDecimals: number): { index: number; char: "." | "," | null } {
  if (maxDecimals <= 0) return { index: -1, char: null };

  const dotIndex = unsigned.lastIndexOf(".");
  if (dotIndex >= 0) {
    const rightDigits = unsigned.slice(dotIndex + 1).replace(/\D+/g, "");
    if (rightDigits.length <= maxDecimals) {
      return { index: dotIndex, char: "." };
    }
  }

  const commaMatches = [...unsigned.matchAll(/,/g)].map((m) => m.index ?? -1).filter((n) => n >= 0);
  if (commaMatches.length === 1) {
    const commaIndex = commaMatches[0];
    const leftDigits = countDigits(unsigned.slice(0, commaIndex));
    const rightDigits = unsigned.slice(commaIndex + 1).replace(/\D+/g, "");
    const looksLikeThousands = rightDigits.length === 3 && leftDigits >= 1;
    if (!looksLikeThousands && rightDigits.length <= maxDecimals) {
      return { index: commaIndex, char: "," };
    }
  }

  return { index: -1, char: null };
}

function normalizeTypedNumber(rawInput: string, maxDecimals: number) {
  const raw = String(rawInput ?? "").replace(/\s+/g, "").replace(/[^\d.,-]/g, "");
  if (!raw) return { intPart: "", decPart: "", hasSep: false, text: "" };

  const sign = raw.startsWith("-") ? "-" : "";
  const unsigned = raw.replace(/-/g, "");
  const sepInfo = detectDecimalSeparator(unsigned, maxDecimals);
  const hasSep = sepInfo.index >= 0;

  let intPart = "";
  let decPart = "";
  if (hasSep) {
    intPart = unsigned.slice(0, sepInfo.index).replace(/\D+/g, "");
    decPart = unsigned.slice(sepInfo.index + 1).replace(/\D+/g, "").slice(0, maxDecimals);
  } else {
    intPart = unsigned.replace(/\D+/g, "");
  }

  const grouped = fmtGroupedInt(intPart);
  const text = sign + (hasSep ? `${grouped || "0"}.${decPart}` : grouped);
  return { intPart, decPart, hasSep, text };
}

function parseAmount(cur: Currency, input: string): number {
  const maxDecimals = amountMaxDecimals(cur);
  const norm = normalizeTypedNumber(input, maxDecimals);
  if (!norm.intPart && !norm.decPart) return 0;
  const numText = norm.decPart ? `${norm.intPart || "0"}.${norm.decPart}` : norm.intPart || "0";
  const n = Number(numText);
  return Number.isFinite(n) ? n : 0;
}

function formatExact(cur: Currency, n: number): string {
  if (!Number.isFinite(n)) return "";
  const maxDecimals = amountMaxDecimals(cur);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const plain = abs.toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits: maxDecimals,
  });
  let [intPart, decPart = ""] = plain.split(".");
  intPart = fmtGroupedInt(intPart);
  if (maxDecimals <= 0) return sign + intPart;
  decPart = decPart.replace(/0+$/, "");
  return sign + (decPart ? `${intPart}.${decPart}` : intPart);
}

function fmtAmount(cur: Currency, n: number): string {
  return formatExact(cur, n);
}

function fmtFromInput(cur: Currency, v: string): string {
  const maxDecimals = amountMaxDecimals(cur);
  const raw = String(v ?? "").replace(/\s+/g, "");
  if (!raw) return "";
  const norm = normalizeTypedNumber(raw, maxDecimals);
  if (!norm.intPart && !norm.decPart) return "";
  if (norm.hasSep) return norm.text;
  return norm.text.replace(/\.$/, "");
}

function isMultiple(n: number, step: number) {
  if (!Number.isFinite(n) || step <= 0) return false;
  const q = n / step;
  return Math.abs(q - Math.round(q)) < 1e-9;
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
// VND -> наличные или перевод
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

  return { buy: G * f.buyMul, sell: G * f.sellMul };
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

const ATM_VND_STEP = 100000;
const CASH_VND_STEP = 10000;
const USD_STEP = 100;
const EUR_STEP = 50;
const THB_STEP = 100;

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
  const skipNextRecalc = useRef(false);
  const preserveSwappedValuesRef = useRef(false);
  const skipNextCurrencyNormalizeCount = useRef(0);
  const sellRawRef = useRef<number | null>(null);
  const buyRawRef = useRef<number | null>(null);

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
    if (skipNextCurrencyNormalizeCount.current > 0) {
      skipNextCurrencyNormalizeCount.current -= 1;
      return;
    }
    setSellText((t) => {
      const next = fmtFromInput(sellCurrency, t);
      sellRawRef.current = next.trim() ? parseAmount(sellCurrency, next) : null;
      return next === t ? t : next;
    });
  }, [sellCurrency]);

  useEffect(() => {
    if (skipNextCurrencyNormalizeCount.current > 0) {
      skipNextCurrencyNormalizeCount.current -= 1;
      return;
    }
    setBuyText((t) => {
      const next = fmtFromInput(buyCurrency, t);
      buyRawRef.current = next.trim() ? parseAmount(buyCurrency, next) : null;
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
  const invalidUsdSell = sellCurrency === "USD" && sellText.trim() !== "" && !isMultiple(sellAmount, USD_STEP);
  const invalidUsdBuy = buyCurrency === "USD" && buyText.trim() !== "" && !isMultiple(buyAmount, USD_STEP);
  const invalidEurSell = sellCurrency === "EUR" && sellText.trim() !== "" && !isMultiple(sellAmount, EUR_STEP);
  const invalidEurBuy = buyCurrency === "EUR" && buyText.trim() !== "" && !isMultiple(buyAmount, EUR_STEP);
  const invalidThbSell = sellCurrency === "THB" && sellText.trim() !== "" && !isMultiple(sellAmount, THB_STEP);
  const invalidThbBuy = buyCurrency === "THB" && buyText.trim() !== "" && !isMultiple(buyAmount, THB_STEP);
  const invalidVndSellCash =
    sellCurrency === "VND" && payMethod === "cash" && sellText.trim() !== "" && !isMultiple(sellAmount, CASH_VND_STEP);
  const invalidVndBuyCash =
    buyCurrency === "VND" && receiveMethod === "cash" && buyText.trim() !== "" && !isMultiple(buyAmount, CASH_VND_STEP);
  const invalidVndBuyAtm =
    buyCurrency === "VND" && receiveMethod === "atm" && buyText.trim() !== "" && !isMultiple(buyAmount, ATM_VND_STEP);

  const hasInvalid =
    invalidUsdSell ||
    invalidUsdBuy ||
    invalidEurSell ||
    invalidEurBuy ||
    invalidThbSell ||
    invalidThbBuy ||
    invalidVndSellCash ||
    invalidVndBuyCash ||
    invalidVndBuyAtm;

  // ======= Recalc =======
  useEffect(() => {
    if (skipNextRecalc.current) {
      skipNextRecalc.current = false;
      return;
    }

    if (preserveSwappedValuesRef.current) return;
    if (!canCalc) return;

    const formatComputed = (cur: Currency, n: number) => {
      if (!Number.isFinite(n)) return "";
      return fmtAmount(cur, n);
    };

    const formatComputedSell = (cur: Currency, n: number) => {
      if (!Number.isFinite(n)) return "";
      return fmtAmount(cur, n);
    };

    if (gMode) {
      if (lastEdited.current === "sell") {
        const outRaw = calcBuyAmountG(market, formulas, sellCurrency, buyCurrency, sellAmount);
        const next = sellText.trim() !== "" && Number.isFinite(outRaw) ? formatComputed(buyCurrency, outRaw) : "";
        buyRawRef.current = next ? outRaw : null;
        if (next !== buyText) setBuyText(next);
      } else {
        const needRaw = calcSellAmountG(market, formulas, sellCurrency, buyCurrency, buyAmount);
        const next = buyText.trim() !== "" && Number.isFinite(needRaw) ? formatComputedSell(sellCurrency, needRaw) : "";
        sellRawRef.current = next ? needRaw : null;
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
      buyRawRef.current = next ? outRaw : null;
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
      sellRawRef.current = next ? guess : null;
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
    sellCurrency === "USD" || buyCurrency === "USD"
      ? "USD: клиент может передать и получить только наличные доллары номиналом 100$ нового образца, без надписей и дефектов."
      : null;

  const eurNote =
    sellCurrency === "EUR" || buyCurrency === "EUR"
      ? "EUR: клиент может передать и получить только наличные купюры по 50€ нового образца, без надписей и дефектов."
      : null;

  const vndNote =
    sellCurrency === "VND" || buyCurrency === "VND"
      ? "VND: банкомат — только выдача кратно 100,000; наличные — передача и получение кратно 10,000; перевод — любая сумма."
      : null;

  const thbNote =
    sellCurrency === "THB" || buyCurrency === "THB"
      ? "THB: передать и получить баты можно только наличными, кратно 100 бат."
      : null;

  const atmVndNoteText =
    "Сумма получения в банкомате должна быть кратной 100,000 VND. Вы можете ввести сумму получения, а калькулятор посчитает сумму к оплате без округления.";

  function swapCurrencies() {
    const nextSellCurrency = buyCurrency;
    const nextBuyCurrency = sellCurrency;

    const swappedPayCandidate: PayMethod | null = receiveMethod === "cash" || receiveMethod === "transfer" ? receiveMethod : null;
    const swappedReceiveCandidate: ReceiveMethod | null = payMethod === "cash" || payMethod === "transfer" ? payMethod : null;

    const nextAllowedPay = allowedPayMethods(nextSellCurrency);
    const nextAllowedReceive = allowedReceiveMethods(nextBuyCurrency);

    const nextPayMethod = swappedPayCandidate && nextAllowedPay.includes(swappedPayCandidate)
      ? swappedPayCandidate
      : nextAllowedPay[0];

    const nextReceiveMethod = swappedReceiveCandidate && nextAllowedReceive.includes(swappedReceiveCandidate)
      ? swappedReceiveCandidate
      : nextAllowedReceive[0];

    const currentSellRaw = sellText.trim() !== "" ? (sellRawRef.current ?? sellAmount) : null;
    const currentBuyRaw = buyText.trim() !== "" ? (buyRawRef.current ?? buyAmount) : null;

    preserveSwappedValuesRef.current = true;
    skipNextRecalc.current = true;
    skipNextCurrencyNormalizeCount.current = 2;
    lastEdited.current = "sell";
    sellRawRef.current = currentBuyRaw;
    buyRawRef.current = currentSellRaw;
    setSellCurrency(nextSellCurrency);
    setBuyCurrency(nextBuyCurrency);
    setPayMethod(nextPayMethod);
    setReceiveMethod(nextReceiveMethod);
    setSellText(currentBuyRaw != null && Number.isFinite(currentBuyRaw) ? formatExact(nextSellCurrency, currentBuyRaw) : "");
    setBuyText(currentSellRaw != null && Number.isFinite(currentSellRaw) ? formatExact(nextBuyCurrency, currentSellRaw) : "");
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
          <select value={sellCurrency} onChange={(e) => {
            preserveSwappedValuesRef.current = false;
            setSellCurrency(e.target.value as Currency);
          }}>
            {CURRENCY_OPTIONS.map((c) => (
              <option key={"sell-" + c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <input
            inputMode={sellCurrency === "VND" ? "numeric" : "decimal"}
            placeholder="Отдаю"
            value={sellText}
            className={invalidUsdSell || invalidEurSell || invalidThbSell || invalidVndSellCash ? "vx-inputInvalid" : ""}
            onChange={(e) => {
              preserveSwappedValuesRef.current = false;
              lastEdited.current = "sell";
              const next = fmtFromInput(sellCurrency, e.target.value);
              sellRawRef.current = next.trim() ? parseAmount(sellCurrency, next) : null;
              setSellText(next);
            }}
          />

          <button type="button" onClick={swapCurrencies} className="vx-iconBtn" title="Поменять местами">
            ⇄
          </button>
        </div>

        <div className="vx-sp10" />

        <div className="vx-exRow">
          <select value={buyCurrency} onChange={(e) => {
            preserveSwappedValuesRef.current = false;
            setBuyCurrency(e.target.value as Currency);
          }}>
            {CURRENCY_OPTIONS.map((c) => (
              <option key={"buy-" + c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <input
            inputMode={buyCurrency === "VND" ? "numeric" : "decimal"}
            placeholder="Получаю"
            value={buyText}
            className={invalidUsdBuy || invalidEurBuy || invalidThbBuy || invalidVndBuyCash || invalidVndBuyAtm ? "vx-inputInvalid" : ""}
            onChange={(e) => {
              preserveSwappedValuesRef.current = false;
              lastEdited.current = "buy";
              const next = fmtFromInput(buyCurrency, e.target.value);
              buyRawRef.current = next.trim() ? parseAmount(buyCurrency, next) : null;
              setBuyText(next);
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
                  if (!disabled) {
                    preserveSwappedValuesRef.current = false;
                    setPayMethod(m);
                  }
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
                  if (!disabled) {
                    preserveSwappedValuesRef.current = false;
                    setReceiveMethod(m);
                  }
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
        {vndNote ? <div className="vx-note">{vndNote}</div> : null}
        {thbNote ? <div className="vx-note">{thbNote}</div> : null}

        {buyCurrency === "VND" && receiveMethod === "atm" ? (
          <div className={"vx-note " + (invalidVndBuyAtm ? "vx-noteWarn" : "")}>{atmVndNoteText}</div>
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

        {invalidUsdSell || invalidUsdBuy ? <div className="vx-warn">USD: передать и получить можно только наличными, кратно 100.</div> : null}
        {invalidEurSell || invalidEurBuy ? <div className="vx-warn">EUR: передать и получить можно только наличными, кратно 50.</div> : null}
        {invalidThbSell || invalidThbBuy ? <div className="vx-warn">THB: передать и получить можно только наличными, кратно 100.</div> : null}
        {invalidVndSellCash || invalidVndBuyCash ? <div className="vx-warn">VND наличными: сумма должна быть кратна 10,000.</div> : null}
        {invalidVndBuyAtm ? <div className="vx-warn">VND в банкомате: сумма должна быть кратна 100,000.</div> : null}

        <div className="vx-sp12" />

        <button className="vx-primary" disabled={!canSend} onClick={sendRequest}>
          Отправить заявку
        </button>
      </div>
    </div>
  );
}
