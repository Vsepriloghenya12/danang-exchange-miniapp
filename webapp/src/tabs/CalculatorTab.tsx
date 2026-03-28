import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiGetBonuses, apiGetGFormulas, apiGetMarketRates } from "../lib/api";
import type { BonusesConfig, MarketRatesResponse, UserStatus } from "../lib/types";

type Currency = "RUB" | "USDT" | "USD" | "EUR" | "THB" | "VND";
type ReceiveMethod = "cash" | "transfer" | "atm";
type PayMethod = "cash" | "transfer" | "atm";

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
    hasSavedContact?: boolean;
    adminChat?: { tgId: number | null; username?: string; deepLink?: string };
  };
};

const CURRENCY_OPTIONS: Currency[] = ["RUB", "USDT", "USD", "EUR", "THB", "VND"];
const ALL_PAY: PayMethod[] = ["cash", "transfer", "atm"];
const ALL_RECEIVE: ReceiveMethod[] = ["cash", "transfer", "atm"];

// Формулы с картинки (на эти пары НЕ действуют бонусы/надбавки)
const DEFAULT_G_FORMULAS: Record<string, { buyMul: number; sellMul: number }> = {
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

function shortRequestId(id: string) {
  const s = String(id || "").trim();
  return s.length > 6 ? s.slice(-6) : s;
}

function CopyIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="10" height="10" rx="2" />
      <path d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

async function copyPlainText(value: string) {
  const text = String(value || "");
  if (!text) return false;
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallback below
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "true");
    el.style.position = "fixed";
    el.style.opacity = "0";
    el.style.pointerEvents = "none";
    document.body.appendChild(el);
    el.focus();
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
    return true;
  } catch {
    return false;
  }
}

function openManagerContactLink(me?: Props["me"]) {
  const tg = getTg();
  const deepLink = String(me?.adminChat?.deepLink || "").trim();
  const username = String(me?.adminChat?.username || "manager_exchange_vn").trim().replace(/^@+/, "");
  const url = deepLink || (username ? `https://t.me/${username}` : "https://t.me/manager_exchange_vn");
  if (tg?.openTelegramLink && /^https:\/\/t\.me\//i.test(url)) tg.openTelegramLink(url);
  else if (tg?.openLink) tg.openLink(url);
  else window.open(url, "_blank", "noopener,noreferrer");
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
  // In calculator only USDT may have fractional part. All other currencies are shown and entered as whole numbers.
  if (cur === "USDT") return 1;
  return 0;
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
    const looksLikeThousands = leftDigits >= 1 && rightDigits.length >= 3;
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

function getDanangTimeInfo(nowMs: number) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(nowMs));
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    const hh = String(Number.isFinite(hour) ? hour : 0).padStart(2, "0");
    const mm = String(Number.isFinite(minute) ? minute : 0).padStart(2, "0");
    return {
      hour: Number.isFinite(hour) ? hour : 0,
      minute: Number.isFinite(minute) ? minute : 0,
      label: `${hh}:${mm}`,
    };
  } catch {
    const d = new Date(nowMs);
    const hour = d.getHours();
    const minute = d.getMinutes();
    return {
      hour,
      minute,
      label: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    };
  }
}

function methodLabel(m: ReceiveMethod | PayMethod) {
  if (m === "cash") return "Наличные";
  if (m === "transfer") return "Перевод";
  return "Банкомат";
}

function amountPlaceholder(prefix: string, cur: Currency, isVndToVnd = false): string {
  const min = isVndToVnd && cur === "VND" ? null : minSellAmountLabel(cur);
  return min ? `${prefix} (мин. ${min})` : prefix;
}

function requestCommentPlaceholder(receiveMethod: ReceiveMethod): string {
  if (receiveMethod === "cash") return "укажите адрес";
  if (receiveMethod === "transfer") return "укажите реквизиты для получения";
  return "";
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
// VND -> наличные или перевод, а для VND -> VND доступны все способы
function rubCashAllowed(
  sellCurrency: Currency,
  buyCurrency: Currency,
  sellAmount?: number,
  buyAmount?: number
): boolean {
  if (sellCurrency === "RUB") return sellAmount != null && sellAmount >= 20_000;
  if (buyCurrency === "RUB") return buyAmount != null && buyAmount >= 20_000;
  return true;
}

function allowedPayMethods(sellCurrency: Currency, buyCurrency: Currency, sellAmount?: number, buyAmount?: number): PayMethod[] {
  if (sellCurrency === "VND" && buyCurrency === "VND") return ["cash", "transfer", "atm"];
  const rubCashOk = rubCashAllowed(sellCurrency, buyCurrency, sellAmount, buyAmount);
  if (sellCurrency === "USDT") return ["transfer"];
  if (sellCurrency === "RUB") return ["transfer"];
  if (sellCurrency === "USD" || sellCurrency === "EUR" || sellCurrency === "THB") return rubCashOk ? ["cash"] : [];
  return rubCashOk ? ["cash", "transfer"] : ["transfer"]; // VND
}

// ======= Способы получения (что клиент ПОЛУЧАЕТ) =======
function allowedReceiveMethods(buyCurrency: Currency, sellCurrency?: Currency, buyAmount?: number, sellAmount?: number): ReceiveMethod[] {
  if (sellCurrency === "VND" && buyCurrency === "VND") return ["cash", "transfer", "atm"];
  const rubCashOk = rubCashAllowed(sellCurrency || "VND", buyCurrency, sellAmount, buyAmount);
  if (buyCurrency === "VND") return rubCashOk ? ["cash", "transfer", "atm"] : ["transfer", "atm"];
  if (buyCurrency === "USDT") return ["transfer"];
  if (buyCurrency === "RUB") return rubCashOk ? ["cash", "transfer"] : ["transfer"];
  return rubCashOk ? ["cash"] : []; // USD/EUR/THB
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

const VND_TO_VND_FEE_RATE = 0.02;
const VND_TO_VND_MIN_FEE = 100_000;
const VND_TO_VND_RATE_THRESHOLD = VND_TO_VND_MIN_FEE / VND_TO_VND_FEE_RATE; // 5,000,000
const VND_TO_VND_BUY_THRESHOLD = VND_TO_VND_RATE_THRESHOLD - VND_TO_VND_MIN_FEE; // 4,900,000

function calcBuyAmountSameVnd(sellAmount: number): number {
  if (sellAmount <= 0) return 0;
  const fee = Math.max(VND_TO_VND_MIN_FEE, sellAmount * VND_TO_VND_FEE_RATE);
  return Math.max(0, sellAmount - fee);
}

function calcSellAmountSameVnd(buyAmount: number): number {
  if (buyAmount <= 0) return 0;
  if (buyAmount <= VND_TO_VND_BUY_THRESHOLD) return buyAmount + VND_TO_VND_MIN_FEE;
  return buyAmount / (1 - VND_TO_VND_FEE_RATE);
}

// ---------- G-конвертация ----------
function isGModePair(formulas: Record<string, { buyMul: number; sellMul: number }>, a: Currency, b: Currency): boolean {
  if (a === "VND" || b === "VND") return false;
  return !!formulas[`${a}/${b}`] || !!formulas[`${b}/${a}`];
}

function gRateDecimals(base: Currency, quote: Currency): number {
  return base === "USD" && quote === "USDT" ? 3 : 1;
}

function roundRate(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
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

  const decimals = gRateDecimals(base, quote);
  return {
    buy: roundRate(G * f.buyMul, decimals),
    sell: roundRate(G * f.sellMul, decimals),
  };
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
const MIN_SELL_AMOUNTS: Record<Currency, number> = {
  RUB: 10_000,
  USDT: 200,
  USD: 200,
  EUR: 200,
  THB: 10_000,
  VND: 6_500_000,
};

function minSellAmountLabel(cur: Currency): string {
  const value = MIN_SELL_AMOUNTS[cur];
  if (cur === "RUB") return `${fmtAmount(cur, value)} ₽`;
  return `${fmtAmount(cur, value)} ${cur}`;
}

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
  const [requestComment, setRequestComment] = useState("");
  const [showConditions, setShowConditions] = useState(false);
  const [requestSuccessModal, setRequestSuccessModal] = useState<null | { requestId: string; copyText: string }>(null);
  const [commentKeyboardInset, setCommentKeyboardInset] = useState(0);

  const commentFieldRef = useRef<HTMLTextAreaElement | null>(null);
  const commentComposerRef = useRef<HTMLDivElement | null>(null);

  const [banner, setBanner] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [danangNowMs, setDanangNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!banner) return;
    const t = window.setTimeout(() => setBanner(null), 6000);
    return () => window.clearTimeout(t);
  }, [banner]);


  useEffect(() => {
    const t = window.setInterval(() => setDanangNowMs(Date.now()), 60000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const updateInset = () => {
      if (document.activeElement !== commentFieldRef.current) {
        setCommentKeyboardInset(0);
        return;
      }
      const raw = Math.max(0, Math.round(window.innerHeight - (vv.height + vv.offsetTop)));
      setCommentKeyboardInset(raw > 60 ? raw + 10 : 0);
      window.setTimeout(() => {
        commentComposerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }, 30);
    };

    vv.addEventListener("resize", updateInset);
    vv.addEventListener("scroll", updateInset);
    window.addEventListener("orientationchange", updateInset);
    return () => {
      vv.removeEventListener("resize", updateInset);
      vv.removeEventListener("scroll", updateInset);
      window.removeEventListener("orientationchange", updateInset);
    };
  }, []);

  const danangTime = useMemo(() => getDanangTimeInfo(danangNowMs), [danangNowMs]);
  const managerOffline = danangTime.hour >= 22 || danangTime.hour < 10;
  const deliveryClosed = danangTime.hour >= 20 && danangTime.hour < 22;

  const gMode = useMemo(() => isGModePair(formulas, sellCurrency, buyCurrency), [formulas, sellCurrency, buyCurrency]);

  // Enforce pay-method restrictions based on SELL currency
  useEffect(() => {
    const allowed = allowedPayMethods(sellCurrency, buyCurrency, parseAmount(sellCurrency, sellText), parseAmount(buyCurrency, buyText));
    if (!allowed.includes(payMethod)) setPayMethod(allowed[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellCurrency, buyCurrency, sellText]);

  // Enforce receive-method restrictions based on BUY currency and service hours
  useEffect(() => {
    const baseAllowed = allowedReceiveMethods(
      buyCurrency,
      sellCurrency,
      parseAmount(buyCurrency, buyText),
      parseAmount(sellCurrency, sellText)
    );
    const allowed = deliveryClosed && !(sellCurrency === "VND" && buyCurrency === "VND")
      ? baseAllowed.filter((m) => m === "transfer" || m === "atm")
      : baseAllowed;
    if (allowed.length > 0 && !allowed.includes(receiveMethod)) setReceiveMethod(allowed[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyCurrency, sellCurrency, buyText, sellText, deliveryClosed]);

  // Load rates (VND) + market (G)
  useEffect(() => {
    tg?.ready?.();
    tg?.expand?.();

    let alive = true;

    const loadRates = async () => {
      try {
        const res = await fetch(`/api/rates/today?_=${Date.now()}`, { cache: "no-store" });
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

    const refreshRatesIfVisible = () => {
      if (document.visibilityState === "visible") {
        void loadRates();
      }
    };

    (async () => {
      setLoading(true);
      await Promise.allSettled([loadRates(), loadMarket(), loadBonuses(), loadFormulas()]);
      if (alive) setLoading(false);
    })();

    const rid = window.setInterval(() => {
      void loadRates();
    }, 30_000);
    const mid = window.setInterval(() => {
      void loadMarket();
    }, 15 * 60 * 1000);
    document.addEventListener("visibilitychange", refreshRatesIfVisible);
    window.addEventListener("focus", refreshRatesIfVisible);

    return () => {
      alive = false;
      window.clearInterval(rid);
      window.clearInterval(mid);
      document.removeEventListener("visibilitychange", refreshRatesIfVisible);
      window.removeEventListener("focus", refreshRatesIfVisible);
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

  const allowedPay = useMemo(() => allowedPayMethods(sellCurrency, buyCurrency, sellAmount, buyAmount), [sellCurrency, buyCurrency, sellAmount, buyAmount]);
  const allowedRecv = useMemo(() => {
    const baseAllowed = allowedReceiveMethods(buyCurrency, sellCurrency, buyAmount, sellAmount);
    return deliveryClosed && !(sellCurrency === "VND" && buyCurrency === "VND")
      ? baseAllowed.filter((m) => m === "transfer" || m === "atm")
      : baseAllowed;
  }, [buyCurrency, sellCurrency, buyAmount, sellAmount, deliveryClosed]);
  const receiveMethodUnavailableByHours = deliveryClosed && allowedRecv.length === 0;

  // Missing data check
  const missingRates = useMemo(() => {
    const miss: string[] = [];

    if (sellCurrency === "VND" && buyCurrency === "VND") {
      return [];
    }

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
  const invalidMinSell =
    sellText.trim() !== "" &&
    sellAmount > 0 &&
    !(sellCurrency === "VND" && buyCurrency === "VND") &&
    sellAmount < MIN_SELL_AMOUNTS[sellCurrency];

  const hasInvalid =
    invalidUsdSell ||
    invalidUsdBuy ||
    invalidEurSell ||
    invalidEurBuy ||
    invalidThbSell ||
    invalidThbBuy ||
    invalidVndSellCash ||
    invalidVndBuyCash ||
    invalidVndBuyAtm ||
    invalidMinSell;

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

    if (sellCurrency === "VND" && buyCurrency === "VND") {
      if (lastEdited.current === "sell") {
        const outRaw = calcBuyAmountSameVnd(sellAmount);
        const next = sellText.trim() !== "" && Number.isFinite(outRaw) ? formatComputed(buyCurrency, outRaw) : "";
        buyRawRef.current = next ? outRaw : null;
        if (next !== buyText) setBuyText(next);
      } else {
        const needRaw = calcSellAmountSameVnd(buyAmount);
        const next = buyText.trim() !== "" && Number.isFinite(needRaw) ? formatComputedSell(sellCurrency, needRaw) : "";
        sellRawRef.current = next ? needRaw : null;
        if (next !== sellText) setSellText(next);
      }
      return;
    }

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

  const sameCurrencyAllowed = sellCurrency === buyCurrency ? sellCurrency === "VND" && buyCurrency === "VND" : true;
  const isVndToVnd = sellCurrency === "VND" && buyCurrency === "VND";

  const canSendBase =
    canCalc && sameCurrencyAllowed && sellText.trim() !== "" && buyText.trim() !== "" && sellAmount > 0 && buyAmount > 0;

  const canSend = canSendBase && !hasInvalid && !managerOffline && !receiveMethodUnavailableByHours && allowedRecv.includes(receiveMethod);

  const usdNote =
    sellCurrency === "USD" || buyCurrency === "USD"
      ? "USD: вы можете передать и получить только наличные доллары номиналом 100$ нового образца, без надписей и дефектов."
      : null;

  const eurNote =
    sellCurrency === "EUR" || buyCurrency === "EUR"
      ? "EUR: вы можете передать и получить только наличные купюры по 50€ нового образца, без надписей и дефектов."
      : null;

  const vndNote =
    isVndToVnd
      ? "VND → VND: доступна выдача и получение всеми способами. Комиссия 2%, но не меньше 100,000 VND."
      : null;

  const thbNote =
    sellCurrency === "THB" || buyCurrency === "THB"
      ? "THB: передать и получить баты можно только наличными, кратно 100 бат."
      : null;

  const minSellNote = invalidMinSell
    ? `Минимальная сумма ${sellCurrency} для обмена — ${minSellAmountLabel(sellCurrency)}.`
    : null;

  const conditionsItems = useMemo(() => ([
    "Время работы сервиса: ежедневно с 10:00 до 22:00. После 20:00 возможен только дистанционный обмен.",
    "Минимальная сумма RUB для обмена — 10,000 ₽.",
    "Минимальная сумма USD / EUR / USDT для обмена — 200.",
    "Минимальная сумма THB для обмена — 10,000 бат.",
    "Минимальная сумма VND для обмена — 6,500,000 VND.",
    "Доставка наличных возможна при обмене от 20,000₽/100$/100USDT.",
    "USD: принимаются и выдаются только наличные купюры 100$ нового образца, без дефектов.",
    "EUR: принимаются и выдаются только наличные купюры 50€ нового образца, без дефектов.",
    "THB: передача и получение только наличными, кратно 100 бат.",
    "VND → VND: комиссия 2%, но не меньше 100,000 VND. Доступны наличные, перевод и банкомат.",
  ]), []);

  function swapCurrencies() {
    const nextSellCurrency = buyCurrency;
    const nextBuyCurrency = sellCurrency;
    const currentSellRaw = sellText.trim() !== "" ? (sellRawRef.current ?? sellAmount) : null;
    const currentBuyRaw = buyText.trim() !== "" ? (buyRawRef.current ?? buyAmount) : null;

    const swappedPayCandidate: PayMethod | null = receiveMethod === "cash" || receiveMethod === "transfer" || receiveMethod === "atm" ? receiveMethod : null;
    const swappedReceiveCandidate: ReceiveMethod | null = payMethod === "cash" || payMethod === "transfer" || payMethod === "atm" ? payMethod : null;

    const nextAllowedPay = allowedPayMethods(nextSellCurrency, nextBuyCurrency, currentBuyRaw ?? undefined, currentSellRaw ?? undefined);
    const nextAllowedReceiveBase = allowedReceiveMethods(nextBuyCurrency, nextSellCurrency, currentSellRaw ?? undefined, currentBuyRaw ?? undefined);
    const nextAllowedReceive = deliveryClosed && !(nextSellCurrency === "VND" && nextBuyCurrency === "VND")
      ? nextAllowedReceiveBase.filter((m) => m === "transfer" || m === "atm")
      : nextAllowedReceiveBase;

    const nextPayMethod = swappedPayCandidate && nextAllowedPay.includes(swappedPayCandidate)
      ? swappedPayCandidate
      : nextAllowedPay[0];

    const nextReceiveMethod = nextAllowedReceive.length === 0
      ? receiveMethod
      : swappedReceiveCandidate && nextAllowedReceive.includes(swappedReceiveCandidate)
        ? swappedReceiveCandidate
        : nextAllowedReceive[0];

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

  function buildRequestCopyText(requestId: string) {
    const lines = [
      `Заявка #${requestId}`,
      `Обмен: ${sellCurrency} → ${buyCurrency}`,
      `Отдаю: ${fmtAmount(sellCurrency, sellAmount || 0)}`,
      `Получаю: ${fmtAmount(buyCurrency, buyAmount || 0)}`,
      `Оплата: ${methodLabel(payMethod)}`,
      `Получение: ${methodLabel(receiveMethod)}`,
    ];
    const comment = String(requestComment || "").trim();
    if (comment) lines.push(`Комментарий: ${comment}`);
    return lines.join("\n");
  }

  async function copyRequestInfo(requestId: string, readyText?: string) {
    const ok = await copyPlainText(readyText || buildRequestCopyText(requestId));
    if (ok) {
      tg?.HapticFeedback?.notificationOccurred?.("success");
      setBanner({ type: "ok", text: "Информация о заявке скопирована." });
      return;
    }
    tg?.HapticFeedback?.notificationOccurred?.("error");
    tg?.showAlert?.("Не удалось скопировать заявку.");
  }

  async function createRequest() {
    const initData = tg?.initData || me?.initData || "";
    if (!initData) {
      tg?.showAlert?.("Нет initData. Открой мини-приложение через Telegram (/start).");
      return null;
    }

    const payload = {
      sellCurrency,
      buyCurrency,
      sellAmount,
      buyAmount,
      payMethod,
      receiveMethod,
      comment: requestComment.trim(),
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
      const json = await res.json().catch(() => ({}));
      if (!json?.ok) {
        const err = String(json?.error || "fail");
        tg?.HapticFeedback?.notificationOccurred?.("error");
        tg?.showAlert?.(`Ошибка: ${err}`);
        return null;
      }
      tg?.HapticFeedback?.notificationOccurred?.("success");
      return {
        id: String(json?.id || ""),
        state: String(json?.state || ""),
        needsManualManagerContact: !!json?.needsManualManagerContact,
        hasSavedContact: !!json?.hasSavedContact,
      };
    } catch (e: any) {
      tg?.HapticFeedback?.notificationOccurred?.("error");
      tg?.showAlert?.(`Ошибка сети: ${e?.message || e}`);
      return null;
    }
  }

  async function afterRequestSent(result: { id: string; state: string; needsManualManagerContact?: boolean; hasSavedContact?: boolean }) {
    const requestId = String(result?.id || "");
    const serverDecision = typeof result?.needsManualManagerContact === "boolean" ? result.needsManualManagerContact : undefined;
    const fallbackNeedsManualManagerContact = !String(me?.user?.username || "").trim();
    const needsManualManagerContact = serverDecision ?? fallbackNeedsManualManagerContact;
    if (needsManualManagerContact && requestId) {
      setRequestSuccessModal({
        requestId,
        copyText: buildRequestCopyText(requestId),
      });
    } else {
      setBanner({
        type: "ok",
        text: "Ваша заявка принята в работу, в ближайшее время с вами свяжется менеджер 🙌",
      });
    }

    setSellText("");
    setBuyText("");
    setRequestComment("");
    setCommentKeyboardInset(0);
  }

  async function sendRequest() {
    if (!canSend) return;
    const result = await createRequest();
    if (result) await afterRequestSent(result);
  }

  const requestDoneModal = requestSuccessModal && typeof document !== "undefined"
    ? createPortal(
        <div className="vx-modalOverlay vx-contactModalOverlay" role="dialog" aria-modal="true" aria-label="Заявка принята">
          <div className="vx-modalCard vx-contactModalCard vx-requestDoneCard" onClick={(e) => e.stopPropagation()}>
            <div className="vx-requestDoneHero" aria-hidden="true">✓</div>
            <div className="vx-requestDoneText">
              Так как у вас отсутствует юзернейм, пожалуйста скопируйте данные заявки и свяжитесь с менеджером
            </div>
            <div className="vx-requestIdBar">
              <span className="vx-requestIdValue">#{shortRequestId(requestSuccessModal.requestId)}</span>
              <button
                type="button"
                className="vx-copyIconBtn"
                onClick={() => copyRequestInfo(requestSuccessModal.requestId, requestSuccessModal.copyText)}
                aria-label="Скопировать информацию о заявке"
                title="Скопировать данные заявки"
              >
                <CopyIcon className="vx-copyIcon" />
              </button>
            </div>
            <button
              type="button"
              className="vx-primary vx-requestManagerBtn"
              onClick={() => {
                openManagerContactLink(me);
                setRequestSuccessModal(null);
              }}
            >
              Связаться с менеджером
            </button>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div className="vx-calc">
      <div className="vx-calcTitle" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div className="vx-muted">Статус: {statusLabel(clientStatus)}</div>
        <button type="button" className="vx-conditionsBtn" title="Условия обмена" onClick={() => setShowConditions(true)}>i</button>
      </div>

      {showConditions ? (
        <div className="vx-modalOverlay" onClick={() => setShowConditions(false)}>
          <div className="vx-modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="row vx-between vx-center">
              <div className="vx-modalTitle">Условия обмена</div>
              <button type="button" className="btn vx-btnSm" onClick={() => setShowConditions(false)}>Закрыть</button>
            </div>
            <div className="vx-conditionsList">
              {conditionsItems.map((item) => (
                <div key={item} className="vx-conditionsItem">• {item}</div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {requestDoneModal}

      {banner ? (
        <div className={banner.type === "err" ? "vx-toast vx-toastErr" : "vx-toast vx-toastOk"}>{banner.text}</div>
      ) : null}

      {loading && <div className="vx-help">Загрузка курсов…</div>}
      {!loading && (!rates || (!market && gMode)) && <div className="vx-help">Курсы не загружены.</div>}

      <div className="vx-note" style={{ marginBottom: 10 }}>
        <b>Время работы сервиса:</b> ежедневно с 10:00 до 22:00. С 20:00 до 22:00 возможен только дистанционный обмен.
      </div>

      {managerOffline ? (
        <div className="vx-note vx-noteWarn" style={{ marginBottom: 10 }}>
          Спасибо за обращение. Сейчас в Дананге {danangTime.label}. Оставить заявку Вы можете в рабочее время.
        </div>
      ) : deliveryClosed ? (
        <div className="vx-note vx-noteWarn" style={{ marginBottom: 10 }}>
          После 20:00 по Данангу доставка уже не работает. Сейчас в Дананге {danangTime.label}. Доступен только дистанционный обмен.
        </div>
      ) : null}

      {receiveMethodUnavailableByHours ? (
        <div className="vx-warn" style={{ marginBottom: 10 }}>
          После 20:00 доступны только способы получения «Перевод» или «Банкомат». Для выбранной валюты выдача сейчас недоступна.
        </div>
      ) : null}

      <div className="vx-calcBox">
        <div className="vx-calcGrid">
          <div className="vx-calcMain">
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
                inputMode={sellCurrency === "USDT" ? "decimal" : "numeric"}
                placeholder={amountPlaceholder("Отдаю", sellCurrency, isVndToVnd)}
                value={sellText}
                className={invalidUsdSell || invalidEurSell || invalidThbSell || invalidVndSellCash || invalidMinSell ? "vx-inputInvalid" : ""}
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
                inputMode={buyCurrency === "USDT" ? "decimal" : "numeric"}
                placeholder={amountPlaceholder("Получаю", buyCurrency, isVndToVnd)}
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

              <div className="vx-iconBtnGhost" aria-hidden="true" />
            </div>
          </div>

          <div className="vx-calcSide">
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

            {rateInfo ? (
              <div className="vx-rateLine">
                Курс: <b>{fmtAmount("VND", rateInfo.base)}</b> + статус <b>{fmtAmount("VND", rateInfo.tier)}</b> + способ{" "}
                <b>{fmtAmount("VND", rateInfo.m)}</b> = <b>{fmtAmount("VND", rateInfo.eff)}</b>
              </div>
            ) : null}

            {invalidUsdSell || invalidUsdBuy ? <div className="vx-warn">USD: передать и получить можно только наличными, кратно 100.</div> : null}
            {invalidEurSell || invalidEurBuy ? <div className="vx-warn">EUR: передать и получить можно только наличными, кратно 50.</div> : null}
            {invalidThbSell || invalidThbBuy ? <div className="vx-warn">THB: передать и получить можно только наличными, кратно 100.</div> : null}
            {minSellNote ? <div className="vx-warn">{minSellNote}</div> : null}
            {((sellCurrency === "RUB" && sellAmount != null && sellAmount < 20_000) || (buyCurrency === "RUB" && buyAmount != null && buyAmount < 20_000)) ? <div className="vx-warn">Доставка наличных возможна при обмене от 20,000₽/100$/100USDT.</div> : null}

            <div className="vx-sp12" />

            <div
              ref={commentComposerRef}
              className={"vx-requestComposer" + (commentKeyboardInset > 0 ? " is-lifted" : "")}
              style={commentKeyboardInset > 0 ? { bottom: `${commentKeyboardInset}px` } : undefined}
            >
              <textarea
                ref={commentFieldRef}
                className="input vx-in vx-requestCommentInput"
                rows={3}
                placeholder={requestCommentPlaceholder(receiveMethod)}
                value={requestComment}
                onFocus={() => {
                  window.setTimeout(() => {
                    commentComposerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
                  }, 140);
                }}
                onBlur={() => {
                  window.setTimeout(() => setCommentKeyboardInset(0), 120);
                }}
                onChange={(e) => setRequestComment(e.target.value.slice(0, 300))}
              />

              <div className="vx-sp12" />

              <button className="vx-primary" disabled={!canSend} onClick={sendRequest}>
                Отправить заявку
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
