import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { HAS_DATABASE, ensureSchema, getPool } from "./db.js";


export type UserStatus = "standard" | "silver" | "gold";

export type RequestState = "new" | "in_progress" | "done" | "canceled";

export type AtmItem = {
  id: string;
  title: string;
  address?: string;
  note?: string;
  mapUrl: string;
};

export type AfishaCategory = 
  | "sport"
  | "party"
  | "culture"
  | "city"
  | "food"
  | "music";

export type AfishaEvent = {
  id: string;
  category: AfishaCategory;
  date: string; // YYYY-MM-DD
  title: string;
  // optional short note/comment shown under the title in the client
  comment?: string;
  detailsUrl: string;
  locationUrl: string;
  imageUrl?: string;
  created_at: string;
  updated_at: string;
  clicks: { details: number; location: number };
};


export type FaqItem = {
  id: string;
  q: string;
  a: string;
  created_at: string;
  updated_at: string;
};


export type Rates = {
  USD: { buy_vnd: number; sell_vnd: number };
  RUB: { buy_vnd: number; sell_vnd: number };
  USDT: { buy_vnd: number; sell_vnd: number };
};

// Multipliers for cross-pairs computed from the market snapshot "G".
// For a pair BASE/QUOTE: BUY = G * buyMul, SELL = G * sellMul.
export type GFormula = {
  buyMul: number;
  sellMul: number;
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
    // Separate group for incoming client requests (can differ from rates publishing group)
    requestsGroupChatId?: number;
    bonuses?: BonusesConfig;
    adminTgIds?: number[];
    // Blacklist by Telegram username (without @, lowercase)
    blacklistUsernames?: string[];
    adminUsername?: string;
    adminDeepLink?: string;
    publishTemplate?: string;

    // Cross-pair formulas (multipliers) used by client Rates/Calculator.
    gFormulas?: Record<string, GFormula>;
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
  afisha: AfishaEvent[];
  contacts: Contact[];
  faq: FaqItem[];
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
    config: {
      bonuses: defaultBonuses(),
      adminTgIds: [],
      blacklistUsernames: [],
      adminUsername: "",
      adminDeepLink: "",
      publishTemplate: "",
      gFormulas: defaultGFormulas()
    },
    users: {},
    ratesByDate: {},
    requests: [],
    reviews: [],
    atms: [],
    afisha: [],
    contacts: [],
    faq: []
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

export function defaultGFormulas(): Record<string, GFormula> {
  // Defaults match the current client multipliers.
  return {
    "USDT/RUB": { buyMul: 0.98, sellMul: 1.08 },
    "USD/RUB": { buyMul: 0.98, sellMul: 1.08 },
    "EUR/RUB": { buyMul: 0.94, sellMul: 1.08 },
    "THB/RUB": { buyMul: 0.96, sellMul: 1.1 },
    "USD/USDT": { buyMul: 0.965, sellMul: 1.035 },
    "EUR/USD": { buyMul: 0.95, sellMul: 1.05 },
    "EUR/USDT": { buyMul: 0.95, sellMul: 1.05 },
    "USD/THB": { buyMul: 0.95, sellMul: 1.07 },
    "USDT/THB": { buyMul: 0.95, sellMul: 1.07 },
    "EUR/THB": { buyMul: 0.95, sellMul: 1.07 }
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

function normalizeStore(parsed: any): { store: Store; dirty: boolean } {
  const store: Store = {
    ...defaultStore(),
    ...parsed,
    config: { ...(parsed?.config || {}) },
    users: { ...(parsed?.users || {}) },
    ratesByDate: { ...(parsed?.ratesByDate || {}) },
    requests: Array.isArray(parsed?.requests) ? (parsed.requests as any) : [],
    reviews: Array.isArray(parsed?.reviews) ? (parsed.reviews as any) : [],
    atms: Array.isArray(parsed?.atms) ? parsed.atms : [],
    afisha: Array.isArray(parsed?.afisha) ? parsed.afisha : [],
    contacts: Array.isArray(parsed?.contacts) ? parsed.contacts : [],
    faq: Array.isArray(parsed?.faq) ? parsed.faq : []
  };

  let dirty = false;

  // bonuses
  if (!store.config.bonuses) {
    store.config.bonuses = defaultBonuses();
    dirty = true;
  }

  if (!Array.isArray((store.config as any).adminTgIds)) {
    (store.config as any).adminTgIds = [];
    dirty = true;
  }

  if (!Array.isArray((store.config as any).blacklistUsernames)) {
    (store.config as any).blacklistUsernames = [];
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

  // gFormulas
  {
    const def = defaultGFormulas();
    const src = (store.config as any).gFormulas;
    const obj = src && typeof src === "object" ? src : {};
    const cleaned: any = {};
    for (const k of Object.keys(def)) {
      const v = (obj as any)[k];
      const buy = Number(String(v?.buyMul ?? def[k].buyMul).replace(",", "."));
      const sell = Number(String(v?.sellMul ?? def[k].sellMul).replace(",", "."));
      cleaned[k] = {
        buyMul: Number.isFinite(buy) && buy > 0 ? buy : def[k].buyMul,
        sellMul: Number.isFinite(sell) && sell > 0 ? sell : def[k].sellMul
      };
    }
    const before = JSON.stringify(obj ?? null);
    const after = JSON.stringify(cleaned);
    if (before !== after) {
      (store.config as any).gFormulas = cleaned;
      dirty = true;
    }
  }

  if (!Array.isArray(store.contacts)) {
    store.contacts = [];
    dirty = true;
  }

  if (!Array.isArray((store as any).faq)) {
    (store as any).faq = [];
    dirty = true;
  }

  // normalize FAQ items
  for (const it of (store as any).faq as any[]) {
    if (!it || typeof it !== "object") continue;
    if (!it.id) {
      it.id = `faq_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      dirty = true;
    }
    if (typeof it.q !== "string") {
      it.q = String(it.q || "");
      dirty = true;
    }
    if (typeof it.a !== "string") {
      it.a = String(it.a || "");
      dirty = true;
    }
    if (!it.created_at) {
      it.created_at = new Date().toISOString();
      dirty = true;
    }
    if (!it.updated_at) {
      it.updated_at = it.created_at;
      dirty = true;
    }
  }

  if (!Array.isArray((store as any).afisha)) {
    (store as any).afisha = [];
    dirty = true;
  }

  // normalize afisha items
  for (const ev of (store as any).afisha as any[]) {
    if (!ev || typeof ev !== "object") continue;
    if (!ev.id) {
      ev.id = `af_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      dirty = true;
    }
    if (!ev.created_at) {
      ev.created_at = new Date().toISOString();
      dirty = true;
    }
    if (!ev.updated_at) {
      ev.updated_at = ev.created_at;
      dirty = true;
    }
    if (!ev.clicks) {
      ev.clicks = { details: 0, location: 0 };
      dirty = true;
    }
    if (typeof ev.clicks.details !== "number") {
      ev.clicks.details = Number(ev.clicks.details) || 0;
      dirty = true;
    }
    if (typeof ev.clicks.location !== "number") {
      ev.clicks.location = Number(ev.clicks.location) || 0;
      dirty = true;
    }
    if (ev.comment != null && typeof ev.comment !== "string") {
      ev.comment = String(ev.comment || "");
      dirty = true;
    }
  }

  // normalize statuses
  for (const k of Object.keys(store.users || {})) {
    store.users[k].status = normalizeStatus(store.users[k].status);
  }

  for (const r of store.requests || []) {
    if (!r.id) {
      r.id = `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      dirty = true;
    }
    if (!r.state) {
      r.state = "new";
      dirty = true;
    }
    r.status = normalizeStatus((r as any).status);
  }

  // migrate reviews
  if (Array.isArray((store as any).reviews)) {
    const migrated: StoredReview[] = [];
    for (const x of (store as any).reviews) {
      if (!x || typeof x !== "object") continue;
      const id = String((x as any).id || "").trim() || `rev_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const requestId = String((x as any).requestId || (x as any).request_id || "").trim();
      if (!requestId) continue;

      const stateRaw = String((x as any).state || (x as any).status || "approved")
        .toLowerCase()
        .trim();
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
        ...(state === "approved"
          ? { approved_at: String((x as any).approved_at || (x as any).created_at || new Date().toISOString()) }
          : {}),
        ...(state === "rejected" ? { rejected_at: String((x as any).rejected_at || new Date().toISOString()) } : {}),
        ...(typeof (x as any).company_reply === "object" && (x as any).company_reply?.text
          ? {
              company_reply: {
                text: String((x as any).company_reply.text),
                created_at: String((x as any).company_reply.created_at || new Date().toISOString())
              }
            }
          : {})
      });
    }

    if (JSON.stringify((store as any).reviews) !== JSON.stringify(migrated)) {
      (store as any).reviews = migrated;
      dirty = true;
    }
  }

  return { store, dirty };
}

let fileQueue: Promise<any> = Promise.resolve();

async function readStoreFile(): Promise<Store> {
  ensureDir();

  try {
    await fs.promises.access(STORE_PATH, fs.constants.F_OK);
  } catch {
    const s = defaultStore();
    await fs.promises.writeFile(STORE_PATH, JSON.stringify(s, null, 2), "utf-8");
    return s;
  }

  let raw = "";
  try {
    raw = await fs.promises.readFile(STORE_PATH, "utf-8");
  } catch {
    const s = defaultStore();
    await fs.promises.writeFile(STORE_PATH, JSON.stringify(s, null, 2), "utf-8");
    return s;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw || "{}");
  } catch {
    const s = defaultStore();
    await fs.promises.writeFile(STORE_PATH, JSON.stringify(s, null, 2), "utf-8");
    return s;
  }

  const { store, dirty } = normalizeStore(parsed);
  if (dirty) await writeStoreFile(store);
  return store;
}

async function writeStoreFile(store: Store) {
  ensureDir();
  await fs.promises.writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
}

async function readStoreDb(): Promise<Store> {
  await ensureSchema();
  const pool = getPool();
  const r = await pool.query("SELECT data FROM app_store WHERE id=1");
  const parsed = r.rows?.[0]?.data || {};
  const { store, dirty } = normalizeStore(parsed);
  if (dirty) await writeStoreDb(store);
  return store;
}

async function writeStoreDb(store: Store) {
  await ensureSchema();
  const pool = getPool();
  await pool.query("UPDATE app_store SET data=$2, updated_at=now() WHERE id=$1", [1, store]);
}

export async function readStore(): Promise<Store> {
  return HAS_DATABASE ? readStoreDb() : readStoreFile();
}

export async function writeStore(store: Store) {
  return HAS_DATABASE ? writeStoreDb(store) : writeStoreFile(store);
}

export async function mutateStore<T>(fn: (store: Store) => T | Promise<T>): Promise<{ store: Store; result: T }> {
  if (!HAS_DATABASE) {
    // serialize writes in-process
    let result!: T;
    fileQueue = fileQueue.then(async () => {
      const store = await readStoreFile();
      result = await fn(store);
      await writeStoreFile(store);
      return null;
    });
    await fileQueue;
    const store = await readStoreFile();
    return { store, result };
  }

  await ensureSchema();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const r = await client.query("SELECT data FROM app_store WHERE id=1 FOR UPDATE");
    const parsed = r.rows?.[0]?.data || {};
    const { store } = normalizeStore(parsed);

    const result = await fn(store);
    await client.query("UPDATE app_store SET data=$2, updated_at=now() WHERE id=$1", [1, store]);
    await client.query("COMMIT");
    return { store, result };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
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

export async function upsertUserFromTelegram(u: {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}): Promise<StoredUser> {
  const { result } = await mutateStore((store) => {
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
      // Не перетираем статус клиента из users устаревшим статусом из contacts.
      // contact.status нужен только как начальное значение при первом создании user.
      // Иначе после ручной смены статуса админом он может неожиданно откатываться.
      existing.status = normalizeStatus(existing.status ?? contact?.status);
      existing.last_seen_at = now;
    }

    return store.users[key];
  });

  return result;
}
