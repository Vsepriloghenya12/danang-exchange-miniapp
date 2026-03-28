import type { Currency, GFormulas, MarketRatesResponse } from "../lib/types";

export type RatePair = {
  id: string;
  base: Currency;
  quote: Currency;
  mode: "vnd" | "g";
};

export const EXCHANGE_RATE_PAIRS: RatePair[] = [
  { id: "rub-vnd", base: "RUB", quote: "VND", mode: "vnd" },
  { id: "usdt-vnd", base: "USDT", quote: "VND", mode: "vnd" },
  { id: "usd-vnd", base: "USD", quote: "VND", mode: "vnd" },
  { id: "eur-vnd", base: "EUR", quote: "VND", mode: "vnd" },
  { id: "thb-vnd", base: "THB", quote: "VND", mode: "vnd" },
  { id: "usdt-rub", base: "USDT", quote: "RUB", mode: "g" },
  { id: "usd-rub", base: "USD", quote: "RUB", mode: "g" },
  { id: "eur-rub", base: "EUR", quote: "RUB", mode: "g" },
  { id: "thb-rub", base: "THB", quote: "RUB", mode: "g" },
  { id: "usd-usdt", base: "USD", quote: "USDT", mode: "g" },
  { id: "eur-usd", base: "EUR", quote: "USD", mode: "g" },
  { id: "eur-usdt", base: "EUR", quote: "USDT", mode: "g" },
  { id: "usd-thb", base: "USD", quote: "THB", mode: "g" },
  { id: "usdt-thb", base: "USDT", quote: "THB", mode: "g" },
  { id: "eur-thb", base: "EUR", quote: "THB", mode: "g" },
];

export const DEFAULT_G_FORMULAS: GFormulas = {
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

export const G_FORMULA_KEYS = Object.keys(DEFAULT_G_FORMULAS);

export type GFormulaDraft = Record<string, { buyMul: string; sellMul: string }>;

export function createGFormulaDraft(
  source?: Partial<Record<string, { buyMul?: number | string; sellMul?: number | string }>>
): GFormulaDraft {
  const draft: GFormulaDraft = {};

  for (const key of G_FORMULA_KEYS) {
    const base = DEFAULT_G_FORMULAS[key];
    const next = source?.[key];

    draft[key] = {
      buyMul: String(next?.buyMul ?? base.buyMul),
      sellMul: String(next?.sellMul ?? base.sellMul),
    };
  }

  return draft;
}

export function getGRateDecimals(base: Currency, quote: Currency): number {
  return base === "USD" && quote === "USDT" ? 3 : 1;
}

export function roundRate(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function calcFromGRate(
  market: MarketRatesResponse | null,
  formulas: GFormulas | null,
  base: Currency,
  quote: Currency
): { buy: number | null; sell: number | null } {
  if (!market || !market.ok) return { buy: null, sell: null };

  const key = `${base}/${quote}`;
  const formula = (formulas && formulas[key]) || DEFAULT_G_FORMULAS[key];
  const marketG = Number(market.g?.[key]);

  if (!formula || !Number.isFinite(marketG) || marketG <= 0) {
    return { buy: null, sell: null };
  }

  const decimals = getGRateDecimals(base, quote);
  return {
    buy: roundRate(marketG * formula.buyMul, decimals),
    sell: roundRate(marketG * formula.sellMul, decimals),
  };
}
