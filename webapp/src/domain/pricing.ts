import type {
  BonusCurrency,
  BonusesConfig,
  BonusesTier,
  CrossRates,
  Currency,
  GFormulas,
  MarkupMethods,
  MarketRatesResponse,
  PairMarkup,
  ReceiveMethod,
  UserStatus,
} from "../lib/types";
import { getGRateDecimals, roundRate } from "./exchange";

// Shared pricing rules for the client calculator and the owner's rate tables.
//
// Every exchange direction "client gives FROM → gets TO" is priced by one quote of a
// canonical pair base/quote (VND is always the quote; cross pairs follow the G formula keys):
//   side "buy"  — the client gives the base currency:  out = amount × rate
//   side "sell" — the client gives the quote currency: out = amount ÷ rate
// Modifiers are signed quote-currency amounts: positive raises the displayed rate,
// negative lowers it, for both buy and sell quotes.

export type PayMethod = "cash" | "transfer";
export type RateSide = "buy" | "sell";
export type RateEntry = { buy_vnd: number; sell_vnd: number };
export type VndRates = Partial<Record<Exclude<Currency, "VND">, RateEntry>>;

export type PricingContext = {
  rates: VndRates | null;
  cross?: CrossRates | null;
  market: MarketRatesResponse | null;
  formulas: GFormulas;
};

export type PairShape = { base: Currency; quote: Currency; side: RateSide };
export type Quote = PairShape & { rate: number; manual: boolean };
export type Markup = { tier: number; method: number };

export const PRICING_CURRENCIES: Currency[] = ["RUB", "USDT", "USD", "EUR", "THB", "KZT", "VND"];
export const BONUS_CURRENCIES: BonusCurrency[] = ["RUB", "USD", "USDT", "EUR", "THB", "KZT"];
export const RECEIVE_METHODS: ReceiveMethod[] = ["cash", "transfer", "atm"];

export function directionKey(from: Currency, to: Currency): string {
  return `${from}>${to}`;
}

export const MARKUP_DIRECTIONS: Array<{ key: string; from: Currency; to: Currency }> = PRICING_CURRENCIES.flatMap((from) =>
  PRICING_CURRENCIES.filter((to) => to !== from).map((to) => ({ key: directionKey(from, to), from, to }))
);

export function parseDirectionKey(key: string): { from: Currency; to: Currency } | null {
  const hit = MARKUP_DIRECTIONS.find((d) => d.key === key);
  return hit ? { from: hit.from, to: hit.to } : null;
}

// ======= Способы оплаты (что клиент ОТДАЁТ) =======
// RUB / USDT -> только перевод
// USD / EUR / THB -> только наличные
// VND -> наличные или перевод. Через банкомат клиент ничего не передаёт.
export function allowedPayMethods(sellCurrency: Currency, buyCurrency: Currency): PayMethod[] {
  if (sellCurrency === "KZT") return ["transfer"];
  if (sellCurrency === "VND" && buyCurrency === "VND") return ["cash", "transfer"];
  if (sellCurrency === "USDT") return ["transfer"];
  if (sellCurrency === "RUB") return ["transfer"];
  if (sellCurrency === "USD" || sellCurrency === "EUR" || sellCurrency === "THB") return ["cash"];
  return ["cash", "transfer"]; // VND
}

// ======= Способы получения (что клиент ПОЛУЧАЕТ) =======
// Доставка (наличные) доступна на любую сумму. Для сумм ниже CASH_DELIVERY_MIN_AMOUNTS
// способ получения не убирается — вместо этого показывается предупреждение
// о платной доставке (от 70,000 VND).
export function allowedReceiveMethods(buyCurrency: Currency): ReceiveMethod[] {
  if (buyCurrency === "KZT") return ["transfer"];
  if (buyCurrency === "VND") return ["cash", "transfer", "atm"];
  if (buyCurrency === "USDT") return ["transfer"];
  if (buyCurrency === "RUB") return ["cash", "transfer"];
  return ["cash"]; // USD/EUR/THB
}

export function receiveMethodLabel(m: ReceiveMethod, isEn = false): string {
  if (m === "cash") return isEn ? "Cash" : "Наличные";
  if (m === "transfer") return isEn ? "Transfer" : "Перевод";
  return isEn ? "ATM" : "Банкомат";
}

export function currencySymbol(c: Currency): string {
  switch (c) {
    case "RUB": return "₽";
    case "USDT": return "₮";
    case "USD": return "$";
    case "EUR": return "€";
    case "THB": return "฿";
    case "KZT": return "₸";
    case "VND": return "₫";
    default: return c;
  }
}

export function fmtUnitRate(value: number, isEn = false): string {
  if (!Number.isFinite(value)) return "—";
  const decimals = Math.abs(value) < 10 ? 4 : Math.abs(value) < 1000 ? 1 : 0;
  const text = new Intl.NumberFormat(isEn ? "en-US" : "ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value);
  return isEn ? text.replace(/,/g, " ") : text;
}

// ---------- Quotes ----------

export function isGModePair(formulas: GFormulas, a: Currency, b: Currency): boolean {
  if (a === "VND" || b === "VND") return false;
  return !!formulas[`${a}/${b}`] || !!formulas[`${b}/${a}`];
}

export function vndRate(rates: VndRates | null | undefined, c: Currency): RateEntry | null {
  if (!rates) return null;
  if (c === "VND") return { buy_vnd: 1, sell_vnd: 1 };
  const r = rates[c];
  if (!r) return null;
  const buy = Number(r.buy_vnd);
  const sell = Number(r.sell_vnd);
  if (!Number.isFinite(buy) || !Number.isFinite(sell) || buy <= 0 || sell <= 0) return null;
  return { buy_vnd: buy, sell_vnd: sell };
}

export function manualCrossRate(cross: CrossRates | null | undefined, key: string): { buy: number; sell: number } | null {
  const m = cross?.[key];
  const buy = Number(m?.buy);
  const sell = Number(m?.sell);
  if (!Number.isFinite(buy) || !Number.isFinite(sell) || buy <= 0 || sell <= 0) return null;
  return { buy, sell };
}

// BUY = G × buyMul, SELL = G × sellMul, unless the owner set a manual rate for today.
export function crossPairRates(
  ctx: Pick<PricingContext, "cross" | "market" | "formulas">,
  base: Currency,
  quote: Currency
): { buy: number; sell: number; manual: boolean } | null {
  const key = `${base}/${quote}`;
  const manual = manualCrossRate(ctx.cross, key);
  if (manual) return { ...manual, manual: true };

  const f = ctx.formulas[key];
  const market = ctx.market;
  if (!f || !market || !market.ok) return null;
  const G = Number(market.g?.[key]);
  if (!Number.isFinite(G) || G <= 0) return null;

  const decimals = getGRateDecimals(base, quote);
  return { buy: roundRate(G * f.buyMul, decimals), sell: roundRate(G * f.sellMul, decimals), manual: false };
}

export function pairShape(from: Currency, to: Currency, formulas: GFormulas): PairShape | null {
  if (from === to) return null;
  if (to === "VND") return { base: from, quote: "VND", side: "buy" };
  if (from === "VND") return { base: to, quote: "VND", side: "sell" };
  if (formulas[`${from}/${to}`]) return { base: from, quote: to, side: "buy" };
  if (formulas[`${to}/${from}`]) return { base: to, quote: from, side: "sell" };
  return null;
}

export function resolveQuote(from: Currency, to: Currency, ctx: PricingContext): Quote | null {
  const shape = pairShape(from, to, ctx.formulas);
  if (!shape) return null;

  if (shape.quote === "VND") {
    const r = vndRate(ctx.rates, shape.base);
    if (!r) return null;
    return { ...shape, rate: shape.side === "buy" ? r.buy_vnd : r.sell_vnd, manual: false };
  }

  const p = crossPairRates(ctx, shape.base, shape.quote);
  if (!p) return null;
  return { ...shape, rate: shape.side === "buy" ? p.buy : p.sell, manual: p.manual };
}

export function effectiveRate(q: Pick<Quote, "side" | "rate">, m: Markup): number {
  const total = m.tier + m.method;
  const rate = q.rate + total;
  return Number.isFinite(rate) && rate > 0 ? rate : Number.NaN;
}

// Client gives `amount` of FROM — how much TO they receive.
export function convertForward(side: RateSide, rate: number, amount: number): number {
  if (!(rate > 0)) return Number.NaN;
  return side === "buy" ? amount * rate : amount / rate;
}

// Client wants `amount` of TO — how much FROM they need to give.
export function convertBackward(side: RateSide, rate: number, amount: number): number {
  if (!(rate > 0)) return Number.NaN;
  return side === "buy" ? amount / rate : amount * rate;
}

// ---------- Markups ----------

export function emptyMarkupMethods(): MarkupMethods {
  return { cash: 0, transfer: 0, atm: 0 };
}

export function emptyPairMarkup(): PairMarkup {
  return { tiers: [], methods: emptyMarkupMethods() };
}

// Mirror of server defaultBonuses() — used until the configured markups arrive.
export function defaultBonuses(): BonusesConfig {
  const rub: BonusesTier[] = [
    { min: 0, max: 50_000, standard: 0, silver: 1, gold: 2 },
    { min: 50_000, max: 100_000, standard: 1, silver: 2, gold: 3 },
    { min: 100_000, max: 200_000, standard: 2, silver: 3, gold: 4 },
    { min: 200_000, standard: 3, silver: 4, gold: 5 },
  ];
  const usd: BonusesTier[] = [
    { min: 0, max: 1000, standard: 0, silver: 100, gold: 150 },
    { min: 1000, max: 3000, standard: 100, silver: 150, gold: 200 },
    { min: 3000, standard: 150, silver: 200, gold: 250 },
  ];
  const tiers: Record<BonusCurrency, BonusesTier[]> = { RUB: rub, USD: usd, USDT: usd, EUR: [], THB: [], KZT: [] };
  const transfer: Record<BonusCurrency, number> = { RUB: 1, USD: 100, USDT: 100, EUR: 0, THB: 0, KZT: 0 };
  const atm: Record<BonusCurrency, number> = { RUB: 1, USD: 100, USDT: 100, EUR: 0, THB: 0, KZT: 0 };

  const pairs: Record<string, PairMarkup> = {};
  for (const cur of BONUS_CURRENCIES) {
    pairs[directionKey(cur, "VND")] = {
      tiers: tiers[cur].map((t) => ({ ...t })),
      methods: { cash: 0, transfer: transfer[cur], atm: atm[cur] },
    };
  }

  return { enabled: { tiers: true, methods: true }, pairs, tiers, methods: { transfer, atm } };
}

export const DEFAULT_BONUSES: BonusesConfig = defaultBonuses();

export function pairMarkup(bonuses: BonusesConfig, from: Currency, to: Currency): PairMarkup {
  const key = directionKey(from, to);
  if (bonuses.pairs && typeof bonuses.pairs === "object") return bonuses.pairs[key] ?? emptyPairMarkup();

  // Legacy config (before per-direction markups): only "currency → VND" had markups.
  if (to !== "VND" || from === "VND") return emptyPairMarkup();
  const cur = from as BonusCurrency;
  return {
    tiers: Array.isArray(bonuses.tiers?.[cur]) ? bonuses.tiers[cur] : [],
    methods: {
      cash: 0,
      transfer: Number(bonuses.methods?.transfer?.[cur]) || 0,
      atm: Number(bonuses.methods?.atm?.[cur]) || 0,
    },
  };
}

// Tier applies when min ≤ amount < max (max of the last tier may be empty).
export function findTier(tiers: BonusesTier[], amount: number): BonusesTier | null {
  for (const t of tiers) {
    const min = Number(t?.min);
    const max = t?.max == null || (t.max as unknown) === "" ? undefined : Number(t.max);
    if (!Number.isFinite(min) || amount < min) continue;
    if (max !== undefined && Number.isFinite(max) && amount >= max) continue;
    return t;
  }
  return null;
}

// Status markup of one tier for a direction (0 when the tier is missing).
export function tierValue(t: BonusesTier | null, status: UserStatus, from: Currency, to: Currency): number {
  const v = Number(t?.[status]);
  return Number.isFinite(v) ? v : 0;
}

export function markupFor(
  from: Currency,
  to: Currency,
  amountFrom: number,
  status: UserStatus,
  receiveMethod: ReceiveMethod | null,
  bonuses: BonusesConfig | null | undefined
): Markup {
  const cfg = bonuses ?? DEFAULT_BONUSES;
  const pm = pairMarkup(cfg, from, to);

  let tier = 0;
  if (cfg.enabled?.tiers !== false && amountFrom > 0) {
    tier = tierValue(findTier(pm.tiers, amountFrom), status, from, to);
  }

  let method = 0;
  if (cfg.enabled?.methods !== false && receiveMethod) {
    const v = Number(pm.methods?.[receiveMethod]);
    method = Number.isFinite(v) ? v : 0;
  }

  return { tier, method };
}

export function hasAnyMarkup(pm: PairMarkup | undefined): boolean {
  if (!pm) return false;
  const methods = RECEIVE_METHODS.some((m) => Number(pm.methods?.[m]) !== 0);
  const tiers = (pm.tiers || []).some((t) => Number(t.standard) !== 0 || Number(t.silver) !== 0 || Number(t.gold) !== 0);
  return methods || tiers;
}
