import React, { useEffect, useMemo, useState } from "react";
import { DirectionPicker, EffectiveRatesTable, markupUnitHint } from "../admin/EffectiveRates";
import { DEFAULT_G_FORMULAS, G_FORMULA_KEYS, calcFromGRate } from "../domain/exchange";
import {
  MARKUP_DIRECTIONS,
  allowedReceiveMethods,
  directionKey,
  emptyPairMarkup,
  fmtUnitRate,
  hasAnyMarkup,
  receiveMethodLabel,
  type PricingContext,
  type VndRates,
} from "../domain/pricing";
import { getUserStatusLabelRu, normalizeUserStatus, USER_STATUS_OPTIONS_RU } from "../domain/status";
import {
  apiAdminSetTodayRates,
  apiAdminGetRequests,
  apiAdminSetRequestState,
  apiAdminSetUserStatus,
  apiAdminUsers,
  apiGetTodayRates,
  apiGetGFormulas,
  apiGetMarketRates,
  apiAdminGetBonuses,
  apiAdminSetBonuses,
  apiAdminGetReviews,
  apiAdminApproveReview,
  apiAdminRejectReview,
  apiAdminReplyReview,
  apiAdminGetRatesRange
} from "../lib/api";
import type {
  BonusesConfig,
  BonusesTier,
  CrossRates,
  Currency,
  GFormulas,
  MarketRatesResponse,
  PairMarkup,
  ReceiveMethod
} from "../lib/types";

const REQUEST_STATE_OPTIONS = [
  { value: "new", label: "Принята" },
  { value: "in_progress", label: "В работе" },
  { value: "done", label: "Готово" },
  { value: "canceled", label: "Отклонена" }
] as const;

type RateRowProps = {
  code: string;
  buy: string;
  sell: string;
  setBuy: (v: string) => void;
  setSell: (v: string) => void;
  buyPlaceholder?: string;
  sellPlaceholder?: string;
};

// ВАЖНО: компонент вынесен наружу.
// Если объявлять компонент внутри AdminTab, на каждом setState создаётся НОВАЯ функция-компонент,
// React размонтирует/монтирует её заново → инпут теряет фокус → клавиатура закрывается.
const RateRow = React.memo(function RateRow(props: RateRowProps) {
  return (
    <div className="vx-rateRow">
      <div className="vx-code">{props.code}</div>

      <div className="vx-fields">
        <div className="vx-field">
          <input
            className="input vx-in"
            inputMode="decimal"
            value={props.buy}
            onChange={(e) => props.setBuy(e.target.value)}
            placeholder={props.buyPlaceholder ?? "0"}
          />
        </div>

        <div className="vx-field">
          <input
            className="input vx-in"
            inputMode="decimal"
            value={props.sell}
            onChange={(e) => props.setSell(e.target.value)}
            placeholder={props.sellPlaceholder ?? "0"}
          />
        </div>
      </div>
    </div>
  );
});

function parseNumInput(s: string): number {
  const t = String(s ?? "").replace(",", ".").trim();
  if (t === "") return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

// Numeric cell that keeps the typed text ("0." / "0,5") while the config stores numbers.
// Declared outside AdminTab for the same focus reason as RateRow.
const NumInput = React.memo(function NumInput(props: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  integer?: boolean;
  allowEmpty?: boolean;
  placeholder?: string;
}) {
  const shown = props.value == null ? "" : String(props.value);
  const [text, setText] = useState(shown);
  useEffect(() => {
    const current = text.trim() === "" && props.allowEmpty ? undefined : parseNumInput(text);
    if (current !== props.value) setText(shown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.value]);

  return (
    <input
      className="input vx-in"
      inputMode={props.integer ? "numeric" : "decimal"}
      value={text}
      placeholder={props.placeholder}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        if (raw.trim() === "" && props.allowEmpty) return props.onChange(undefined);
        const n = parseNumInput(raw);
        props.onChange(props.integer ? Math.max(0, Math.floor(n)) : n);
      }}
    />
  );
});

function statusLabelAny(s: any) {
  return getUserStatusLabelRu(s);
}

function statusValueAny(s: any): "standard" | "silver" | "gold" {
  return normalizeUserStatus(s);
}

function nStr(v: any) {
  const s = String(v ?? "");
  return s === "0" ? "" : s;
}

function toNumStrict(label: string, s: string) {
  const n = Number(String(s).replace(",", ".").trim());
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Заполни корректно: ${label}`);
  return n;
}

function toPositiveOrNull(s: string): number | null {
  const n = Number(String(s ?? "").replace(",", ".").trim());
  return String(s ?? "").trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
}

type CrossDraft = Record<string, { buy: string; sell: string }>;

function emptyCrossDraft(): CrossDraft {
  return Object.fromEntries(G_FORMULA_KEYS.map((k) => [k, { buy: "", sell: "" }]));
}

// Защита от «битых» данных в store.json (например, bonuses = {}), чтобы UI не падал.
function normalizeBonuses(input: any): BonusesConfig {
  const src = input && typeof input === "object" ? input : {};
  const num = (v: any, d = 0) => {
    const n = Number(String(v ?? "").replace(",", ".").trim());
    return Number.isFinite(n) ? n : d;
  };
  const tierList = (arr: any): BonusesTier[] => (Array.isArray(arr) ? arr : []);

  const methodRow = (row: any) => ({
    RUB: num(row?.RUB, 0),
    USD: num(row?.USD, 0),
    USDT: num(row?.USDT, 0),
    EUR: num(row?.EUR, 0),
    THB: num(row?.THB, 0),
    KZT: num(row?.KZT, 0)
  });

  const srcPairs = src.pairs && typeof src.pairs === "object" ? src.pairs : null;
  const pairs: Record<string, PairMarkup> = {};
  for (const d of MARKUP_DIRECTIONS) {
    let p: any = srcPairs?.[d.key];
    if (!srcPairs && d.to === "VND" && d.from !== "VND") {
      // Legacy config: only "currency → VND" had markups.
      p = {
        tiers: src?.tiers?.[d.from],
        methods: { cash: 0, transfer: src?.methods?.transfer?.[d.from], atm: src?.methods?.atm?.[d.from] }
      };
    }
    if (!p || typeof p !== "object") continue;
    pairs[d.key] = {
      tiers: tierList(p.tiers),
      methods: { cash: num(p.methods?.cash), transfer: num(p.methods?.transfer), atm: num(p.methods?.atm) }
    };
  }

  return {
    enabled: {
      tiers: typeof src?.enabled?.tiers === "boolean" ? src.enabled.tiers : true,
      methods: typeof src?.enabled?.methods === "boolean" ? src.enabled.methods : true
    },
    pairs,
    tiers: {
      RUB: tierList(src?.tiers?.RUB),
      USD: tierList(src?.tiers?.USD),
      USDT: tierList(src?.tiers?.USDT),
      EUR: tierList(src?.tiers?.EUR),
      THB: tierList(src?.tiers?.THB),
      KZT: tierList(src?.tiers?.KZT)
    },
    methods: {
      transfer: methodRow(src?.methods?.transfer),
      atm: methodRow(src?.methods?.atm)
    }
  };
}

const VND_RATE_CURRENCIES = ["RUB", "USDT", "USD", "EUR", "THB", "KZT"] as const;

type AdminSection = "rates" | "users" | "requests" | "bonuses" | "reviews";

export default function AdminTab({
  me,
  forcedSection,
  hideHeader,
  hideSeg
}: {
  me: any;
  forcedSection?: AdminSection;
  hideHeader?: boolean;
  hideSeg?: boolean;
}) {
  const [section, setSection] = useState<AdminSection>(forcedSection || "rates");

  // Allow the parent to fully control which section is displayed.
  useEffect(() => {
    if (!forcedSection) return;
    setSection(forcedSection);
  }, [forcedSection]);

  // По умолчанию ВСЁ пустое (без подстановки старых значений)
  const [usdBuy, setUsdBuy] = useState("");
  const [usdSell, setUsdSell] = useState("");

  const [rubBuy, setRubBuy] = useState("");
  const [rubSell, setRubSell] = useState("");

  const [usdtBuy, setUsdtBuy] = useState("");
  const [usdtSell, setUsdtSell] = useState("");

  const [eurBuy, setEurBuy] = useState("");
  const [eurSell, setEurSell] = useState("");

  const [thbBuy, setThbBuy] = useState("");
  const [thbSell, setThbSell] = useState("");
  const [kztBuy, setKztBuy] = useState("");
  const [kztSell, setKztSell] = useState("");

  // Ручные кросс-курсы (без VND): пусто — считается по G × множитель.
  const [crossDraft, setCrossDraft] = useState<CrossDraft>(emptyCrossDraft);

  // Сохранённые курсы и рыночные данные — для итоговых таблиц и подсказок.
  const [savedRates, setSavedRates] = useState<VndRates | null>(null);
  const [savedCross, setSavedCross] = useState<CrossRates | null>(null);
  const [market, setMarket] = useState<MarketRatesResponse | null>(null);
  const [formulas, setFormulas] = useState<GFormulas>(DEFAULT_G_FORMULAS);

  const [ratesDir, setRatesDir] = useState<{ from: Currency; to: Currency }>({ from: "RUB", to: "VND" });
  const [bonusDir, setBonusDir] = useState<{ from: Currency; to: Currency }>({ from: "RUB", to: "VND" });

  const [users, setUsers] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [requestsFilter, setRequestsFilter] = useState<"all" | "new" | "in_progress" | "done" | "canceled">("all");

  const [bonuses, setBonuses] = useState<BonusesConfig | null>(null);
  const [bonusesBusy, setBonusesBusy] = useState(false);
  const [bonusesLoaded, setBonusesLoaded] = useState(false);

  const [reviewsLoaded, setReviewsLoaded] = useState(false);
  const [reviewsBusy, setReviewsBusy] = useState(false);
  const [adminReviews, setAdminReviews] = useState<any[]>([]);
  const [reviewsFilter, setReviewsFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  const vndDraft: Record<(typeof VND_RATE_CURRENCIES)[number], { buy: string; sell: string }> = {
    RUB: { buy: rubBuy, sell: rubSell },
    USDT: { buy: usdtBuy, sell: usdtSell },
    USD: { buy: usdBuy, sell: usdSell },
    EUR: { buy: eurBuy, sell: eurSell },
    THB: { buy: thbBuy, sell: thbSell },
    KZT: { buy: kztBuy, sell: kztSell }
  };

  const clearRates = () => {
    setRubBuy(""); setRubSell("");
    setUsdtBuy(""); setUsdtSell("");
    setUsdBuy(""); setUsdSell("");
    setEurBuy(""); setEurSell("");
    setThbBuy(""); setThbSell("");
    setKztBuy(""); setKztSell("");
    setCrossDraft(emptyCrossDraft());
  };

  const setCrossField = (key: string, field: "buy" | "sell", value: string) => {
    setCrossDraft((prev) => ({ ...prev, [key]: { ...(prev[key] || { buy: "", sell: "" }), [field]: value } }));
  };

  const loadUsers = async () => {
    const r = await apiAdminUsers(me.initData);
    if (r.ok) setUsers(r.users);
  };

  const loadRequests = async () => {
    const r = await apiAdminGetRequests(me.initData);
    if (r.ok) setRequests(r.requests || []);
  };

  const applyRatesToForm = (rates: any, cross?: any) => {
    if (!rates || typeof rates !== "object") return;
    clearRates();
    if (rates.USD) { setUsdBuy(nStr(rates.USD.buy_vnd)); setUsdSell(nStr(rates.USD.sell_vnd)); }
    if (rates.RUB) { setRubBuy(nStr(rates.RUB.buy_vnd)); setRubSell(nStr(rates.RUB.sell_vnd)); }
    if (rates.USDT) { setUsdtBuy(nStr(rates.USDT.buy_vnd)); setUsdtSell(nStr(rates.USDT.sell_vnd)); }
    if (rates.EUR) { setEurBuy(nStr(rates.EUR.buy_vnd)); setEurSell(nStr(rates.EUR.sell_vnd)); }
    if (rates.THB) { setThbBuy(nStr(rates.THB.buy_vnd)); setThbSell(nStr(rates.THB.sell_vnd)); }
    if (rates.KZT) { setKztBuy(nStr(rates.KZT.buy_vnd)); setKztSell(nStr(rates.KZT.sell_vnd)); }
    const nextCross = emptyCrossDraft();
    if (cross && typeof cross === "object") {
      for (const k of G_FORMULA_KEYS) {
        if (cross[k]) nextCross[k] = { buy: nStr(cross[k].buy), sell: nStr(cross[k].sell) };
      }
    }
    setCrossDraft(nextCross);
  };

  const daNangISO = (shiftDays = 0) => {
    const d = new Date(Date.now() + shiftDays * 24 * 60 * 60 * 1000);
    return d.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  };

  const fetchSavedRates = async () => {
    const r = await apiGetTodayRates();
    const data = (r as any)?.data;
    setSavedRates(data?.rates ?? null);
    setSavedCross(data?.cross ?? null);
    return data;
  };

  const loadRates = async () => {
    const data = await fetchSavedRates();
    if (!data?.rates) return;
    applyRatesToForm(data.rates, data.cross);
  };

  const loadYesterdayRates = async () => {
    const day = daNangISO(-1);
    const r: any = await apiAdminGetRatesRange(me.initData, { from: day, to: day });
    const item = Array.isArray(r?.items) ? r.items.find((x: any) => String(x?.date || "") === day) : null;
    const rates = item?.rates;
    if (!rates) {
      alert(`За ${day} курс не найден`);
      return;
    }
    applyRatesToForm(rates, item?.cross);
  };

  useEffect(() => {
    loadUsers();
    loadRequests();
    // ВАЖНО: не подставляем сохранённые курсы автоматически — всё начинается пустым.
    clearRates();
    // Сохранённые курсы, рынок и формулы нужны только для подсказок и итоговых таблиц.
    void fetchSavedRates().catch(() => null);
    apiGetMarketRates().then(setMarket).catch(() => null);
    apiGetGFormulas()
      .then((f: any) => {
        if (f?.ok && f.formulas && typeof f.formulas === "object") setFormulas(f.formulas);
      })
      .catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Надбавки нужны разделу «Надбавки» и итоговой таблице в разделе «Курс»
  useEffect(() => {
    if ((section === "bonuses" || section === "rates") && !bonusesLoaded) {
      (async () => {
        setBonusesBusy(true);
        try {
          const r = await apiAdminGetBonuses(me.initData);
          if (r.ok) {
            setBonuses(normalizeBonuses((r as any).bonuses));
            setBonusesLoaded(true);
          } else if (section === "bonuses") {
            alert(r.error || "Ошибка загрузки надбавок");
          }
        } finally {
          setBonusesBusy(false);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, bonusesLoaded]);

  // Загружаем отзывы только когда владелец открыл этот раздел
  useEffect(() => {
    if (section === "reviews" && !reviewsLoaded) {
      (async () => {
        setReviewsBusy(true);
        try {
          const r = await apiAdminGetReviews(me.initData);
          if (r.ok) {
            setAdminReviews(Array.isArray(r.reviews) ? r.reviews : []);
            setReviewsLoaded(true);
          } else {
            alert(r.error || "Ошибка загрузки отзывов");
          }
        } finally {
          setReviewsBusy(false);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, reviewsLoaded]);

  const reloadReviews = async () => {
    setReviewsBusy(true);
    try {
      const r = await apiAdminGetReviews(me.initData);
      if (r.ok) {
        setAdminReviews(Array.isArray(r.reviews) ? r.reviews : []);
        setReviewsLoaded(true);
      } else {
        alert(r.error || "Ошибка загрузки отзывов");
      }
    } finally {
      setReviewsBusy(false);
    }
  };

  const approveReview = async (id: string) => {
    setReviewsBusy(true);
    try {
      const r = await apiAdminApproveReview(me.initData, id);
      if (!r.ok) alert(r.error || "Ошибка");
      await reloadReviews();
    } finally {
      setReviewsBusy(false);
    }
  };

  const rejectReview = async (id: string) => {
    setReviewsBusy(true);
    try {
      const r = await apiAdminRejectReview(me.initData, id);
      if (!r.ok) alert(r.error || "Ошибка");
      await reloadReviews();
    } finally {
      setReviewsBusy(false);
    }
  };

  const replyReview = async (id: string, text: string) => {
    const t = String(text || "").trim();
    if (!t) return;
    setReviewsBusy(true);
    try {
      const r = await apiAdminReplyReview(me.initData, id, t);
      if (!r.ok) alert(r.error || "Ошибка");
      await reloadReviews();
    } finally {
      setReviewsBusy(false);
    }
  };

  const saveRates = async () => {
    try {
      const hasAny = (a: string, b: string) => a.trim() !== "" || b.trim() !== "";
      const hasBoth = (a: string, b: string) => a.trim() !== "" && b.trim() !== "";

      // EUR/THB — опционально: либо оба поля заполнены, либо оба пустые
      if (hasAny(eurBuy, eurSell) && !hasBoth(eurBuy, eurSell)) {
        throw new Error("EUR: заполни BUY и SELL (или оставь оба поля пустыми)");
      }
      if (hasAny(thbBuy, thbSell) && !hasBoth(thbBuy, thbSell)) {
        throw new Error("THB: заполни BUY и SELL (или оставь оба поля пустыми)");
      }
      if (hasAny(kztBuy, kztSell) && !hasBoth(kztBuy, kztSell)) {
        throw new Error("KZT: заполни BUY и SELL (или оставь оба поля пустыми)");
      }

      const rates: any = {
        RUB: { buy_vnd: toNumStrict("RUB BUY", rubBuy), sell_vnd: toNumStrict("RUB SELL", rubSell) },
        USDT: { buy_vnd: toNumStrict("USDT BUY", usdtBuy), sell_vnd: toNumStrict("USDT SELL", usdtSell) },
        USD: { buy_vnd: toNumStrict("USD BUY", usdBuy), sell_vnd: toNumStrict("USD SELL", usdSell) }
      };

      if (hasBoth(eurBuy, eurSell)) {
        rates.EUR = { buy_vnd: toNumStrict("EUR BUY", eurBuy), sell_vnd: toNumStrict("EUR SELL", eurSell) };
      }
      if (hasBoth(thbBuy, thbSell)) {
        rates.THB = { buy_vnd: toNumStrict("THB BUY", thbBuy), sell_vnd: toNumStrict("THB SELL", thbSell) };
      }
      if (hasBoth(kztBuy, kztSell)) {
        rates.KZT = { buy_vnd: toNumStrict("KZT BUY", kztBuy), sell_vnd: toNumStrict("KZT SELL", kztSell) };
      }

      // Кросс-курсы — опционально, по тем же правилам
      const cross: CrossRates = {};
      for (const k of G_FORMULA_KEYS) {
        const d = crossDraft[k] || { buy: "", sell: "" };
        if (!hasAny(d.buy, d.sell)) continue;
        if (!hasBoth(d.buy, d.sell)) throw new Error(`${k}: заполни BUY и SELL (или оставь оба поля пустыми)`);
        cross[k] = { buy: toNumStrict(`${k} BUY`, d.buy), sell: toNumStrict(`${k} SELL`, d.sell) };
      }

      const r = await apiAdminSetTodayRates(me.initData, rates, cross);
      if (r.ok) {
        setSavedRates(r.data?.rates ?? rates);
        setSavedCross(r.data?.cross ?? null);
        alert("Курс сохранён ✅");
      } else alert(r.error || "Ошибка");
    } catch (e: any) {
      alert(e?.message || "Проверь значения");
    }
  };

  const setStatus = async (tgId: number, status: string) => {
    const r = await apiAdminSetUserStatus(me.initData, tgId, status);
    if (r.ok) {
      loadUsers();
      if (r.notification?.message) alert(r.notification.message);
    }
    else alert(r.error || "Ошибка");
  };

  const setRequestState = async (id: string, state: string) => {
    const r = await apiAdminSetRequestState(me.initData, id, state);
    if (r.ok) loadRequests();
    else alert(r.error || "Ошибка");
  };

  // --------------------
  // Итоговые курсы
  // --------------------
  // Пустая форма — показываем сохранённый курс; иначе — то, что введено в форме
  // (пустой кросс-курс в форме означает расчёт по G × множитель).
  const formHasValues =
    VND_RATE_CURRENCIES.some((c) => vndDraft[c].buy.trim() !== "" || vndDraft[c].sell.trim() !== "") ||
    G_FORMULA_KEYS.some((k) => (crossDraft[k]?.buy || "").trim() !== "" || (crossDraft[k]?.sell || "").trim() !== "");

  const ratesPreviewCtx = useMemo<PricingContext>(() => {
    if (!formHasValues) return { rates: savedRates, cross: savedCross, market, formulas };
    const rates: VndRates = {};
    for (const c of VND_RATE_CURRENCIES) {
      const buy = toPositiveOrNull(vndDraft[c].buy);
      const sell = toPositiveOrNull(vndDraft[c].sell);
      if (buy && sell) rates[c] = { buy_vnd: buy, sell_vnd: sell };
    }
    const cross: CrossRates = {};
    for (const k of G_FORMULA_KEYS) {
      const buy = toPositiveOrNull(crossDraft[k]?.buy || "");
      const sell = toPositiveOrNull(crossDraft[k]?.sell || "");
      if (buy && sell) cross[k] = { buy, sell };
    }
    return { rates, cross, market, formulas };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formHasValues, savedRates, savedCross, market, formulas, rubBuy, rubSell, usdtBuy, usdtSell, usdBuy, usdSell, eurBuy, eurSell, thbBuy, thbSell, kztBuy, kztSell, crossDraft]);

  const savedCtx = useMemo<PricingContext>(
    () => ({ rates: savedRates, cross: savedCross, market, formulas }),
    [savedRates, savedCross, market, formulas]
  );

  const autoCrossPlaceholder = (key: string, side: "buy" | "sell") => {
    const [base, quote] = key.split("/") as [Currency, Currency];
    const v = calcFromGRate(market, formulas, base, quote)[side];
    return v == null ? "G" : `G: ${fmtUnitRate(v)}`;
  };

  // --------------------
  // Bonuses helpers
  // --------------------
  const bonusKey = directionKey(bonusDir.from, bonusDir.to);
  const bonusPair: PairMarkup = bonuses?.pairs[bonusKey] ?? emptyPairMarkup();
  const bonusMethods = allowedReceiveMethods(bonusDir.to);
  const configuredDirections = MARKUP_DIRECTIONS.filter((d) => hasAnyMarkup(bonuses?.pairs[d.key]));

  const setBonusEnabled = (key: "tiers" | "methods", on: boolean) => {
    setBonuses((p) => (p ? { ...p, enabled: { ...p.enabled, [key]: on } } : p));
  };

  const updPair = (key: string, fn: (p: PairMarkup) => PairMarkup) => {
    setBonuses((p) => (p ? { ...p, pairs: { ...p.pairs, [key]: fn(p.pairs[key] ?? emptyPairMarkup()) } } : p));
  };

  const updMethodBonus = (key: string, method: ReceiveMethod, v: number) => {
    updPair(key, (p) => ({ ...p, methods: { ...p.methods, [method]: v } }));
  };

  const updTier = (key: string, idx: number, patch: Partial<BonusesTier>) => {
    updPair(key, (p) => ({ ...p, tiers: p.tiers.map((t, i) => (i === idx ? { ...t, ...patch } : t)) }));
  };

  const addTier = (key: string) => {
    updPair(key, (p) => {
      const list = p.tiers;
      const last = list[list.length - 1];
      const min = list.length === 0 ? 0 : Number.isFinite(last?.max as any) ? Number(last.max) : Number(last?.min ?? 0) + 1;
      const row: BonusesTier = { min: Math.max(0, min || 0), standard: 0, silver: 0, gold: 0 };
      return { ...p, tiers: [...list, row] };
    });
  };

  // Пустой список допустим: для направления просто не будет надбавки по статусу.
  const delTier = (key: string, idx: number) => {
    updPair(key, (p) => ({ ...p, tiers: p.tiers.filter((_, i) => i !== idx) }));
  };

  const saveBonuses = async () => {
    if (!bonuses) return;
    setBonusesBusy(true);
    try {
      const r = await apiAdminSetBonuses(me.initData, bonuses);
      if (r.ok) {
        setBonuses(normalizeBonuses((r as any).bonuses));
        setBonusesLoaded(true);
        alert("Надбавки сохранены ✅");
      } else {
        alert(r.error || "Ошибка сохранения надбавок");
      }
    } finally {
      setBonusesBusy(false);
    }
  };

  const reloadBonuses = async () => {
    setBonusesBusy(true);
    try {
      const r = await apiAdminGetBonuses(me.initData);
      if (r.ok) {
        setBonuses(normalizeBonuses((r as any).bonuses));
        setBonusesLoaded(true);
      } else {
        alert(r.error || "Ошибка загрузки надбавок");
      }
    } finally {
      setBonusesBusy(false);
    }
  };

  return (
    <div className="vx-admin">

      {!hideHeader ? (
        <div className="vx-adminHead">
          <div className="h1">Управление</div>
        </div>
      ) : null}

      {!hideSeg ? (
        <div className="vx-adminSeg">
          <button className={section === "rates" ? "on" : ""} onClick={() => setSection("rates")}>Курс</button>
          <button className={section === "bonuses" ? "on" : ""} onClick={() => setSection("bonuses")}>Надбавки</button>
          <button className={section === "reviews" ? "on" : ""} onClick={() => setSection("reviews")}>Отзывы</button>
          <button className={section === "users" ? "on" : ""} onClick={() => setSection("users")}>Клиенты</button>
          <button className={section === "requests" ? "on" : ""} onClick={() => setSection("requests")}>Заявки</button>
        </div>
      ) : null}

      {section === "rates" ? (
        <div className="vx-mt10 vx-adminSection">
          <div className="small">Курс на сегодня (BUY/SELL к VND) — заполняется каждый день</div>
          <div className="hr" />

          <RateRow code="RUB" buy={rubBuy} sell={rubSell} setBuy={setRubBuy} setSell={setRubSell} />
          <RateRow code="USDT" buy={usdtBuy} sell={usdtSell} setBuy={setUsdtBuy} setSell={setUsdtSell} />
          <RateRow code="USD" buy={usdBuy} sell={usdSell} setBuy={setUsdBuy} setSell={setUsdSell} />
          <RateRow code="EUR" buy={eurBuy} sell={eurSell} setBuy={setEurBuy} setSell={setEurSell} />
          <RateRow code="THB" buy={thbBuy} sell={thbSell} setBuy={setThbBuy} setSell={setThbSell} />
          <RateRow code="KZT" buy={kztBuy} sell={kztSell} setBuy={setKztBuy} setSell={setKztSell} />

          <div className="hr" />
          <div className="small">
            Кросс-курсы без VND (BUY/SELL) — необязательно. Пустые поля — курс считается автоматически по G × множитель
            (текущее значение в подсказке).
          </div>
          <div className="vx-sp6" />

          {G_FORMULA_KEYS.map((k) => (
            <RateRow
              key={k}
              code={k}
              buy={crossDraft[k]?.buy ?? ""}
              sell={crossDraft[k]?.sell ?? ""}
              setBuy={(v) => setCrossField(k, "buy", v)}
              setSell={(v) => setCrossField(k, "sell", v)}
              buyPlaceholder={autoCrossPlaceholder(k, "buy")}
              sellPlaceholder={autoCrossPlaceholder(k, "sell")}
            />
          ))}

          <div className="vx-mt10">
            <div className="row vx-rowWrap vx-gap8">
              <button className="btn" onClick={saveRates}>Сохранить</button>
              <button className="btn" onClick={clearRates}>Очистить</button>
              <button className="btn" onClick={loadYesterdayRates}>Загрузить вчерашний</button>
              <button className="btn" onClick={loadRates}>Загрузить текущий</button>
            </div>
          </div>

          <div className="hr" />
          <div className="h3">Итоговый курс с надбавками</div>
          <div className="small">
            {formHasValues
              ? "Считается по курсу из формы (ещё не сохранённому) и сохранённым надбавкам."
              : "Считается по сохранённому курсу и сохранённым надбавкам."}
          </div>
          <DirectionPicker from={ratesDir.from} to={ratesDir.to} onChange={(from, to) => setRatesDir({ from, to })} />
          <EffectiveRatesTable from={ratesDir.from} to={ratesDir.to} bonuses={bonuses} ctx={ratesPreviewCtx} />
        </div>
      ) : null}

      {section === "bonuses" ? (
        <div className="vx-mt10 vx-adminSection">
          <div className="row vx-between vx-center">
            <div className="small">Надбавки (статусы / способ получения)</div>
            <div className="row vx-rowWrap vx-gap6">
              <button className="btn vx-btnSm" onClick={saveBonuses} disabled={bonusesBusy || !bonuses}>
                Сохранить
              </button>
              <button className="btn vx-btnSm" onClick={reloadBonuses} disabled={bonusesBusy}>
                Обновить
              </button>
            </div>
          </div>

          <div className="small vx-mt6">
            Надбавки задаются для каждого направления обмена (любая валюта → любая) и всегда идут в пользу клиента.
          </div>

          <div className="hr" />

          {!bonuses ? (
            <div className="small">Загрузка…</div>
          ) : (
            <>
              <div className="row vx-rowWrap vx-gap8">
                <button
                  className={
                    "btn vx-btnSm vx-toggleBtn " + (bonuses.enabled.tiers ? "is-on" : "is-off")
                  }
                  type="button"
                  onClick={() => setBonusEnabled("tiers", !bonuses.enabled.tiers)}
                  disabled={bonusesBusy}
                >
                  {bonuses.enabled.tiers ? "Надбавки по статусам: ВКЛ" : "Надбавки по статусам: ВЫКЛ"}
                </button>

                <button
                  className={
                    "btn vx-btnSm vx-toggleBtn " + (bonuses.enabled.methods ? "is-on" : "is-off")
                  }
                  type="button"
                  onClick={() => setBonusEnabled("methods", !bonuses.enabled.methods)}
                  disabled={bonusesBusy}
                >
                  {bonuses.enabled.methods ? "Надбавки за способ: ВКЛ" : "Надбавки за способ: ВЫКЛ"}
                </button>
              </div>

              <div className="vx-sp12" />

              <div className="h3">Направление</div>
              <DirectionPicker from={bonusDir.from} to={bonusDir.to} onChange={(from, to) => setBonusDir({ from, to })} />
              {configuredDirections.length ? (
                <div className="adx-dirChips" aria-label="Направления с надбавками">
                  {configuredDirections.map((d) => (
                    <button
                      key={d.key}
                      type="button"
                      className={"btn vx-btnSm " + (d.key === bonusKey ? "vx-btnOn" : "")}
                      onClick={() => setBonusDir({ from: d.from, to: d.to })}
                    >
                      {d.from} → {d.to}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="small vx-mt6">{markupUnitHint(bonusDir.from, bonusDir.to, formulas)}</div>

              <div className="hr" />

              <div className="h3">Надбавки за способ получения — {bonusDir.from} → {bonusDir.to}</div>
              <div className="vx-tableWrap vx-mt10">
                <table className="adx-table adx-matrix">
                  <thead>
                    <tr>
                      {bonusMethods.map((m) => (
                        <th key={m}>{receiveMethodLabel(m)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {bonusMethods.map((m) => (
                        <td key={m}>
                          <NumInput
                            key={`${bonusKey}-${m}`}
                            value={bonusPair.methods[m] ?? 0}
                            onChange={(v) => updMethodBonus(bonusKey, m, v ?? 0)}
                          />
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="hr" />

              <div className="adx-tierGroup">
                <div className="adx-tierHead">
                  <span className="h3 vx-m0">Надбавки по статусам и сумме, {bonusDir.from}</span>
                  <button className="btn vx-btnSm" type="button" onClick={() => addTier(bonusKey)} disabled={bonusesBusy}>
                    Добавить диапазон
                  </button>
                </div>
                <div className="small">
                  Диапазон действует при min ≤ сумма &lt; max (сумма в {bonusDir.from}, которую отдаёт клиент); max последнего диапазона
                  можно оставить пустым. Пустой список — надбавка по статусу не применяется.
                </div>

                {bonusPair.tiers.length === 0 ? (
                  <div className="vx-muted vx-mt6">Диапазонов нет.</div>
                ) : (
                  <div className="vx-tableWrap vx-mt10">
                    <table className="adx-table">
                      <thead>
                        <tr>
                          <th>Мин</th>
                          <th>Макс</th>
                          <th>Стандарт</th>
                          <th>Серебро</th>
                          <th>Золото</th>
                          <th aria-label="Действия" />
                        </tr>
                      </thead>
                      <tbody>
                        {bonusPair.tiers.map((t: BonusesTier, idx: number) => (
                          <tr key={`${bonusKey}-${idx}`}>
                            <td>
                              <NumInput integer value={t.min ?? 0} onChange={(v) => updTier(bonusKey, idx, { min: v ?? 0 })} />
                            </td>
                            <td>
                              <NumInput
                                integer
                                allowEmpty
                                placeholder="∞"
                                value={t.max == null ? undefined : t.max}
                                onChange={(v) => updTier(bonusKey, idx, { max: v })}
                              />
                            </td>
                            <td>
                              <NumInput value={t.standard ?? 0} onChange={(v) => updTier(bonusKey, idx, { standard: v ?? 0 })} />
                            </td>
                            <td>
                              <NumInput value={t.silver ?? 0} onChange={(v) => updTier(bonusKey, idx, { silver: v ?? 0 })} />
                            </td>
                            <td>
                              <NumInput value={t.gold ?? 0} onChange={(v) => updTier(bonusKey, idx, { gold: v ?? 0 })} />
                            </td>
                            <td>
                              <button className="btn vx-btnSm" type="button" onClick={() => delTier(bonusKey, idx)} disabled={bonusesBusy}>
                                Удалить
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="hr" />
              <div className="h3">Итоговый курс — {bonusDir.from} → {bonusDir.to}</div>
              <div className="small">По сохранённому курсу на сегодня и надбавкам на этой странице (включая несохранённые правки).</div>
              <EffectiveRatesTable from={bonusDir.from} to={bonusDir.to} bonuses={bonuses} ctx={savedCtx} />
            </>
          )}
        </div>
      ) : null}

      {section === "users" ? (
        <div className="vx-mt10 vx-adminSection">
          <div className="row vx-between vx-center">
            <div className="small">Клиенты и статусы</div>
            <button className="btn vx-btnSm" onClick={loadUsers}>Обновить</button>
          </div>
          <div className="hr" />

          {users.length === 0 ? (
            <div className="small">Пока нет клиентов (они появятся после входа в мини-апп).</div>
          ) : (
            users.map((u) => (
              <div key={u.tg_id} className="vx-mb10">
                <div>
                  <b>{u.first_name ?? ""} {u.last_name ?? ""}</b>{" "}
                  <span className="small">
                    {u.username ? "@" + u.username : ""} • id:{u.tg_id} • статус: {statusLabelAny(u.status)}
                  </span>
                </div>

                <div className="row vx-mt6 vx-rowWrap vx-gap6">
                  {USER_STATUS_OPTIONS_RU.map((s) => {
                    const isOn = statusValueAny(u.status) === s.value;
                    const activeStyle = isOn
                      ? (s.value === "standard"
                          ? { background: "rgba(9,23,33,.88)", color: "rgba(255,255,255,.96)", border: 0 }
                          : s.value === "silver"
                            ? { background: "rgba(190,198,210,.95)", color: "rgba(9,23,33,.92)", border: 0 }
                            : { background: "rgba(255,179,87,.96)", color: "rgba(26,18,8,.92)", border: 0 })
                      : undefined;
                    return (
                      <button
                        key={s.value}
                        className={`btn vx-btnSm vx-statusBtn vx-status-${s.value}${isOn ? " vx-btnOn" : ""}`}
                        style={activeStyle as any}
                        onClick={() => setStatus(u.tg_id, s.value)}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>

                <div className="hr" />
              </div>
            ))
          )}
        </div>
      ) : null}

      {section === "requests" ? (
        <div className="vx-mt10 vx-adminSection">
          <div className="row vx-between vx-center">
            <div className="small">Заявки</div>
            <button className="btn vx-btnSm" onClick={loadRequests}>Обновить</button>
          </div>

          <div className="row vx-rowWrap vx-gap6 vx-mt6">
            <button
              className={"btn vx-btnSm " + (requestsFilter === "all" ? "vx-btnOn" : "")}
              onClick={() => setRequestsFilter("all")}
            >
              Все
            </button>
            {REQUEST_STATE_OPTIONS.map((s) => (
              <button
                key={s.value}
                className={"btn vx-btnSm " + (requestsFilter === (s.value as any) ? "vx-btnOn" : "")}
                onClick={() => setRequestsFilter(s.value as any)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="hr" />

          {requests.length === 0 ? (
            <div className="small">Пока нет заявок.</div>
          ) : (
            (requestsFilter === "all" ? requests : requests.filter((x) => String(x.state) === String(requestsFilter))).map((r) => {
              const who = r?.from?.username ? "@" + r.from.username : (r?.from?.first_name || "") || `id ${r?.from?.id}`;
              const shortId = String(r.id || "").slice(-6);
              const created = r.created_at ? new Date(r.created_at).toLocaleString("ru-RU") : "";
              const stateLabel = REQUEST_STATE_OPTIONS.find((x) => x.value === r.state)?.label || r.state;

              return (
                <div key={r.id} className="vx-mb10">
                  <div>
                    <b>#{shortId}</b>{" "}
                    <span className="small">{created}</span>
                  </div>
                  <div className="small">
                    {who} • {r.sellCurrency} → {r.buyCurrency} • отдаёт: {r.sellAmount} • получит: {r.buyAmount}
                  </div>
                  <div className="small">Статус: <b>{stateLabel}</b></div>

                  <div className="row vx-mt6 vx-rowWrap vx-gap6">
                    {REQUEST_STATE_OPTIONS.map((s) => (
                      <button key={s.value} className="btn vx-btnSm" onClick={() => setRequestState(r.id, s.value)}>
                        {s.label}
                      </button>
                    ))}
                  </div>

                  <div className="hr" />
                </div>
              );
            })
          )}
        </div>
      ) : null}

      {section === "reviews" ? (
        <div className="vx-mt10 vx-adminSection">
          <div className="row vx-between vx-center">
            <div className="small">Отзывы (модерация)</div>
            <button className="btn vx-btnSm" onClick={reloadReviews} disabled={reviewsBusy}>
              Обновить
            </button>
          </div>

          <div className="row vx-rowWrap vx-gap6 vx-mt6">
            <button className={"btn vx-btnSm " + (reviewsFilter === "pending" ? "vx-btnOn" : "")} onClick={() => setReviewsFilter("pending")}>
              На модерации
            </button>
            <button className={"btn vx-btnSm " + (reviewsFilter === "approved" ? "vx-btnOn" : "")} onClick={() => setReviewsFilter("approved")}>
              Опубликованные
            </button>
            <button className={"btn vx-btnSm " + (reviewsFilter === "rejected" ? "vx-btnOn" : "")} onClick={() => setReviewsFilter("rejected")}>
              Отклонённые
            </button>
            <button className={"btn vx-btnSm " + (reviewsFilter === "all" ? "vx-btnOn" : "")} onClick={() => setReviewsFilter("all")}>
              Все
            </button>
          </div>

          <div className="hr" />

          {adminReviews.length === 0 ? (
            <div className="small">Пока нет отзывов.</div>
          ) : (
            adminReviews
              .filter((r) => (reviewsFilter === "all" ? true : r.state === reviewsFilter))
              .map((r) => {
                const who = r?.username ? "@" + r.username : (r?.first_name || "") || `id ${r?.tg_id}`;
                const created = r.created_at ? new Date(r.created_at).toLocaleString("ru-RU") : "";
                const reqShort = String(r.requestId || "").slice(-6);
                const stateLabel = r.state === "pending" ? "на модерации" : r.state === "approved" ? "опубликован" : "отклонён";
                const draft = replyDrafts[String(r.id)] ?? (r.company_reply?.text || "");

                return (
                  <div key={r.id} className="vx-mb10">
                    <div className="row vx-between vx-center">
                      <div>
                        <b>#{reqShort}</b> <span className="small">{created}</span>
                      </div>
                      <div className="small">{stateLabel}</div>
                    </div>

                    <div className="small">
                      От: <b>{who}</b> • tg_id: {r.tg_id}
                      {r.anonymous ? <span> • (попросил анонимно)</span> : null}
                    </div>

                    <div className="vx-mt6" style={{ whiteSpace: "pre-wrap" }}>{r.text}</div>

                    <div className="row vx-rowWrap vx-gap6 vx-mt6">
                      {r.state !== "approved" ? (
                        <button className="btn vx-btnSm" onClick={() => approveReview(r.id)} disabled={reviewsBusy}>
                          Опубликовать
                        </button>
                      ) : null}
                      {r.state !== "rejected" ? (
                        <button className="btn vx-btnSm" onClick={() => rejectReview(r.id)} disabled={reviewsBusy}>
                          Отклонить
                        </button>
                      ) : null}
                    </div>

                    <div className="vx-mt10">
                      <div className="vx-lbl">Ответ компании</div>
                      <textarea
                        className="input vx-in"
                        rows={2}
                        value={draft}
                        onChange={(e) => setReplyDrafts((p) => ({ ...p, [String(r.id)]: e.target.value }))}
                        placeholder="Напишите ответ (будет виден пользователям)"
                      />
                      <div className="vx-mt6">
                        <button className="btn vx-btnSm" onClick={() => replyReview(r.id, draft)} disabled={reviewsBusy || !String(draft || "").trim()}>
                          Сохранить ответ
                        </button>
                      </div>
                    </div>

                    <div className="hr" />
                  </div>
                );
              })
          )}
        </div>
      ) : null}

      {/* Банкоматы больше не редактируются владельцем — вкладка удалена */}
    </div>
  );
}
