export type Currency = "RUB" | "USD" | "USDT" | "VND" | "EUR" | "THB";

export type Rates = {
  USD: { buy_vnd: number; sell_vnd: number };
  RUB: { buy_vnd: number; sell_vnd: number };
  USDT: { buy_vnd: number; sell_vnd: number };
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

export type BonusesConfig = {
  enabled: {
    tiers: boolean;
    methods: boolean;
  };
  tiers: {
    RUB: BonusesTier[];
    USD: BonusesTier[];
    USDT: BonusesTier[];
  };
  methods: {
    transfer: { RUB: number; USD: number; USDT: number };
    atm: { RUB: number; USD: number; USDT: number };
  };
};

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

  return {
    enabled: { tiers: true, methods: true },
    tiers: {
      RUB: rub,
      USD: usd,
      USDT: usd,
    },
    methods: {
      transfer: { RUB: 1, USD: 100, USDT: 100 },
      atm: { RUB: 1, USD: 100, USDT: 100 },
    },
  };
}
