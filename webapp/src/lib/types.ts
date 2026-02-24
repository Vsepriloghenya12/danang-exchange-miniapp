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

// Backward-compat: старые версии UI могут запрашивать «рыночные» курсы.
export type MarketRatesResponse =
  | { ok: true; date: string; data: any }
  | { ok: false; error: string };

export type AuthResponse =
  | {
      ok: true;
      user: { id: number; username?: string; first_name?: string; last_name?: string };
      status: UserStatus;
      isOwner: boolean;
    }
  | { ok: false; error: string };

export type StoredUser = {
  tg_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  status: UserStatus;
  created_at: string;
  last_seen_at: string;
};

export type RequestRecord = {
  sellCurrency: string;
  buyCurrency: string;
  sellAmount: number;
  buyAmount: number;
  receiveMethod: ReceiveMethod;
  from: { id: number; username?: string; first_name?: string; last_name?: string };
  status: UserStatus;
  created_at: string;
};

export type AdminRequestsResponse =
  | { ok: true; requests: RequestRecord[] }
  | { ok: false; error: string };

export type AdminUsersResponse =
  | { ok: true; users: StoredUser[] }
  | { ok: false; error: string };
