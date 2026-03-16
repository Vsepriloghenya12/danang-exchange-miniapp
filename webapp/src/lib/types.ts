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
      isAdmin?: boolean;
      // true if the user is in the owner's blacklist (username-based)
      blocked?: boolean;
      adminChat?: { tgId: number | null; username?: string; deepLink?: string };
    }
  | { ok: false; error: string };

// --------------------
// Contacts / staff
// --------------------
export type Contact = {
  id: string;
  tg_id?: number;
  username?: string;
  fullName?: string;
  banks?: string[]; // filenames from /banks
  status?: UserStatus; // optional desired status
  created_at: string;
  updated_at: string;
};

export type BankIconsResponse = {
  ok: boolean;
  icons: string[];
  error?: string;
};

// --------------------
// Weather
// --------------------
export type WeatherResponse =
  | {
      ok: true;
      data: {
        city: string;
        tempC: number;
        feelsC: number;
        desc: string;
        humidity: number;
        windMs: number;
        emoji: string;
        icon?: string;
        updatedAt: string;
      };
      cached?: boolean;
    }
  | { ok: false; error: string };

export type StaffRequestsResponse = {
  ok: boolean;
  requests: any[];
  contacts?: Record<string, Contact>; // keyed by tg_id
  users?: Record<string, { tg_id: number; username?: string; first_name?: string; last_name?: string; status?: UserStatus }>;
  error?: string;
};

export type MyRequestsResponse = {
  ok: boolean;
  requests?: any[];
  error?: string;
};

export type AdminContactsResponse = {
  ok: boolean;
  contacts: Contact[];
  error?: string;
};

export type AdminAdminsResponse = {
  ok: boolean;
  adminTgIds: number[];
  error?: string;
};

export type AdminBlacklistResponse = {
  ok: boolean;
  usernames: string[];
  error?: string;
};

export type PublishTemplateResponse = {
  ok: boolean;
  template: string;
  error?: string;
};

export type PublishResponse = {
  ok: boolean;
  message_id?: number;
  mode?: string;
  warn?: string;
  error?: string;
  debug?: any;
};


export type ReportsResponse = {
  ok: boolean;
  from: string;
  to: string;
  onlyDone: boolean;
  tgId?: number;
  metrics: Record<string, any>;
  requests: any[];
  error?: string;
};

export type AdminRatesRangeResponse = {
  ok: boolean;
  from: string;
  to: string;
  items: Array<{ date: string; updated_at?: string; updated_by?: number; rates?: any }>;
  error?: string;
};

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

export type GFormulas = Record<string, { buyMul: number; sellMul: number }>;

export type GFormulasResponse =
  | { ok: true; formulas: GFormulas }
  | { ok: false; error: string; formulas?: GFormulas };


export type FaqItem = {
  id: string;
  q: string;
  a: string;
  created_at: string;
  updated_at: string;
};

export type FaqResponse =
  | { ok: true; items: FaqItem[] }
  | { ok: false; error: string; items?: FaqItem[] };

export type AtmItem = {
  id: string;
  title: string;
  address?: string;
  note?: string;
  mapUrl: string;
};

export type AtmsResponse = {
  ok: boolean;
  atms: AtmItem[];
  error?: string;
};

// --------------------
// Bonuses (надбавки)
// --------------------
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

export type BonusesResponse = {
  ok: boolean;
  bonuses: BonusesConfig;
  error?: string;
};


// --------------------
// Afisha (events)
// --------------------
export type AfishaCategory = "sport" | "party" | "culture" | "food" | "music" | "games" | "market" | "learning" | "misc";
export type AfishaFilterCategory = "all" | AfishaCategory;

export type AfishaEvent = {
  id: string;
  // NEW: an event may belong to up to 3 categories
  categories?: AfishaCategory[];
  // legacy (single category)
  category?: AfishaCategory;
  date: string; // YYYY-MM-DD
  title: string;
  comment?: string;
  detailsUrl: string;
  locationUrl: string;
  // optional background image URL served from server/public (e.g. /afisha/<id>.jpg)
  imageUrl?: string;
  shareUrl?: string;
  created_at: string;
  updated_at: string;
  clicks?: { details: number; location: number };
};

export type AfishaResponse = {
  ok: boolean;
  today?: string;
  events: AfishaEvent[];
  error?: string;
};

export type AdminAfishaResponse = {
  ok: boolean;
  today?: string;
  events: AfishaEvent[];
  error?: string;
};
