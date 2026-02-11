import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export type UserStatus = "none" | "bronze" | "silver" | "gold";

export type Store = {
  config: { groupChatId: number | null };
  users: Record<
    string,
    {
      tg_id: number;
      username?: string;
      first_name?: string;
      last_name?: string;
      status: UserStatus;
      created_at: string;
      last_seen_at: string;
    }
  >;
  ratesByDate: Record<
    string,
    {
      updated_at: string;
      updated_by: number;
      rates: {
        USD: { buy_vnd: number; sell_vnd: number };
        RUB: { buy_vnd: number; sell_vnd: number };
        USDT: { buy_vnd: number; sell_vnd: number };
      };
    }
  >;
  requests: Array<any>;
  reviews: Array<{
    id: string;
    tg_id: number;
    username?: string;
    rating: number;
    text: string;
    created_at: string;
    is_public: boolean;
  }>;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// server/dist/ -> server/data/store.json
const STORE_PATH = path.resolve(__dirname, "../data", "store.json");

function ensureStoreFile() {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(
      STORE_PATH,
      JSON.stringify(
        { config: { groupChatId: null }, users: {}, ratesByDate: {}, requests: [], reviews: [] },
        null,
        2
      ),
      "utf8"
    );
  }
}

export function readStore(): Store {
  ensureStoreFile();
  const raw = fs.readFileSync(STORE_PATH, "utf8");
  return JSON.parse(raw) as Store;
}

export function writeStore(next: Store) {
  ensureStoreFile();
  const tmp = STORE_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
  fs.renameSync(tmp, STORE_PATH);
}

export function upsertUserFromTelegram(user: {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}): { status: UserStatus } {
  const store = readStore();
  const key = String(user.id);
  const now = new Date().toISOString();

  if (!store.users[key]) {
    store.users[key] = {
      tg_id: user.id,
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      status: "none",
      created_at: now,
      last_seen_at: now
    };
  } else {
    store.users[key].username = user.username ?? store.users[key].username;
    store.users[key].first_name = user.first_name ?? store.users[key].first_name;
    store.users[key].last_name = user.last_name ?? store.users[key].last_name;
    store.users[key].last_seen_at = now;
  }

  writeStore(store);
  return { status: store.users[key].status };
}
