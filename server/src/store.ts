import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { HAS_DATABASE, ensureSchema, getPool } from "./db.js";
import type { BonusesConfig, BonusesTier, GFormula, Rates } from "./domain/exchange.js";
import { defaultBonuses, defaultGFormulas } from "./domain/exchange.js";
import type { RequestState, UserStatus } from "./domain/status.js";
import { normalizeStatus, parseStatusInput } from "./domain/status.js";

export type { BonusesConfig, BonusesTier, GFormula, Rates } from "./domain/exchange.js";
export { defaultBonuses, defaultGFormulas } from "./domain/exchange.js";
export type { RequestState, UserStatus } from "./domain/status.js";
export { normalizeStatus, parseStatusInput } from "./domain/status.js";

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
  | "games"
  | "market"
  | "food"
  | "music"
  | "learning"
  | "misc";

export type AfishaEvent = {
  id: string;
  category: AfishaCategory;
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM
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


export type SupportDialogMessage = {
  id: string;
  from: "manager" | "client";
  text: string;
  created_at: string;
  manager_tg_id?: number;
  manager_name?: string;
};

export type SupportDialog = {
  client_tg_id: number;
  manager_tg_id: number;
  manager_name?: string;
  request_id?: string;
  created_at: string;
  updated_at: string;
  manager_read_at?: string;
  last_manager_text?: string;
  last_client_text?: string;
  messages?: SupportDialogMessage[];
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
    supportDialogs?: Record<string, SupportDialog>;

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
  clientContact?: string;
  language?: "ru" | "en";
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
  comment?: string;
  clientContact?: string;
  language?: "ru" | "en";
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

  if (!(store.config as any).supportDialogs || typeof (store.config as any).supportDialogs !== "object" || Array.isArray((store.config as any).supportDialogs)) {
    (store.config as any).supportDialogs = {};
    dirty = true;
  }
  {
    const src = (store.config as any).supportDialogs as Record<string, any>;
    const cleaned: Record<string, SupportDialog> = {};
    for (const [k, v] of Object.entries(src || {})) {
      if (!v || typeof v !== "object") continue;
      const client_tg_id = Number((v as any).client_tg_id ?? k);
      const manager_tg_id = Number((v as any).manager_tg_id);
      if (!Number.isFinite(client_tg_id) || client_tg_id <= 0) continue;
      if (!Number.isFinite(manager_tg_id) || manager_tg_id <= 0) continue;
      const rawMsgs = Array.isArray((v as any).messages) ? (v as any).messages : [];
      const messages = rawMsgs
        .map((m: any) => {
          if (!m || typeof m !== "object") return null;
          const text = typeof m.text === "string" ? m.text.trim() : "";
          const from = m.from === "client" ? "client" : m.from === "manager" ? "manager" : "";
          if (!text || !from) return null;
          const created_at = String(m.created_at || new Date().toISOString());
          return {
            id: typeof m.id === "string" && m.id ? m.id : `${created_at}-${Math.random().toString(36).slice(2,8)}`,
            from,
            text,
            created_at,
            manager_tg_id: Number.isFinite(Number(m.manager_tg_id)) ? Number(m.manager_tg_id) : undefined,
            manager_name: typeof m.manager_name === "string" ? m.manager_name : undefined
          } as SupportDialogMessage;
        })
        .filter(Boolean)
        .slice(-100) as SupportDialogMessage[];
      cleaned[String(client_tg_id)] = {
        client_tg_id,
        manager_tg_id,
        manager_name: typeof (v as any).manager_name === "string" ? (v as any).manager_name : undefined,
        request_id: typeof (v as any).request_id === "string" ? (v as any).request_id : undefined,
        created_at: String((v as any).created_at || new Date().toISOString()),
        updated_at: String((v as any).updated_at || (v as any).created_at || new Date().toISOString()),
        manager_read_at: typeof (v as any).manager_read_at === "string" ? (v as any).manager_read_at : undefined,
        last_manager_text: typeof (v as any).last_manager_text === "string" ? (v as any).last_manager_text : undefined,
        last_client_text: typeof (v as any).last_client_text === "string" ? (v as any).last_client_text : undefined,
        messages
      };
    }
    const before = JSON.stringify(src || {});
    const after = JSON.stringify(cleaned);
    if (before !== after) {
      (store.config as any).supportDialogs = cleaned;
      dirty = true;
    }
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
    if (ev.time != null) {
      const t = String(ev.time || "").trim();
      const normTime = /^\d{2}:\d{2}$/.test(t) ? t : "";
      if (normTime) {
        if (ev.time !== normTime) {
          ev.time = normTime;
          dirty = true;
        }
      } else {
        delete ev.time;
        dirty = true;
      }
    }
    const cats = Array.isArray(ev.categories)
      ? ev.categories
      : ev.category
      ? [ev.category]
      : [];
    const normCats = Array.from(
      new Set(
        cats
          .map((x: any) => String(x || "").trim().toLowerCase())
          .map((x: string) => (x === "город" || x === "city" ? "culture" : x))
          .filter(Boolean)
      )
    ).slice(0, 3);
    if (!Array.isArray(ev.categories) || JSON.stringify(ev.categories) !== JSON.stringify(normCats)) {
      ev.categories = normCats;
      dirty = true;
    }
    if (normCats[0] && ev.category !== normCats[0]) {
      ev.category = normCats[0];
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

export function upsertContactRecord(
  store: Store,
  input: {
    tg_id?: number;
    username?: string;
    fullName?: string;
    banks?: string[];
    status?: UserStatus;
    clientContact?: string;
  language?: "ru" | "en";
    now?: string;
  }
): Contact {
  const now = input.now || new Date().toISOString();
  const tg_id = Number.isFinite(Number(input.tg_id)) && Number(input.tg_id) > 0 ? Number(input.tg_id) : undefined;
  const username = normUsername(input.username);
  const fullName = typeof input.fullName === "string" ? input.fullName.trim() : undefined;
  const banks = Array.isArray(input.banks) ? [...input.banks] : undefined;
  const status = input.status ? normalizeStatus(input.status) : undefined;
  const clientContact = typeof input.clientContact === "string" ? input.clientContact.trim().slice(0, 250) : undefined;

  if (!store.contacts || !Array.isArray(store.contacts)) store.contacts = [];

  const list = store.contacts;
  const byTg = tg_id ? list.find((x) => x && Number(x.tg_id) === tg_id) : undefined;
  const byU = username ? list.find((x) => x && normUsername(x.username) === username) : undefined;

  let c = byTg || byU;

  if (byTg && byU && byTg !== byU) {
    const primary = byTg as Contact;
    const secondary = byU as Contact;
    primary.username = primary.username || secondary.username;
    primary.fullName = primary.fullName || secondary.fullName;
    primary.banks = Array.isArray(primary.banks) && primary.banks.length ? primary.banks : secondary.banks;
    primary.status = primary.status || secondary.status;
    primary.clientContact = primary.clientContact || secondary.clientContact;
    primary.created_at = primary.created_at || secondary.created_at;

    const i = list.indexOf(secondary as any);
    if (i >= 0) list.splice(i, 1);
    c = primary;
  }

  if (!c) {
    const id = tg_id ? `tg_${tg_id}` : `u_${username}`;
    c = { id, created_at: now, updated_at: now } as Contact;
    list.push(c);
  } else {
    const desiredId = tg_id ? `tg_${tg_id}` : `u_${username}`;
    if (!c.id) c.id = desiredId;
    if (desiredId && c.id !== desiredId && !list.some((x) => x && x !== c && x.id === desiredId)) {
      c.id = desiredId;
    }
  }

  c.updated_at = now;
  if (tg_id) c.tg_id = tg_id;
  if (username) c.username = username;
  if (fullName !== undefined) c.fullName = fullName;
  if (banks !== undefined) c.banks = banks;
  if (status) c.status = status;
  if (clientContact !== undefined) c.clientContact = clientContact;

  return c;
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
