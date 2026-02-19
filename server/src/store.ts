import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export type UserStatus = "standard" | "silver" | "gold";

export type RequestState = "new" | "in_progress" | "done" | "canceled";

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

export type Store = {
  config: {
    groupChatId?: number;
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
  requests: StoredRequest[];
  reviews: any[];
};

export type StoredRequest = {
  id: string;
  state: RequestState;
  state_updated_at?: string;
  state_updated_by?: number;
  sellCurrency: string;
  buyCurrency: string;
  sellAmount: number;
  buyAmount: number;
  payMethod?: string;
  receiveMethod: string;
  from: { id: number; username?: string; first_name?: string; last_name?: string };
  // статус клиента (standard/silver/gold) на момент заявки
  status: UserStatus;
  created_at: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// dist => /app/server/dist, значит ../data => /app/server/data
const STORE_PATH =
  process.env.STORE_PATH || path.resolve(__dirname, "../data/store.json");

function defaultStore(): Store {
  return {
    config: {},
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
    requests: Array.isArray(parsed?.requests) ? (parsed.requests as any) : [],
    reviews: Array.isArray(parsed?.reviews) ? parsed.reviews : []
  };

  let dirty = false;

  // миграция статусов
  for (const k of Object.keys(store.users || {})) {
    store.users[k].status = normalizeStatus(store.users[k].status);
  }

  for (const r of store.requests || []) {
    // старые заявки могли не иметь этих полей
    if (!r.id) {
      r.id = `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      dirty = true;
    }
    if (!r.state) {
      r.state = "new";
      dirty = true;
    }
    // status (статус клиента) нормализуем
    r.status = normalizeStatus((r as any).status);
  }

  if (dirty) writeStore(store);

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
