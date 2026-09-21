import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  amountMaxDecimals,
  fmtAmount,
  fmtFromInput,
  formatAmountInput,
  parseAmount,
  type AmountInputResult,
  type InputHint,
} from "../domain/amountInput";
import { DEFAULT_G_FORMULAS } from "../domain/exchange";
import {
  allowedPayMethods,
  allowedReceiveMethods,
  convertBackward,
  convertForward,
  currencySymbol,
  effectiveRate,
  fmtUnitRate,
  isGModePair,
  markupFor,
  resolveQuote,
  vndRate,
  type PayMethod,
  type PricingContext,
  type VndRates as Rates,
} from "../domain/pricing";
import { getUserStatusLabel, normalizeUserStatus } from "../domain/status";
import { apiGetBonuses, apiGetGFormulas, apiGetMarketRates } from "../lib/api";
import type { BonusesConfig, CrossRates, Currency, MarketRatesResponse, ReceiveMethod, UserStatus } from "../lib/types";

type SelectedReceiveMethod = ReceiveMethod | null;
type SelectedPayMethod = PayMethod | null;

type ClientStatus = UserStatus;
type Lang = "ru" | "en";
type AmountFieldKey = "sell" | "buy";
type PendingCaret = {
  field: AmountFieldKey;
  start: number;
  end: number;
  direction: "forward" | "backward" | "none";
  restoreUntil: number;
};

type Props = {
  lang?: Lang;
  mode?: "client" | "admin";
  forcedStatus?: UserStatus;
  onOpenDoc?: (doc: "privacy" | "terms") => void;
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

function getTg() {
  return (window as any).Telegram?.WebApp;
}

function PaperclipIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21.44 11.05 12 20.5a6 6 0 0 1-8.49-8.49l9.9-9.9a4 4 0 0 1 5.66 5.66l-10 10a2 2 0 1 1-2.83-2.83l9.19-9.2" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg className="cx-curChevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function SwapIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 4v15M7 4L4 7.5M7 4l3 3.5M17 20V5M17 20l3-3.5M17 20l-3-3.5" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_failed"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

function selectionIndex(value: string, index: number | null): number {
  return typeof index === "number" && Number.isFinite(index)
    ? index
    : String(value ?? "").length;
}

// What was inserted, taken from the input event (more reliable than diffing values).
function inputHintFromEvent(e: React.ChangeEvent<HTMLInputElement>): InputHint | null {
  const ne = e.nativeEvent as InputEvent;
  const type = String(ne?.inputType || "");
  if (type === "insertFromPaste" || type === "insertFromDrop") return { text: "", index: -1, pasted: true };
  const data = typeof ne?.data === "string" ? ne.data : "";
  const caret = e.currentTarget.selectionStart;
  if (type !== "insertText" || !data || caret == null) return null;
  return { text: data, index: caret - data.length, pasted: data.length > 1 };
}

function makePendingCaret(field: AmountFieldKey, input: HTMLInputElement, formatted: AmountInputResult): PendingCaret {
  const rawValue = input.value;
  return {
    field,
    start: formatted.mapCaret(selectionIndex(rawValue, input.selectionStart)),
    end: formatted.mapCaret(selectionIndex(rawValue, input.selectionEnd)),
    direction: input.selectionDirection ?? "none",
    restoreUntil: Date.now() + 150,
  };
}

function isMultiple(n: number, step: number) {
  if (!Number.isFinite(n) || step <= 0) return false;
  const q = n / step;
  return Math.abs(q - Math.round(q)) < 1e-9;
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

function normalizeMethodSelection<T extends string>(
  allowed: T[],
  selected: T | null,
  selectedByDefault: boolean
): { value: T | null; selectedByDefault: boolean } {
  if (allowed.length === 1) {
    const only = allowed[0];
    return {
      value: only,
      selectedByDefault: selected !== only || selectedByDefault
    };
  }

  if (!selected || !allowed.includes(selected) || selectedByDefault) {
    return { value: null, selectedByDefault: false };
  }

  return { value: selected, selectedByDefault: false };
}

function initialMethodSelection<T extends string>(
  allowed: T[],
  preferred: T | null
): { value: T | null; selectedByDefault: boolean } {
  if (preferred && allowed.includes(preferred)) {
    return { value: preferred, selectedByDefault: false };
  }
  if (allowed.length === 1) {
    return { value: allowed[0], selectedByDefault: true };
  }
  return { value: null, selectedByDefault: false };
}

function amountPlaceholder(prefix: string, cur: Currency, isVndToVnd = false): string {
  const min = isVndToVnd && cur === "VND" ? null : minSellAmountLabel(cur);
  return min ? `${prefix} (мин. ${min})` : prefix;
}

function requestCommentPlaceholder(receiveMethod: SelectedReceiveMethod): string {
  if (!receiveMethod) return "";
  if (receiveMethod === "cash") return "укажите адрес";
  if (receiveMethod === "transfer") return "укажите реквизиты для получения";
  return "";
}

// ---------- Курс направления с надбавками ----------
function pricedQuote(
  ctx: PricingContext,
  from: Currency,
  to: Currency,
  amountFrom: number,
  status: ClientStatus,
  receiveMethod: SelectedReceiveMethod,
  bonuses: BonusesConfig | null
) {
  const quote = resolveQuote(from, to, ctx);
  if (!quote) return null;
  const markup = markupFor(from, to, amountFrom, status, receiveMethod, bonuses);
  return { quote, markup, rate: effectiveRate(quote, markup) };
}

// ---------- VND-конвертация для кросс-пар без формулы (без надбавок) ----------
function calcBuyAmountVnd(rates: Rates, sellCurrency: Currency, buyCurrency: Currency, sellAmount: number): number {
  if (sellAmount <= 0) return 0;
  if (sellCurrency === buyCurrency) return sellAmount;

  const sr = vndRate(rates, sellCurrency);
  const br = vndRate(rates, buyCurrency);
  if (!sr || !br) return Number.NaN;
  return (sellAmount * sr.buy_vnd) / br.sell_vnd;
}

function calcSellAmountVnd(rates: Rates, sellCurrency: Currency, buyCurrency: Currency, buyAmount: number): number {
  if (buyAmount <= 0) return 0;
  if (sellCurrency === buyCurrency) return buyAmount;

  const sr = vndRate(rates, sellCurrency);
  const br = vndRate(rates, buyCurrency);
  if (!sr || !br) return Number.NaN;
  return (buyAmount * br.sell_vnd) / sr.buy_vnd;
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

const ATM_VND_STEP = 100000;
const CASH_VND_STEP = 10000;
const USD_STEP = 100;
const EUR_STEP = 50;
const THB_STEP = 100;
const MIN_SELL_AMOUNTS: Record<Currency, number> = {
  RUB: 10_000,
  USDT: 100,
  USD: 100,
  EUR: 100,
  THB: 10_000,
  VND: 6_500_000,
};

const CASH_DELIVERY_MIN_AMOUNTS: Record<string, number> = {
  RUB: 20_000,
  USD: 200,
  EUR: 200,
  USDT: 200,
  THB: 100_000,
};

function minSellAmountLabel(cur: Currency): string {
  const value = MIN_SELL_AMOUNTS[cur];
  if (cur === "RUB") return `${fmtAmount(cur, value)} ₽`;
  return `${fmtAmount(cur, value)} ${cur}`;
}

function needsCashDeliveryWarning(cur: Currency, amount: number): boolean {
  const min = CASH_DELIVERY_MIN_AMOUNTS[cur];
  if (!Number.isFinite(amount) || amount <= 0 || min == null) return false;
  return amount < min;
}

export default function CalculatorTab({ me, lang = "ru", mode = "client", forcedStatus, onOpenDoc }: Props) {
  const tg = getTg();
  const isEn = lang === "en";
  const isAdminMode = mode === "admin";
  const uiMethodLabel = (m: ReceiveMethod | PayMethod) => isEn ? (m === "cash" ? "Cash" : m === "transfer" ? "Transfer" : "ATM") : methodLabel(m);
  const uiAmountPlaceholder = (prefix: string, cur: Currency, same = false) => { const min = same && cur === "VND" ? null : minSellAmountLabel(cur); return min ? `${prefix} (${isEn ? "min." : "мин."} ${min})` : prefix; };
  const uiCommentPlaceholder = (rm: SelectedReceiveMethod) =>
    isEn
      ? (!rm ? "select receive method first" : rm === "cash" ? "enter the address" : rm === "transfer" ? "enter transfer details" : "")
      : requestCommentPlaceholder(rm);

  const [loading, setLoading] = useState(true);
  const [rates, setRates] = useState<Rates | null>(null);
  const [cross, setCross] = useState<CrossRates | null>(null);
  const [ratesUpdatedAt, setRatesUpdatedAt] = useState<string | null>(null);
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
  const payMethodAutoSelectedRef = useRef(false);
  const receiveMethodAutoSelectedRef = useRef(false);
  const sellInputRef = useRef<HTMLInputElement | null>(null);
  const buyInputRef = useRef<HTMLInputElement | null>(null);
  const pendingCaretRef = useRef<PendingCaret | null>(null);

  const [payMethod, setPayMethod] = useState<SelectedPayMethod>(null);
  const [receiveMethod, setReceiveMethod] = useState<SelectedReceiveMethod>(null);

  const [clientStatus, setClientStatus] = useState<ClientStatus>(normalizeUserStatus(forcedStatus ?? me?.status));
  const [requestComment, setRequestComment] = useState("");
  const [requestAttachmentImageDataUrl, setRequestAttachmentImageDataUrl] = useState<string | null>(null);
  const [requestAttachmentName, setRequestAttachmentName] = useState("");
  const [requestAttachmentSizeLabel, setRequestAttachmentSizeLabel] = useState("");
  const [requestSuccessModal, setRequestSuccessModal] = useState<null | {
    requestId: string;
    copyText: string;
    needsManualManagerContact: boolean;
  }>(null);
  const [commentKeyboardInset, setCommentKeyboardInset] = useState(0);

  const commentFieldRef = useRef<HTMLTextAreaElement | null>(null);
  const commentComposerRef = useRef<HTMLDivElement | null>(null);
  const requestAttachmentInputRef = useRef<HTMLInputElement | null>(null);

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
    if (!forcedStatus) return;
    setClientStatus(normalizeUserStatus(forcedStatus));
  }, [forcedStatus]);

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

  useLayoutEffect(() => {
    const pending = pendingCaretRef.current;
    if (!pending) return;

    const input = pending.field === "sell" ? sellInputRef.current : buyInputRef.current;
    if (!input) {
      pendingCaretRef.current = null;
      return;
    }
    if (document.activeElement !== input) {
      pendingCaretRef.current = null;
      return;
    }
    if (Date.now() > pending.restoreUntil) {
      pendingCaretRef.current = null;
      return;
    }

    const start = Math.max(0, Math.min(pending.start, input.value.length));
    const end = Math.max(start, Math.min(pending.end, input.value.length));
    try {
      input.setSelectionRange(start, end, pending.direction);
    } catch {
      // Some mobile WebViews can temporarily reject selection updates while the keyboard is resizing.
    }
    pendingCaretRef.current = pending;
  }, [sellText, buyText]);

  const danangTime = useMemo(() => getDanangTimeInfo(danangNowMs), [danangNowMs]);
  const managerOffline = danangTime.hour >= 22 || danangTime.hour < 10;
  const deliveryClosed = danangTime.hour >= 20 && danangTime.hour < 22;
  const deliveryClosedForRules = !isAdminMode && deliveryClosed;

  const gMode = useMemo(() => isGModePair(formulas, sellCurrency, buyCurrency), [formulas, sellCurrency, buyCurrency]);

  // Enforce pay-method restrictions based on SELL currency
  useEffect(() => {
    const allowed = allowedPayMethods(sellCurrency, buyCurrency);
    const next = normalizeMethodSelection(allowed, payMethod, payMethodAutoSelectedRef.current);
    payMethodAutoSelectedRef.current = next.selectedByDefault;
    if (payMethod !== next.value) setPayMethod(next.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellCurrency, buyCurrency, sellText, buyText, payMethod]);

  // Enforce receive-method restrictions based on BUY currency and service hours
  useEffect(() => {
    const baseAllowed = allowedReceiveMethods(buyCurrency);
    const allowed = deliveryClosedForRules && !(sellCurrency === "VND" && buyCurrency === "VND")
      ? baseAllowed.filter((m) => m === "transfer" || m === "atm")
      : baseAllowed;
    const next = normalizeMethodSelection(allowed, receiveMethod, receiveMethodAutoSelectedRef.current);
    receiveMethodAutoSelectedRef.current = next.selectedByDefault;
    if (receiveMethod !== next.value) setReceiveMethod(next.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyCurrency, sellCurrency, buyText, sellText, deliveryClosedForRules, receiveMethod]);

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
        if (alive) {
          setRates(r);
          setCross(json?.data?.cross && typeof json.data.cross === "object" ? json.data.cross : null);
          setRatesUpdatedAt(json?.data?.updated_at ? String(json.data.updated_at) : null);
        }
      } catch {
        if (alive) {
          setRates(null);
          setCross(null);
          setRatesUpdatedAt(null);
        }
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
    if (isAdminMode || forcedStatus) return;
    const initData = tg?.initData || "";
    if (!initData) return;

    (async () => {
      try {
        const res = await fetch("/api/me", { headers: { Authorization: `tma ${initData}` } });
        const json = await res.json();
        const raw = json?.data?.status ?? json?.status;
        if (raw) setClientStatus(normalizeUserStatus(raw));
      } catch {
        // ignore
      }
    })();
  }, [tg, isAdminMode, forcedStatus]);

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

  const allowedPay = useMemo(() => allowedPayMethods(sellCurrency, buyCurrency), [sellCurrency, buyCurrency]);
  const allowedRecv = useMemo(() => {
    const baseAllowed = allowedReceiveMethods(buyCurrency);
    return deliveryClosedForRules && !(sellCurrency === "VND" && buyCurrency === "VND")
      ? baseAllowed.filter((m) => m === "transfer" || m === "atm")
      : baseAllowed;
  }, [buyCurrency, sellCurrency, deliveryClosedForRules]);
  const receiveMethodUnavailableByHours = deliveryClosedForRules && allowedRecv.length === 0;

  const pricingCtx = useMemo<PricingContext>(() => ({ rates, cross, market, formulas }), [rates, cross, market, formulas]);
  const baseQuote = useMemo(() => resolveQuote(sellCurrency, buyCurrency, pricingCtx), [sellCurrency, buyCurrency, pricingCtx]);

  // Missing data check
  const missingRates = useMemo(() => {
    if (sellCurrency === "VND" && buyCurrency === "VND") return [];
    if (baseQuote) return [];

    if (gMode) return ["G"];
    if (!rates) return ["VND rates"];

    const miss: string[] = [];
    if (sellCurrency !== "VND" && !vndRate(rates, sellCurrency)) miss.push(sellCurrency);
    if (buyCurrency !== "VND" && !vndRate(rates, buyCurrency)) miss.push(buyCurrency);
    return miss;
  }, [baseQuote, gMode, rates, sellCurrency, buyCurrency]);

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
  const invalidVndBuyCash = false;
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

    const priced = (amountFrom: number) =>
      pricedQuote(pricingCtx, sellCurrency, buyCurrency, amountFrom, clientStatus, receiveMethod, bonuses);

    if (lastEdited.current === "sell") {
      const p = priced(sellAmount);
      const outRaw = p
        ? convertForward(p.quote.side, p.rate, sellAmount)
        : !gMode && rates
          ? calcBuyAmountVnd(rates, sellCurrency, buyCurrency, sellAmount)
          : Number.NaN;
      const next = sellText.trim() !== "" && Number.isFinite(outRaw) ? formatComputed(buyCurrency, outRaw) : "";
      buyRawRef.current = next ? outRaw : null;
      if (next !== buyText) setBuyText(next);
    } else {
      let guess: number;
      if (baseQuote) {
        // Iteration is needed only because the tier markup depends on the amount the client gives
        guess = convertBackward(baseQuote.side, baseQuote.rate, buyAmount);
        for (let i = 0; i < 3; i++) {
          const p = priced(Number.isFinite(guess) ? guess : 0);
          const nextGuess = p ? convertBackward(p.quote.side, p.rate, buyAmount) : Number.NaN;
          if (!Number.isFinite(nextGuess)) break;
          if (Math.abs(nextGuess - guess) < 1e-7) {
            guess = nextGuess;
            break;
          }
          guess = nextGuess;
        }
      } else {
        guess = !gMode && rates ? calcSellAmountVnd(rates, sellCurrency, buyCurrency, buyAmount) : Number.NaN;
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
    pricingCtx,
    baseQuote,
    bonuses,
    payMethod,
    receiveMethod,
    clientStatus,
    canCalc,
    gMode,
  ]);

  // Rate of the current direction with markups: base ± status tier ± receive method.
  const rateInfo = useMemo(() => {
    if (!baseQuote) return null;
    const p = pricedQuote(pricingCtx, sellCurrency, buyCurrency, sellAmount, clientStatus, receiveMethod, bonuses);
    if (!p || !Number.isFinite(p.rate)) return null;
    return { quote: baseQuote, tier: p.markup.tier, method: p.markup.method, eff: p.rate };
  }, [baseQuote, pricingCtx, sellCurrency, buyCurrency, sellAmount, clientStatus, receiveMethod, bonuses]);

  // "1 ₽ = 300 ₫" line under the amount cards (redesign). Uses the effective rate when markups apply.
  const unitRate = useMemo(() => {
    if (!rateInfo) return null;
    return { unitCur: rateInfo.quote.base, quoteCur: rateInfo.quote.quote, rate: rateInfo.eff };
  }, [rateInfo]);

  // Admin-only breakdown: "база 300 + статус +1 + перевод +1".
  const rateBreakdown = useMemo(() => {
    if (!isAdminMode || !rateInfo) return null;
    const sign = rateInfo.quote.side === "buy" ? "+" : "−";
    const parts = [`${isEn ? "base" : "база"} ${fmtUnitRate(rateInfo.quote.rate, isEn)}`];
    if (rateInfo.quote.manual) parts[0] += isEn ? " (manual)" : " (ручной)";
    parts.push(`${isEn ? "status" : "статус"} «${getUserStatusLabel(clientStatus, lang)}» ${sign}${fmtUnitRate(rateInfo.tier, isEn)}`);
    parts.push(
      receiveMethod
        ? `${uiMethodLabel(receiveMethod).toLowerCase()} ${sign}${fmtUnitRate(rateInfo.method, isEn)}`
        : isEn ? "receive method not selected" : "способ получения не выбран"
    );
    return parts.join(" · ");
  }, [isAdminMode, rateInfo, clientStatus, receiveMethod, isEn, lang]);

  const rateUpdatedLabel = useMemo(() => {
    const usesMarket = gMode && !baseQuote?.manual;
    const iso = usesMarket ? (market?.ok ? market.updated_at : null) : ratesUpdatedAt;
    if (!iso) return null;
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return null;
    const mins = Math.max(0, Math.round((danangNowMs - t) / 60_000));
    if (mins < 1) return isEn ? "updated just now" : "обновлён только что";
    if (mins < 60) return isEn ? `updated ${mins} min ago` : `обновлён ${mins} мин назад`;
    const hours = Math.floor(mins / 60);
    return isEn ? `updated ${hours} h ago` : `обновлён ${hours} ч назад`;
  }, [gMode, baseQuote, market, ratesUpdatedAt, danangNowMs, isEn]);

  const sameCurrencyAllowed = sellCurrency === buyCurrency ? sellCurrency === "VND" && buyCurrency === "VND" : true;
  const isVndToVnd = sellCurrency === "VND" && buyCurrency === "VND";

  const canSendBase =
    canCalc && sameCurrencyAllowed && sellText.trim() !== "" && buyText.trim() !== "" && sellAmount > 0 && buyAmount > 0;

  const hasSelectedMethods = !!payMethod && !!receiveMethod;
  const validPayMethod = !!payMethod && allowedPay.includes(payMethod);
  const validReceiveMethod = !!receiveMethod && allowedRecv.includes(receiveMethod);
  const canSend = canSendBase && !hasInvalid && !managerOffline && !receiveMethodUnavailableByHours && validPayMethod && validReceiveMethod;
  const canShowMethodSelectionAlertOnClick = canSendBase && !hasInvalid && !managerOffline && !receiveMethodUnavailableByHours && !hasSelectedMethods;
  const sendButtonDisabled = !canSend && !canShowMethodSelectionAlertOnClick;

  const usdNote =
    sellCurrency === "USD" || buyCurrency === "USD"
      ? (isEn ? "USD: only new-series $100 cash notes without marks or defects are accepted and paid out." : "USD: вы можете передать и получить только наличные доллары номиналом 100$ нового образца, без надписей и дефектов.")
      : null;

  const eurNote =
    sellCurrency === "EUR" || buyCurrency === "EUR"
      ? (isEn ? "EUR: only new-series €50/€100/€200 cash notes without marks or defects are accepted and paid out." : "EUR: вы можете передать и получить только наличные купюры по 50/100/200€ нового образца, без надписей и дефектов.")
      : null;

  const vndNote =
    isVndToVnd
      ? (isEn ? "VND → VND: payment is available by cash or transfer; receive is available by cash, transfer, or ATM. Fee is 2%, but at least 100,000 VND." : "VND → VND: оплатить можно наличными или переводом; получить — наличными, переводом или через банкомат. Комиссия 2%, но не меньше 100,000 VND.")
      : null;

  const thbNote =
    sellCurrency === "THB" || buyCurrency === "THB"
      ? (isEn ? "THB: cash only, in multiples of 100 baht." : "THB: передать и получить баты можно только наличными, кратно 100 бат.")
      : null;

  const vndAtmNote =
    buyCurrency === "VND" && receiveMethod === "atm"
      ? (isEn ? "VND via ATM is paid out in multiples of 100,000." : "Получение VND через банкомат кратно 100,000.")
      : null;

  const minSellNote = invalidMinSell
    ? (isEn ? `Minimum ${sellCurrency} amount for exchange is ${minSellAmountLabel(sellCurrency)}.` : `Минимальная сумма ${sellCurrency} для обмена — ${minSellAmountLabel(sellCurrency)}.`)
    : null;

  const showCashDeliveryNote =
    needsCashDeliveryWarning(sellCurrency, sellAmount) ||
    needsCashDeliveryWarning(buyCurrency, buyAmount);

  function swapCurrencies() {
    const nextSellCurrency = buyCurrency;
    const nextBuyCurrency = sellCurrency;

    const swappedPayCandidate: PayMethod | null = receiveMethod === "cash" || receiveMethod === "transfer" ? receiveMethod : null;
    const swappedReceiveCandidate: ReceiveMethod | null = payMethod === "cash" || payMethod === "transfer" ? payMethod : null;

    const nextAllowedPay = allowedPayMethods(nextSellCurrency, nextBuyCurrency);
    const nextAllowedReceiveBase = allowedReceiveMethods(nextBuyCurrency);
    const nextAllowedReceive = deliveryClosedForRules && !(nextSellCurrency === "VND" && nextBuyCurrency === "VND")
      ? nextAllowedReceiveBase.filter((m) => m === "transfer" || m === "atm")
      : nextAllowedReceiveBase;

    const nextPayMethod = initialMethodSelection(nextAllowedPay, swappedPayCandidate);
    const nextReceiveMethod = initialMethodSelection(nextAllowedReceive, swappedReceiveCandidate);

    preserveSwappedValuesRef.current = false;
    skipNextRecalc.current = true;
    skipNextCurrencyNormalizeCount.current = 2;
    lastEdited.current = "sell";
    sellRawRef.current = null;
    buyRawRef.current = null;
    setSellCurrency(nextSellCurrency);
    setBuyCurrency(nextBuyCurrency);
    payMethodAutoSelectedRef.current = nextPayMethod.selectedByDefault;
    receiveMethodAutoSelectedRef.current = nextReceiveMethod.selectedByDefault;
    setPayMethod(nextPayMethod.value);
    setReceiveMethod(nextReceiveMethod.value);
    setSellText("");
    setBuyText("");
  }

  function buildRequestCopyText(requestId: string) {
    const lines = [
      `${isEn ? "Request" : "Заявка"} #${requestId}`,
      `${isEn ? "Exchange" : "Обмен"}: ${sellCurrency} → ${buyCurrency}`,
      `${isEn ? "You give" : "Отдаю"}: ${fmtAmount(sellCurrency, sellAmount || 0)}`,
      `${isEn ? "You get" : "Получаю"}: ${fmtAmount(buyCurrency, buyAmount || 0)}`,
      `${isEn ? "Payment" : "Оплата"}: ${payMethod ? uiMethodLabel(payMethod) : (isEn ? "Not selected" : "Не выбрано")}`,
      `${isEn ? "Receive" : "Получение"}: ${receiveMethod ? uiMethodLabel(receiveMethod) : (isEn ? "Not selected" : "Не выбрано")}`,
    ];
    const comment = String(requestComment || "").trim();
    if (comment) lines.push(`${isEn ? "Comment" : "Комментарий"}: ${comment}`);
    if (requestAttachmentImageDataUrl) lines.push(isEn ? "Photo: attached to the request." : "Фото: приложено к заявке.");
    return lines.join("\n");
  }

  async function handleRequestAttachmentChange(file: File | null) {
    if (!file) return;
    if (!String(file.type || "").toLowerCase().startsWith("image/")) {
      tg?.showAlert?.(isEn ? "Please attach an image file." : "Пожалуйста, прикрепите файл изображения.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      tg?.showAlert?.(isEn ? "The image must be up to 5 MB." : "Изображение должно быть не больше 5 МБ.");
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (!dataUrl.startsWith("data:image/")) {
        tg?.showAlert?.(isEn ? "Please attach an image file." : "Пожалуйста, прикрепите файл изображения.");
        return;
      }
      setRequestAttachmentImageDataUrl(dataUrl);
      setRequestAttachmentName(String(file.name || (isEn ? "image" : "изображение")));
      setRequestAttachmentSizeLabel(formatFileSize(file.size));
    } catch {
      tg?.showAlert?.(isEn ? "Failed to read the image." : "Не удалось прочитать изображение.");
    }
  }

  function clearRequestAttachment() {
    setRequestAttachmentImageDataUrl(null);
    setRequestAttachmentName("");
    setRequestAttachmentSizeLabel("");
    if (requestAttachmentInputRef.current) requestAttachmentInputRef.current.value = "";
  }

  async function copyRequestInfo(requestId: string, readyText?: string) {
    const ok = await copyPlainText(readyText || buildRequestCopyText(requestId));
    if (ok) {
      tg?.HapticFeedback?.notificationOccurred?.("success");
      setBanner({ type: "ok", text: isEn ? "Request data copied." : "Информация о заявке скопирована." });
      return;
    }
    tg?.HapticFeedback?.notificationOccurred?.("error");
    tg?.showAlert?.(isEn ? "Failed to copy request data." : "Не удалось скопировать заявку.");
  }

  async function createRequest() {
    const initData = tg?.initData || me?.initData || "";
    if (!initData) {
      tg?.showAlert?.(isEn ? "No initData. Open the mini app from Telegram (/start)." : "Нет initData. Открой мини-приложение через Telegram (/start).");
      return null;
    }

    if (!payMethod || !receiveMethod) {
      tg?.HapticFeedback?.notificationOccurred?.("error");
      tg?.showAlert?.(
        isEn
          ? "Please select both the payment and receive methods."
          : "Пожалуйста, выберите способ оплаты и способ получения."
      );
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
      attachmentImageDataUrl: requestAttachmentImageDataUrl || undefined,
      language: lang,
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
    if (requestId) {
      setRequestSuccessModal({
        requestId,
        copyText: buildRequestCopyText(requestId),
        needsManualManagerContact,
      });
    } else {
      setBanner({
        type: "ok",
        text: isEn ? "Your request has been accepted. A manager will contact you soon 🙌" : "Ваша заявка принята в работу, в ближайшее время с вами свяжется менеджер 🙌",
      });
    }

    setSellText("");
    setBuyText("");
    setRequestComment("");
    clearRequestAttachment();
    setPayMethod(null);
    setReceiveMethod(null);
    payMethodAutoSelectedRef.current = false;
    receiveMethodAutoSelectedRef.current = false;
    setCommentKeyboardInset(0);
  }

  async function sendRequest() {
    if (!payMethod || !receiveMethod) {
      tg?.HapticFeedback?.notificationOccurred?.("error");
      tg?.showAlert?.(
        isEn
          ? "Please select both the payment and receive methods."
          : "Пожалуйста, выберите способ оплаты и способ получения."
      );
      return;
    }
    if (!canSend) return;
    const result = await createRequest();
    if (result) await afterRequestSent(result);
  }

  const requestDoneModal = requestSuccessModal && typeof document !== "undefined"
    ? createPortal(
        <div className="vx-modalOverlay vx-contactModalOverlay" role="dialog" aria-modal="true" aria-label={isEn ? "Request accepted" : "Заявка принята"}>
          <div className="vx-modalCard vx-contactModalCard vx-requestDoneCard" onClick={(e) => e.stopPropagation()}>
            <div className="vx-requestDoneHero" aria-hidden="true">✓</div>
            <div className="vx-modalTitle">
              {isEn ? "Request accepted" : "Заявка принята"}
            </div>
            <div className="vx-requestDoneText">
              {requestSuccessModal.needsManualManagerContact
                ? (isEn
                  ? "Since you do not have a username, please copy the request details and contact the manager."
                  : "Так как у вас отсутствует юзернейм, пожалуйста скопируйте данные заявки и свяжитесь с менеджером")
                : (isEn
                  ? "A manager will contact you soon."
                  : "В ближайшее время с вами свяжется менеджер.")}
            </div>
            {requestSuccessModal.needsManualManagerContact ? (
              <>
                <button
                  type="button"
                  className="vx-primary vx-requestManagerBtn"
                  onClick={() => copyRequestInfo(requestSuccessModal.requestId, requestSuccessModal.copyText)}
                >
                  {isEn ? "Copy request data" : "Скопировать данные заявки"}
                </button>
                <button
                  type="button"
                  className="vx-primary vx-requestManagerBtn"
                  onClick={() => {
                    openManagerContactLink(me);
                    setRequestSuccessModal(null);
                  }}
                >
                  {isEn ? "Contact manager" : "Связаться с менеджером"}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="vx-primary vx-requestManagerBtn"
                onClick={() => setRequestSuccessModal(null)}
              >
                {isEn ? "OK" : "Понятно"}
              </button>
            )}
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div className="vx-calc cx-calc">
      {requestDoneModal}

      {banner ? (
        <div className={banner.type === "err" ? "vx-toast vx-toastErr" : "vx-toast vx-toastOk"}>{banner.text}</div>
      ) : null}

      {loading && <div className="vx-help">{isEn ? "Loading rates…" : "Загрузка курсов…"}</div>}
      {!loading && (!rates || (!market && gMode)) && <div className="vx-help">{isEn ? "Rates are not loaded." : "Курсы не загружены."}</div>}

      {!isAdminMode && managerOffline ? (
        <div className="vx-note vx-noteWarn" style={{ marginBottom: 10 }}>
          {isEn ? `Thank you for contacting us. It is now ${danangTime.label} in Da Nang. You can create a request during working hours.` : `Спасибо за обращение. Сейчас в Дананге ${danangTime.label}. Оставить заявку Вы можете в рабочее время.`}
        </div>
      ) : !isAdminMode && deliveryClosed ? (
        <div className="vx-note vx-noteWarn" style={{ marginBottom: 10 }}>
          {isEn ? `After 20:00 in Da Nang, cash delivery is unavailable. It is now ${danangTime.label} in Da Nang. Only remote exchange is available.` : `После 20:00 по Данангу доставка уже не работает. Сейчас в Дананге ${danangTime.label}. Доступен только дистанционный обмен.`}
        </div>
      ) : null}

      {receiveMethodUnavailableByHours ? (
        <div className="vx-warn" style={{ marginBottom: 10 }}>
          {isEn ? "After 20:00 only Transfer or ATM receive methods are available. Payout for the selected currency is currently unavailable." : "После 20:00 доступны только способы получения «Перевод» или «Банкомат». Для выбранной валюты выдача сейчас недоступна."}
        </div>
      ) : null}

      <div className="cx-calcBody">
        <div className="cx-amountCards">
          <div className="cx-amtCard">
            <div className="cx-amtLabel">
              <span>{isEn ? "You give" : "Вы отдаёте"}</span>
              {!(isVndToVnd && sellCurrency === "VND") ? (
                <span className="cx-amtLabelHint">{isEn ? "min." : "мин."} {minSellAmountLabel(sellCurrency)}</span>
              ) : null}
            </div>
            <div className="cx-amtRow">
              <span className="cx-curChip">
                <span className="cx-curCircle" data-cur={sellCurrency} aria-hidden="true">{currencySymbol(sellCurrency)}</span>
                <span className="cx-curCode">{sellCurrency}</span>
                <ChevronDownIcon />
                <select
                  className="cx-curSelect"
                  aria-label={isEn ? "Currency you give" : "Валюта, которую отдаёте"}
                  value={sellCurrency}
                  onChange={(e) => {
                    preserveSwappedValuesRef.current = false;
                    setSellCurrency(e.target.value as Currency);
                  }}
                >
                  {CURRENCY_OPTIONS.map((c) => (
                    <option key={"sell-" + c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </span>

              <input
                ref={sellInputRef}
                aria-label={isEn ? "Amount you give" : "Сумма, которую отдаёте"}
                inputMode={amountMaxDecimals(sellCurrency) > 0 ? "decimal" : "numeric"}
                placeholder="0"
                value={sellText}
                className={"cx-amtInput" + (invalidUsdSell || invalidEurSell || invalidThbSell || invalidVndSellCash || invalidMinSell ? " cx-amtInvalid" : "")}
                onChange={(e) => {
                  preserveSwappedValuesRef.current = false;
                  lastEdited.current = "sell";
                  const formatted = formatAmountInput(sellCurrency, e.currentTarget.value, sellText, inputHintFromEvent(e));
                  const next = formatted.text;
                  pendingCaretRef.current = makePendingCaret("sell", e.currentTarget, formatted);
                  sellRawRef.current = next.trim() ? parseAmount(sellCurrency, next) : null;
                  setSellText(next);
                }}
              />
            </div>
          </div>

          <div className="cx-amtCard cx-amtCardGet">
            <div className="cx-amtLabel">
              <span>{isEn ? "You get" : "Вы получаете"}</span>
            </div>
            <div className="cx-amtRow">
              <span className="cx-curChip">
                <span className="cx-curCircle" data-cur={buyCurrency} aria-hidden="true">{currencySymbol(buyCurrency)}</span>
                <span className="cx-curCode">{buyCurrency}</span>
                <ChevronDownIcon />
                <select
                  className="cx-curSelect"
                  aria-label={isEn ? "Currency you get" : "Валюта, которую получаете"}
                  value={buyCurrency}
                  onChange={(e) => {
                    preserveSwappedValuesRef.current = false;
                    setBuyCurrency(e.target.value as Currency);
                  }}
                >
                  {CURRENCY_OPTIONS.map((c) => (
                    <option key={"buy-" + c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </span>

              <input
                ref={buyInputRef}
                aria-label={isEn ? "Amount you get" : "Сумма, которую получаете"}
                inputMode={amountMaxDecimals(buyCurrency) > 0 ? "decimal" : "numeric"}
                placeholder="0"
                value={buyText}
                className={"cx-amtInput" + (invalidUsdBuy || invalidEurBuy || invalidThbBuy || invalidVndBuyCash || invalidVndBuyAtm ? " cx-amtInvalid" : "")}
                onChange={(e) => {
                  preserveSwappedValuesRef.current = false;
                  lastEdited.current = "buy";
                  const formatted = formatAmountInput(buyCurrency, e.currentTarget.value, buyText, inputHintFromEvent(e));
                  const next = formatted.text;
                  pendingCaretRef.current = makePendingCaret("buy", e.currentTarget, formatted);
                  buyRawRef.current = next.trim() ? parseAmount(buyCurrency, next) : null;
                  setBuyText(next);
                }}
              />
            </div>
          </div>

          <button type="button" className="cx-swapFab" onClick={swapCurrencies} title={isEn ? "Swap" : "Поменять местами"} aria-label={isEn ? "Swap currencies" : "Поменять валюты местами"}>
            <SwapIcon />
          </button>
        </div>

        {unitRate || rateUpdatedLabel ? (
          <div className="cx-rateNote">
            {unitRate ? (
              <span className="cx-rateValue">
                1&nbsp;{currencySymbol(unitRate.unitCur)}&nbsp;=&nbsp;{fmtUnitRate(unitRate.rate, isEn)}&nbsp;{currencySymbol(unitRate.quoteCur)}
              </span>
            ) : null}
            {unitRate && rateUpdatedLabel ? <span className="cx-rateNoteDot">•</span> : null}
            {rateUpdatedLabel ? (
              <>
                <span className="cx-freshDot" aria-hidden="true" />
                <span>{rateUpdatedLabel}</span>
              </>
            ) : null}
          </div>
        ) : (
          <div style={{ height: 13 }} />
        )}

        {rateBreakdown ? <div className="cx-bonusLine">{rateBreakdown}</div> : null}

        <div className="cx-calcSide">
          {allowedPay.length ? (
            <div className="cx-methodRow">
              <span className="cx-methodRowLabel">{isEn ? "Payment" : "Оплата"}</span>
              <div className="cx-methodRowChips">
                {allowedPay.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={"cx-methodBtn" + (payMethod === m ? " is-active" : "")}
                    onClick={() => {
                      preserveSwappedValuesRef.current = false;
                      payMethodAutoSelectedRef.current = false;
                      setPayMethod(m);
                    }}
                  >
                    {uiMethodLabel(m)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {allowedRecv.length ? (
            <div className="cx-methodRow">
              <span className="cx-methodRowLabel">{isEn ? "Receive" : "Получение"}</span>
              <div className="cx-methodRowChips">
                {allowedRecv.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={"cx-methodBtn" + (receiveMethod === m ? " is-active" : "")}
                    onClick={() => {
                      preserveSwappedValuesRef.current = false;
                      receiveMethodAutoSelectedRef.current = false;
                      setReceiveMethod(m);
                    }}
                  >
                    {uiMethodLabel(m)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

            {usdNote ? <div className="vx-note">{usdNote}</div> : null}
            {eurNote ? <div className="vx-note">{eurNote}</div> : null}
            {vndNote ? <div className="vx-note">{vndNote}</div> : null}
            {thbNote ? <div className="vx-note">{thbNote}</div> : null}

            {invalidUsdSell || invalidUsdBuy ? <div className="vx-warn">{isEn ? "USD: cash only, in multiples of 100." : "USD: передать и получить можно только наличными, кратно 100."}</div> : null}
            {invalidEurSell || invalidEurBuy ? <div className="vx-warn">{isEn ? "EUR: cash only, in multiples of 50." : "EUR: передать и получить можно только наличными, кратно 50."}</div> : null}
            {invalidThbSell || invalidThbBuy ? <div className="vx-warn">{isEn ? "THB: cash only, in multiples of 100." : "THB: передать и получить можно только наличными, кратно 100."}</div> : null}
            {vndAtmNote ? <div className="vx-note">{vndAtmNote}</div> : null}
            {invalidVndBuyAtm ? <div className="vx-warn">{isEn ? "VND via ATM must be in multiples of 100,000." : "Получение VND через банкомат должно быть кратно 100,000."}</div> : null}
            {minSellNote ? <div className="vx-warn">{minSellNote}</div> : null}
            {showCashDeliveryNote ? (
              <div className="vx-warn" role="alert">
                {isEn ? "Delivery will cost from 70,000 VND." : "Стоимость доставки составит от 70,000 VND."}
              </div>
            ) : null}

            {!isAdminMode ? (
              <>
                <div className="vx-sp12" />

                <div
                  ref={commentComposerRef}
                  className={"vx-requestComposer" + (commentKeyboardInset > 0 ? " is-lifted" : "")}
                  style={commentKeyboardInset > 0 ? { bottom: `${commentKeyboardInset}px` } : undefined}
                >
                  <textarea
                    ref={commentFieldRef}
                    className="input vx-in vx-requestCommentInput"
                    rows={1}
                    placeholder={uiCommentPlaceholder(receiveMethod)}
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

                  <input
                    ref={requestAttachmentInputRef}
                    type="file"
                    accept="image/*"
                    className="vx-requestAttachInput"
                    onChange={async (e) => {
                      const file = e.target.files?.[0] || null;
                      await handleRequestAttachmentChange(file);
                      e.currentTarget.value = "";
                    }}
                  />

                  {requestAttachmentImageDataUrl ? (
                    <>
                      <div className="vx-sp10" />
                      <div className="vx-requestAttachmentPreview">
                        <img className="vx-requestAttachmentThumb" src={requestAttachmentImageDataUrl} alt="" />
                        <div className="vx-requestAttachmentInfo">
                          <div className="vx-requestAttachmentTitle">{requestAttachmentName || (isEn ? "Attached image" : "Прикреплённое фото")}</div>
                          <div className="vx-requestAttachmentMeta">{requestAttachmentSizeLabel || (isEn ? "Image attached" : "Фото прикреплено")}</div>
                        </div>
                        <button
                          type="button"
                          className="vx-requestAttachmentRemove"
                          onClick={clearRequestAttachment}
                          aria-label={isEn ? "Remove attached image" : "Убрать прикреплённое фото"}
                          title={isEn ? "Remove image" : "Убрать фото"}
                        >
                          ×
                        </button>
                      </div>
                    </>
                  ) : null}

                  <div className="vx-sp12" />

                  <div className="cx-ctaRow">
                    <button
                      type="button"
                      className={"cx-cta" + (!canSend ? " is-disabled" : "")}
                      disabled={sendButtonDisabled}
                      aria-disabled={!canSend}
                      onClick={sendRequest}
                    >
                      {isEn ? "Send request" : "Отправить заявку"}
                      <ArrowRightIcon />
                    </button>

                    <button
                      type="button"
                      className={"cx-attachBtn" + (requestAttachmentImageDataUrl ? " is-active" : "")}
                      onClick={() => requestAttachmentInputRef.current?.click()}
                      aria-label={isEn ? "Attach image" : "Прикрепить фото"}
                      title={isEn ? "Attach image" : "Прикрепить фото"}
                    >
                      <PaperclipIcon className="vx-requestAttachIcon" />
                    </button>
                  </div>

                  <div className="cx-consent">
                    {isEn ? (
                      <>
                        By sending a request you consent to the{" "}
                        <button type="button" className="cx-consentLink" onClick={() => onOpenDoc?.("privacy")}>processing of personal data</button>
                        {" "}and accept the{" "}
                        <button type="button" className="cx-consentLink" onClick={() => onOpenDoc?.("terms")}>terms of service</button>.
                      </>
                    ) : (
                      <>
                        Отправляя заявку, вы даёте согласие на{" "}
                        <button type="button" className="cx-consentLink" onClick={() => onOpenDoc?.("privacy")}>обработку персональных данных</button>
                        {" "}и принимаете{" "}
                        <button type="button" className="cx-consentLink" onClick={() => onOpenDoc?.("terms")}>пользовательское соглашение</button>.
                      </>
                    )}
                  </div>
                </div>
              </>
            ) : null}
        </div>
      </div>
    </div>
  );
}
