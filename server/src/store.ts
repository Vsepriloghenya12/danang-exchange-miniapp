import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export type UserStatus = "standard" | "silver" | "gold";

export type Rates = {
  USD: { buy_vnd: number; sell_vnd: number };
  RUB: { buy_vnd: number; sell_vnd: number };
  USDT: { buy_vnd: number; sell_vnd: number };
};

export type StoredUser = {
  tg_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  status: UserStatus;
  created_at: string;
  last_seen_at: string;
};

export type BonusTier = {
  /** Верхняя граница (строго меньше). null = последняя ступень без верхней границы */
  upTo: number | null;
  standard: number;
  silver: number;
  gold: number;
};

export type BonusConfig = {
  enabled: {
    /** Надбавка по статусу/сумме */
    status: boolean;
    /** Надбавка за способ получения (перевод/банкомат) */
    method: boolean;
  };

  /** Если хоть что-то выбрано «Наличные» (payMethod или receiveMethod) — отменяем надбавку способа */
  cashCancelsMethodBonus: boolean;

  /** Ступени надбавки по статусу/сумме */
  statusTiers: {
    RUB: { tiers: BonusTier[] };
    USD: { tiers: BonusTier[] };
    USDT: { tiers: BonusTier[] };
  };

  /** Надбавка за способ получения (только когда покупаем VND) */
  methodBonuses: {
    RUB: { transfer: number; atm: number };
    USD: { transfer: number; atm: number };
    USDT: { transfer: number; atm: number };
  };
};

export function defaultBonusConfig(): BonusConfig {
  return {
    enabled: { status: true, method: true },
    cashCancelsMethodBonus: true,
    statusTiers: {
      RUB: {
        tiers: [
          { upTo: 50_000, standard: 0, silver: 1, gold: 2 },
          { upTo: 100_000, standard: 1, silver: 2, gold: 3 },
          { upTo: 200_000, standard: 2, silver: 3, gold: 4 },
          { upTo: null, standard: 3, silver: 4, gold: 5 }
        ]
      },
      USD: {
        tiers: [
          { upTo: 1000, standard: 0, silver: 100, gold: 150 },
          { upTo: 3000, standard: 100, silver: 150, gold: 200 },
          { upTo: null, standard: 150, silver: 200, gold: 250 }
        ]
      },
      // по умолчанию USDT = USD
      USDT: {
        tiers: [
          { upTo: 1000, standard: 0, silver: 100, gold: 150 },
          { upTo: 3000, standard: 100, silver: 150, gold: 200 },
          { upTo: null, standard: 150, silver: 200, gold: 250 }
        ]
      }
    },
    methodBonuses: {
      RUB: { transfer: 1, atm: 1 },
      USD: { transfer: 100, atm: 100 },
      USDT: { transfer: 100, atm: 100 }
    }
  };
}

function toNum(x: any, fallback: number) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function toUpTo(x: any, fallback: number | null) {
  if (x === null) return null;
  if (x === undefined) return fallback;
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeBonusConfig(raw: any): BonusConfig {
  const d = defaultBonusConfig();
  const r = raw && typeof raw === "object" ? raw : {};

  const enabled = {
    status: typeof r.enabled?.status === "boolean" ? r.enabled.status : d.enabled.status,
    method: typeof r.enabled?.method === "boolean" ? r.enabled.method : d.enabled.method
  };

  const cashCancelsMethodBonus =
    typeof r.cashCancelsMethodBonus === "boolean" ? r.cashCancelsMethodBonus : d.cashCancelsMethodBonus;

  const normTiers = (cur: "RUB" | "USD" | "USDT") => {
    const def = d.statusTiers[cur].tiers;
    const arr = Array.isArray(r.statusTiers?.[cur]?.tiers) ? r.statusTiers[cur].tiers : [];
    return {
      tiers: def.map((t, i) => {
        const src = arr[i] || {};
        return {
          upTo: toUpTo(src.upTo, t.upTo),
          standard: toNum(src.standard, t.standard),
          silver: toNum(src.silver, t.silver),
          gold: toNum(src.gold, t.gold)
        };
      })
    };
  };

  const normMethod = (cur: "RUB" | "USD" | "USDT") => {
    const def = d.methodBonuses[cur];
    const src = r.methodBonuses?.[cur] || {};
    return {
      transfer: toNum(src.transfer, def.transfer),
      atm: toNum(src.atm, def.atm)
    };
  };

  return {
    enabled,
    cashCancelsMethodBonus,
    statusTiers: {
      RUB: normTiers("RUB"),
      USD: normTiers("USD"),
      USDT: normTiers("USDT")
    },
    methodBonuses: {
      RUB: normMethod("RUB"),
      USD: normMethod("USD"),
      USDT: normMethod("USDT")
    }
  };
}

export type Store = {
  config: {
    groupChatId?: number;
    bonuses?: BonusConfig;
  };
  users: Record<string, StoredUser>;
  ratesByDate: Record<
    string,
    {
      updated_at: string;
      updated_by: number;
      rates: Rates;
    }
  >;
  requests: any[];
  reviews: any[];
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// dist => /app/server/dist, значит ../data => /app/server/data
const STORE_PATH =
  process.env.STORE_PATH || path.resolve(__dirname, "../data/store.json");

function defaultStore(): Store {
  return {
    config: {
      bonuses: defaultBonusConfig()
    },
    users: {},
    ratesByDate: {},
    requests: [],
    reviews: []
  };
}

/**
 * Строгий парсер статуса:
 * - возвращает UserStatus, если распознали
 * - возвращает null, если не распознали (мусор/пусто)
 */
export function parseStatusInput(s: any): UserStatus | null {
  const v = String(s ?? "").toLowerCase().trim();
  if (!v || v === "none") return null;

  // STANDARD (+ совместимость со старым bronze)
  if (["standard", "standart", "стандарт", "bronze"].includes(v)) return "standard";

  // SILVER
  if (["silver", "серебро", "сильвер", "силвер"].includes(v)) return "silver";

  // GOLD
  if (["gold", "золото", "голд"].includes(v)) return "gold";

  return null;
}

/**
 * Нормализация для хранения/миграций:
 * - мусор/пусто => standard
 */
export function normalizeStatus(s: any): UserStatus {
  const v = String(s ?? "").toLowerCase().trim();

  // миграция старых статусов / пустых значений
  if (v === "" || v === "none") return "standard";

  return parseStatusInput(v) ?? "standard";
}

function ensureDir() {
  const dir = path.dirname(STORE_PATH);
  fs.mkdirSync(dir, { recursive: true });
}

export function readStore(): Store {
  ensureDir();
  if (!fs.existsSync(STORE_PATH)) {
    const s = defaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(s, null, 2), "utf-8");
    return s;
  }

  let raw = "";
  try {
    raw = fs.readFileSync(STORE_PATH, "utf-8");
  } catch {
    const s = defaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(s, null, 2), "utf-8");
    return s;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw || "{}");
  } catch {
    const s = defaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(s, null, 2), "utf-8");
    return s;
  }

  const store: Store = {
    ...defaultStore(),
    ...parsed,
    config: { ...(parsed?.config || {}) },
    users: { ...(parsed?.users || {}) },
    ratesByDate: { ...(parsed?.ratesByDate || {}) },
    requests: Array.isArray(parsed?.requests) ? parsed.requests : [],
    reviews: Array.isArray(parsed?.reviews) ? parsed.reviews : []
  };

  // миграция статусов
  for (const k of Object.keys(store.users || {})) {
    store.users[k].status = normalizeStatus(store.users[k].status);
  }
  for (const r of store.requests || []) {
    r.status = normalizeStatus(r.status);
  }

  // миграция бонусов
  store.config = store.config || {};
  store.config.bonuses = normalizeBonusConfig(store.config.bonuses);

  return store;
}

export function writeStore(store: Store) {
  ensureDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
}

export function upsertUserFromTelegram(u: {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}): StoredUser {
  const store = readStore();
  const key = String(u.id);
  const now = new Date().toISOString();

  const existing = store.users[key];
  if (!existing) {
    store.users[key] = {
      tg_id: u.id,
      username: u.username,
      first_name: u.first_name,
      last_name: u.last_name,
      status: "standard",
      created_at: now,
      last_seen_at: now
    };
  } else {
    existing.username = u.username ?? existing.username;
    existing.first_name = u.first_name ?? existing.first_name;
    existing.last_name = u.last_name ?? existing.last_name;
    existing.status = normalizeStatus(existing.status);
    existing.last_seen_at = now;
  }

  writeStore(store);
  return store.users[key];
}
