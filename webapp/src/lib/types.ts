export type Currency = "RUB" | "USD" | "USDT" | "EUR" | "THB" | "VND";
export type ReceiveMethod = "cash" | "transfer" | "atm";
export type UserStatus = "standard" | "silver" | "gold";

export type Rates = {
  USD: { buy_vnd: number; sell_vnd: number };
  RUB: { buy_vnd: number; sell_vnd: number };
  USDT: { buy_vnd: number; sell_vnd: number };
  // новые валюты — могут быть не заданы
  EUR?: { buy_vnd: number; sell_vnd: number };
  THB?: { buy_vnd: number; sell_vnd: number };
};

export type TodayRatesResponse = {
  ok: boolean;
  date: string;
  data: null | {
    updated_at: string;
    updated_by: number;
    rates: Rates;
  };
};

export type AuthResponse =
  | {
      ok: true;
      user: { id: number; username?: string; first_name?: string; last_name?: string };
      status: UserStatus;
      isOwner: boolean;
    }
  | { ok: false; error: string };

export type MarketRatesResponse =
  | {
      ok: true;
      updated_at: string;
      source: string;
      stale: boolean;
      g: Record<string, number>;
    }
  | {
      ok: false;
      error: string;
      stale: boolean;
      updated_at?: string;
      source?: string;
      g?: Record<string, number>;
    };
