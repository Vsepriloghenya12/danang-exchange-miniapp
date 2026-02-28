import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export type UserStatus = "standard" | "silver" | "gold";

export type RequestState = "new" | "in_progress" | "done" | "canceled";

export type AtmItem = {
  id: string;
  title: string;
  address?: string;
  note?: string;
  mapUrl: string;
};

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
    bonuses?: BonusesConfig;
    adminTgIds?: number[];
    adminUsername?: string;
    adminDeepLink?: string;
    publishTemplate?: string;
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
  reviews: StoredReview[];
  atms: AtmItem[];
  contacts: Contact[];
};

export type Contact = {
  id: string;
  tg_id?: number;
  username?: string;
  fullName?: string;
  banks?: string[];
  status?: UserStatus;
  created_at: string;
  updated_at: string;
};

export type ReviewState = "pending" | "approved" | "rejected";

export type StoredReview = {
  id: string;
  requestId: string;
  tg_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  text: string;
  anonymous: boolean;
  state: ReviewState;
  created_at: string;
  approved_at?: string;
  approved_by?: number;
  rejected_at?: string;
  rejected_by?: number;
  company_reply?: {
    text: string;
    created_at: string;
    by?: number;
  };
};

export type BonusesTier = {
  min: number;
  max?: number; // если не задано — бесконечность
  standard: number;
  silver: number;
  gold: number;
};

export type BonusesConfig = {
  enabled: {
    tiers: boolean;
    methods: boolean;
  };
  // надбавки по статусам/суммам (в той же единице, что и курс: VND за 1 единицу валюты)
  tiers: {
    RUB: BonusesTier[];
    USD: BonusesTier[];
    USDT: BonusesTier[];
  };
  // надбавки за способ получения (для получения VND)
  methods: {
    transfer: { RUB: number; USD: number; USDT: number };
    atm: { RUB: number; USD: number; USDT: number };
  };
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
    config: { bonuses: defaultBonuses(), adminTgIds: [], adminUsername: "", adminDeepLink: "", publishTemplate: "" },
    users: {},
    ratesByDate: {},
    requests: [],
    reviews: [],
    atms: [],
    contacts: []
  };
}

export function defaultBonuses(): BonusesConfig {
  // значения повторяют текущую логику калькулятора (по умолчанию)
  const rub: BonusesTier[] = [
    { min: 0, max: 50_000, standard: 0, silver: 1, gold: 2 },
    { min: 50_000, max: 100_000, standard: 1, silver: 2, gold: 3 },
    { min: 100_000, max: 200_000, standard: 2, silver: 3, gold: 4 },
    { min: 200_000, standard: 3, silver: 4, gold: 5 }
  ];

  const usd: BonusesTier[] = [
    { min: 0, max: 1000, standard: 0, silver: 100, gold: 150 },
    { min: 1000, max: 3000, standard: 100, silver: 150, gold: 200 },
    { min: 3000, standard: 150, silver: 200, gold: 250 }
  ];

  return {
    enabled: { tiers: true, methods: true },
    tiers: {
      RUB: rub,
      USD: usd,
      USDT: usd
    },
    methods: {
      transfer: { RUB: 1, USD: 100, USDT: 100 },
      atm: { RUB: 1, USD: 100, USDT: 100 }
    }
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
    reviews: Array.isArray(parsed?.reviews) ? (parsed.reviews as any) : [],
    atms: Array.isArray(parsed?.atms) ? parsed.atms : [],
    contacts: Array.isArray(parsed?.contacts) ? parsed.contacts : []
  };

  let dirty = false;

  // бонусы: если нет — ставим дефолт
  if (!store.config.bonuses) {
    store.config.bonuses = defaultBonuses();
    dirty = true;
  }

  if (!Array.isArray((store.config as any).adminTgIds)) {
    (store.config as any).adminTgIds = [];
    dirty = true;
  }
  if (typeof (store.config as any).publishTemplate !== "string") {
    (store.config as any).publishTemplate = "";
    dirty = true;
  }

  if (typeof (store.config as any).adminUsername !== "string") {
    (store.config as any).adminUsername = "";
    dirty = true;
  }
  if (typeof (store.config as any).adminDeepLink !== "string") {
    (store.config as any).adminDeepLink = "";
    dirty = true;
  }

  if (!Array.isArray(store.contacts)) {
    store.contacts = [];
    dirty = true;
  }

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

  // миграция отзывов (старый формат со звёздами)
  if (Array.isArray((store as any).reviews)) {
    const migrated: StoredReview[] = [];
    for (const x of (store as any).reviews) {
      if (!x || typeof x !== "object") continue;
      const id = String((x as any).id || "").trim() || `rev_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const requestId = String((x as any).requestId || (x as any).request_id || "").trim();
      // если старый формат не содержал requestId — такой отзыв не сможем связать со сделкой; пропустим
      if (!requestId) continue;

      const stateRaw = String((x as any).state || (x as any).status || "approved").toLowerCase().trim();
      const state: any = ["pending", "approved", "rejected"].includes(stateRaw) ? stateRaw : "approved";

      migrated.push({
        id,
        requestId,
        tg_id: Number((x as any).tg_id ?? (x as any).tgId ?? 0) || 0,
        username: (x as any).username,
        first_name: (x as any).first_name,
        last_name: (x as any).last_name,
        text: String((x as any).text || "").trim(),
        anonymous: Boolean((x as any).anonymous),
        state,
        created_at: String((x as any).created_at || new Date().toISOString()),
        ...(state === "approved" ? { approved_at: String((x as any).approved_at || (x as any).created_at || new Date().toISOString()) } : {}),
        ...(state === "rejected" ? { rejected_at: String((x as any).rejected_at || new Date().toISOString()) } : {}),
        ...(typeof (x as any).company_reply === "object" && (x as any).company_reply?.text
          ? { company_reply: { text: String((x as any).company_reply.text), created_at: String((x as any).company_reply.created_at || new Date().toISOString()) } }
          : {})
      });
    }

    // если при миграции что-то поменялось (или были старые отзывы без requestId) — перезапишем
    if (JSON.stringify((store as any).reviews) !== JSON.stringify(migrated)) {
      (store as any).reviews = migrated;
      dirty = true;
    }
  }

  if (dirty) writeStore(store);

  return store;
}

export function writeStore(store: Store) {
  ensureDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
}

export function normUsername(u?: string) {
  const v = String(u || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
  return v || undefined;
}

export function findContact(store: Store, q: { tg_id?: number; username?: string }): Contact | undefined {
  const tid = q.tg_id;
  const uname = normUsername(q.username);
  return (store.contacts || []).find((c) => {
    if (!c) return false;
    if (tid && Number(c.tg_id) === tid) return true;
    const cu = normUsername(c.username);
    return !!uname && !!cu && cu === uname;
  });
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

  const contact = findContact(store, { tg_id: u.id, username: u.username });

  const existing = store.users[key];
  if (!existing) {
    store.users[key] = {
      tg_id: u.id,
      username: u.username,
      first_name: u.first_name,
      last_name: u.last_name,
      status: normalizeStatus(contact?.status ?? "standard"),
      created_at: now,
      last_seen_at: now
    };
  } else {
    existing.username = u.username ?? existing.username;
    existing.first_name = u.first_name ?? existing.first_name;
    existing.last_name = u.last_name ?? existing.last_name;
    // keep status in sync with the contact (if owner pre-set it)
    existing.status = normalizeStatus(contact?.status ?? existing.status);
    existing.last_seen_at = now;
  }

  writeStore(store);
  return store.users[key];
}
