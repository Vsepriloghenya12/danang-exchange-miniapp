export type Currency = "RUB" | "USD" | "USDT" | "VND" | "EUR" | "THB" | "KZT";

export type Rates = {
  USD: { buy_vnd: number; sell_vnd: number };
  RUB: { buy_vnd: number; sell_vnd: number };
  USDT: { buy_vnd: number; sell_vnd: number };
  EUR?: { buy_vnd: number; sell_vnd: number };
  THB?: { buy_vnd: number; sell_vnd: number };
  KZT?: { buy_vnd: number; sell_vnd: number };
};

export type GFormula = {
  buyMul: number;
  sellMul: number;
};

export type BonusesTier = {
  min: number;
  max?: number;
  standard: number;
  silver: number;
  gold: number;
};

export type BonusCurrency = "RUB" | "USD" | "USDT" | "EUR" | "THB" | "KZT";

export type MarkupMethods = { cash: number; transfer: number; atm: number };

// Markups of one exchange direction. Tier ranges use the amount the client gives.
export type PairMarkup = {
  tiers: BonusesTier[];
  methods: MarkupMethods;
};

export type BonusesConfig = {
  enabled: {
    tiers: boolean;
    methods: boolean;
  };
  // Keyed by direction "FROM>TO" (client gives FROM, gets TO).
  pairs: Record<string, PairMarkup>;
  // Legacy mirror of pairs["X>VND"], kept for clients that predate per-direction markups.
  tiers: Record<BonusCurrency, BonusesTier[]>;
  methods: {
    transfer: Record<BonusCurrency, number>;
    atm: Record<BonusCurrency, number>;
  };
};

// Manual cross-pair rates for a day, keyed like the G formulas ("USDT/RUB").
export type CrossRates = Record<string, { buy: number; sell: number }>;

export const BONUS_CURRENCIES: BonusCurrency[] = ["RUB", "USD", "USDT", "EUR", "THB", "KZT"];

const PRICING_CURRENCIES: Currency[] = ["RUB", "USDT", "USD", "EUR", "THB", "KZT", "VND"];

export function directionKey(from: Currency, to: Currency): string {
  return `${from}>${to}`;
}

// Every ordered pair of different currencies.
export const MARKUP_DIRECTION_KEYS: string[] = PRICING_CURRENCIES.flatMap((from) =>
  PRICING_CURRENCIES.filter((to) => to !== from).map((to) => directionKey(from, to))
);

export const DEFAULT_G_FORMULAS: Record<string, GFormula> = {
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
  "KZT/RUB": { buyMul: 1, sellMul: 1 },
  "USD/KZT": { buyMul: 1, sellMul: 1 },
  "USDT/KZT": { buyMul: 1, sellMul: 1 },
  "EUR/KZT": { buyMul: 1, sellMul: 1 },
  "THB/KZT": { buyMul: 1, sellMul: 1 },
};

export function defaultGFormulas(): Record<string, GFormula> {
  return Object.fromEntries(
    Object.entries(DEFAULT_G_FORMULAS).map(([key, value]) => [
      key,
      { buyMul: value.buyMul, sellMul: value.sellMul },
    ])
  );
}

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

  const tiers: Record<BonusCurrency, BonusesTier[]> = {
    RUB: rub,
    USD: usd,
    USDT: usd,
    // EUR/THB have no markup by default — configure in the owner portal if needed.
    EUR: [],
    THB: [],
    KZT: [],
  };
  const methods = {
    transfer: { RUB: 1, USD: 100, USDT: 100, EUR: 0, THB: 0, KZT: 0 },
    atm: { RUB: 1, USD: 100, USDT: 100, EUR: 0, THB: 0, KZT: 0 },
  };

  // Only "currency → VND" directions have markups by default.
  const pairs: Record<string, PairMarkup> = {};
  for (const cur of BONUS_CURRENCIES) {
    pairs[directionKey(cur, "VND")] = {
      tiers: tiers[cur].map((t) => ({ ...t })),
      methods: { cash: 0, transfer: methods.transfer[cur], atm: methods.atm[cur] },
    };
  }

  return { enabled: { tiers: true, methods: true }, pairs, tiers, methods };
}
