import { createHash } from "node:crypto";
import type { Store, StoredRequest, StoredUser, RequestState } from "./store.js";

export const REFERRAL_TERMS = { currency: "CashCoin", rubPerCoin: 1, friendRate: 0.005, inviterRate: 0.005, dailyLimit: 20 } as const;
// Retained for historical USD requests. New requests use cashcoin.quote.
export type ReferralQuote = { captured_at: string; ratesDate: string; vndPerUsd: number; usdPerUnit: Record<string, number> };
export type CoinQuote = { ratesDate: string; rates: Record<string, number>; key: string };
export type CashCoinBonus = {
  version: 1; quote: CoinQuote; baseBuyAmount: number;
  welcomeSell: number; welcomeBuy: number; redeemMinor: number; redeemBuy: number;
  totalBuy: number; availableMinor: number; key: string;
};
export type BonusEntry = {
  // cents are hundredths of currency; all new entries explicitly use CashCoin.
  id: string; tg_id: number; cents: number; currency?: "CashCoin";
  kind: "welcome" | "referrer" | "payout" | "redemption" | "test_credit";
  created_at: string; request_id?: string; peer_id?: number; by?: number; note?: string;
  legacyUsdCents?: number; migrated_at?: string; migrationRubPerUsd?: number;
};

const validRate = (n: number) => Number.isFinite(n) && n > 0;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const active = (r: StoredRequest) => r.state === "new" || r.state === "in_progress";
export const roundBonus = (currency: string, amount: number) => {
  const scale = currency === "VND" ? 1 : 100;
  const units = Math.floor((amount + Number.EPSILON * Math.max(1, amount)) * scale);
  if (!Number.isSafeInteger(units) || units < 0) throw new Error("referral_bad_amount");
  return units / scale;
};

// Only the owner's daily prices are allowed here; no market/G fallback.
export function captureCoinQuote(store: Store, now: string): CoinQuote {
  const ratesDate = new Date(now).toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  const day = store.ratesByDate[ratesDate];
  const currencies = ["RUB", "USD", "USDT", "VND", "EUR", "THB", "KZT"];
  const rates: Record<string, number> = {};
  for (const from of currencies) for (const to of currencies) {
    if (from === to) { rates[`${from}>${to}`] = 1; continue; }
    const direct = Number(day?.cross?.[`${from}/${to}`]?.buy);
    const reverse = Number(day?.cross?.[`${to}/${from}`]?.sell);
    const buy = from === "VND" ? 1 : Number((day?.rates as any)?.[from]?.buy_vnd);
    const sell = to === "VND" ? 1 : Number((day?.rates as any)?.[to]?.sell_vnd);
    const rate = validRate(direct) ? direct : validRate(reverse) ? 1 / reverse : validRate(buy) && validRate(sell) ? buy / sell : NaN;
    if (validRate(rate)) rates[`${from}>${to}`] = rate;
  }
  return { ratesDate, rates, key: digest({ ratesDate, rates }) };
}
function rate(quote: CoinQuote, from: string, to: string) {
  const value = quote.rates[`${from}>${to}`];
  if (!validRate(value)) throw new Error("referral_rates_missing");
  return value;
}

// Run inside mutateStore. Preserve original USD amounts and the exact migration rate.
export function migrateLegacyBonuses(store: Store, now = new Date().toISOString()) {
  const legacy = store.bonusLedger.filter(e => e.currency !== "CashCoin");
  if (!legacy.length) return;
  const conversion = captureCoinQuote(store, now).rates["USD>RUB"];
  // Leave USD entries intact until the owner sets today's conversion rate.
  // Existing CashCoin balances and operations remain available independently.
  if (!validRate(conversion)) return;
  const running = new Map<number, { usd: number; coins: number }>();
  for (const e of legacy) {
    const previous = running.get(e.tg_id) || { usd: 0, coins: 0 };
    const usd = previous.usd + e.cents;
    const total = Math.round(usd * conversion);
    const coins = total - previous.coins;
    if (!Number.isSafeInteger(total) || !Number.isSafeInteger(coins)) throw new Error("referral_bad_amount");
    running.set(e.tg_id, { usd, coins: total });
    e.legacyUsdCents = e.cents; e.cents = coins; e.currency = "CashCoin";
    e.migrated_at = now; e.migrationRubPerUsd = conversion;
  }
}

export function attachReferral(store: Store, user: StoredUser, payload: string | undefined, now: string) {
  user.referral_code = String(user.tg_id);
  const match = /^ref_([1-9]\d{0,15})$/.exec(payload || "");
  if (!match) return;
  const inviter = store.users[match[1]];
  if (!inviter || inviter.tg_id === user.tg_id || !Number.isSafeInteger(inviter.tg_id)) return;
  if (store.requests.some(r => r.from.id === user.tg_id) || store.contacts.some(c => c.tg_id === user.tg_id)) return;
  const today = Object.values(store.users).filter(u => u.referred_by === inviter.tg_id && u.referred_at?.slice(0, 10) === now.slice(0, 10)).length;
  if (today >= REFERRAL_TERMS.dailyLimit) { user.referral_rejected = "daily_limit"; return; }
  user.referred_by = inviter.tg_id; user.referred_at = now;
}

export function balanceCents(store: Store, tgId: number) {
  return store.bonusLedger.filter(e => e.tg_id === tgId && e.currency === "CashCoin").reduce((sum, e) => sum + e.cents, 0);
}
export function reservedCents(store: Store, tgId: number, exceptId?: string) {
  return store.requests.filter(r => r.from.id === tgId && r.id !== exceptId && active(r)).reduce((sum, r) => sum + (r.cashcoin?.redeemMinor || 0), 0);
}
export function referralSummary(store: Store, tgId: number) {
  const entries = store.bonusLedger.filter(e => e.tg_id === tgId && e.currency === "CashCoin");
  const invited = Object.values(store.users).filter(u => u.referred_by === tgId);
  const balance = balanceCents(store, tgId), reserved = reservedCents(store, tgId);
  const legacyUsdCents = store.bonusLedger.filter(e => e.tg_id === tgId && e.currency !== "CashCoin").reduce((sum, e) => sum + e.cents, 0);
  return { currency: "CashCoin" as const, legacyUsdCents, balanceCents: balance, reservedCents: reserved, availableCents: balance - reserved,
    invitedCount: invited.length, completedCount: invited.filter(u => u.referral_reward_request_id).length,
    earnedCents: entries.filter(e => e.cents > 0).reduce((s, e) => s + e.cents, 0),
    paidCents: -entries.filter(e => e.cents < 0).reduce((s, e) => s + e.cents, 0) };
}
function firstExchange(store: Store, tgId: number, exceptId?: string) {
  const user = store.users[String(tgId)];
  return !!user?.referred_by && !user.referral_reward_request_id && !store.requests.some(r => r.id !== exceptId && r.from.id === tgId && (r.state === "done" || !!r.funds_received_at));
}
export function welcomeAvailable(store: Store, tgId: number) {
  return firstExchange(store, tgId) && !store.requests.some(r => r.from.id === tgId && active(r) && !!r.cashcoin?.welcomeSell);
}

export function previewCashCoin(store: Store, input: { tgId: number; sellCurrency: string; buyCurrency: string; sellAmount: number; buyAmount: number; redeemMinor?: number; id?: string }, now = new Date().toISOString(), fixedQuote?: CoinQuote): CashCoinBonus {
  const { tgId, sellCurrency, buyCurrency, sellAmount, buyAmount } = input;
  if (!validRate(sellAmount) || !validRate(buyAmount) || !Number.isSafeInteger(Math.round(sellAmount * 100)) || !Number.isSafeInteger(Math.round(buyAmount * 100))) throw new Error("referral_bad_amount");
  const redeemMinor = input.redeemMinor ?? 0;
  if (!Number.isSafeInteger(redeemMinor) || redeemMinor < 0) throw new Error("referral_bad_payout");
  const availableMinor = balanceCents(store, tgId) - reservedCents(store, tgId, input.id);
  if (redeemMinor > availableMinor) throw new Error("referral_insufficient_balance");
  const quote = fixedQuote || captureCoinQuote(store, now);
  const first = firstExchange(store, tgId, input.id);
  if (first && store.requests.some(r => r.id !== input.id && r.from.id === tgId && active(r) && !!r.cashcoin?.welcomeSell)) throw new Error("referral_first_pending");
  const welcomeSell = first ? roundBonus(sellCurrency, sellAmount * REFERRAL_TERMS.friendRate) : 0;
  // Exchange the gift at the same agreed rate as the client's own principal.
  const welcomeBuy = welcomeSell ? roundBonus(buyCurrency, buyAmount * welcomeSell / sellAmount) : 0;
  const redeemBuy = redeemMinor ? roundBonus(buyCurrency, redeemMinor / 100 * rate(quote, "RUB", buyCurrency)) : 0;
  if (redeemMinor && !redeemBuy) throw new Error("referral_bonus_too_small");
  if (first) rate(quote, buyCurrency, "RUB");
  const totalBuy = Number((buyAmount + welcomeBuy + redeemBuy).toFixed(buyCurrency === "VND" ? 0 : 2));
  if (!Number.isSafeInteger(Math.round(totalBuy * (buyCurrency === "VND" ? 1 : 100)))) throw new Error("referral_bad_amount");
  const fields = { version: 1 as const, quote, baseBuyAmount: buyAmount, welcomeSell, welcomeBuy, redeemMinor, redeemBuy, totalBuy, availableMinor };
  return { ...fields, key: digest({ tgId, sellCurrency, buyCurrency, sellAmount, buyAmount, quote: quote.key, welcomeSell, welcomeBuy, redeemMinor, redeemBuy, totalBuy }) };
}

export function prepareReferralRequest(store: Store, request: StoredRequest, input: { redeemMinor?: number; quoteKey?: string } = {}) {
  migrateLegacyBonuses(store);
  const bonus = previewCashCoin(store, { tgId: request.from.id, ...request, redeemMinor: input.redeemMinor }, request.created_at);
  if ((bonus.welcomeSell || bonus.redeemMinor) && input.quoteKey !== bonus.key) throw new Error("referral_quote_changed");
  request.bonus_balance_cents = balanceCents(store, request.from.id);
  request.cashcoin = bonus;
  request.buyAmount = bonus.totalBuy;
}

// Staff edits provide the base payout, without bonuses; keep the saved daily rates.
export function repriceCashCoinRequest(store: Store, request: StoredRequest, baseBuyAmount: number) {
  if (!request.cashcoin) return;
  const bonus = previewCashCoin(store, { ...request, tgId: request.from.id, buyAmount: baseBuyAmount, redeemMinor: request.cashcoin.redeemMinor }, request.created_at, request.cashcoin.quote);
  request.cashcoin = bonus; request.buyAmount = bonus.totalBuy;
}

// Inside mutateStore: receipt, reservation consumption and inviter credit are atomic.
export function changeRequestState(store: Store, request: StoredRequest, next: RequestState, by: number, fundsReceived: boolean) {
  if (request.funds_received_at && next !== "done") throw new Error("referral_completed_locked");
  if (request.state === next) return false;
  migrateLegacyBonuses(store);
  const bonus = request.cashcoin;
  if ((next === "new" || next === "in_progress" || next === "done") && bonus) {
    if (bonus.redeemMinor > balanceCents(store, request.from.id) - reservedCents(store, request.from.id, request.id)) throw new Error("referral_insufficient_balance");
    if (bonus.welcomeSell && (!firstExchange(store, request.from.id, request.id) || store.requests.some(r => r.id !== request.id && r.from.id === request.from.id && active(r) && !!r.cashcoin?.welcomeSell))) throw new Error("referral_first_pending");
  }
  if (next === "done") {
    if (!fundsReceived) throw new Error("funds_received_required");
    const now = new Date().toISOString();
    const user = store.users[String(request.from.id)];
    if (bonus?.redeemMinor) {
      const id = `redemption:${request.id}`;
      if (store.bonusLedger.some(e => e.id === id)) throw new Error("referral_already_rewarded");
      store.bonusLedger.push({ id, tg_id: request.from.id, cents: -bonus.redeemMinor, currency: "CashCoin", kind: "redemption", request_id: request.id, created_at: now, by });
    }
    if (user?.referred_by && firstExchange(store, user.tg_id, request.id)) {
      const quote = bonus?.quote || captureCoinQuote(store, request.created_at);
      const inviterCents = Math.round(request.buyAmount * REFERRAL_TERMS.inviterRate * rate(quote, request.buyCurrency, "RUB") * 100);
      if (!Number.isSafeInteger(inviterCents) || inviterCents < 0) throw new Error("referral_bad_amount");
      const id = `referrer:${user.tg_id}`;
      if (store.bonusLedger.some(e => e.id === id)) throw new Error("referral_already_rewarded");
      store.bonusLedger.push({ id, tg_id: user.referred_by, cents: inviterCents, currency: "CashCoin", kind: "referrer", peer_id: user.tg_id, request_id: request.id, created_at: now });
      user.referral_reward_request_id = request.id; user.referral_rewarded_at = now;
    }
    request.funds_received_at = now; request.funds_received_by = by;
  }
  request.state = next; request.state_updated_at = new Date().toISOString(); request.state_updated_by = by;
  return true;
}

export function recordBonusPayout(store: Store, input: { id: string; tgId: number; cents: number; note: string }, by: number) {
  migrateLegacyBonuses(store);
  const { id, tgId, cents, note } = input;
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(id) || !Number.isSafeInteger(cents) || cents <= 0 || !store.users[String(tgId)] || !note.trim()) throw new Error("referral_bad_payout");
  const existing = store.bonusLedger.find(e => e.id === `payout:${id}`);
  if (existing) {
    if (existing.tg_id !== tgId || existing.cents !== -cents || existing.note !== note) throw new Error("referral_payout_conflict");
    return existing;
  }
  if (balanceCents(store, tgId) - reservedCents(store, tgId) < cents) throw new Error("referral_insufficient_balance");
  const entry: BonusEntry = { id: `payout:${id}`, tg_id: tgId, cents: -cents, currency: "CashCoin", kind: "payout", created_at: new Date().toISOString(), by, note };
  store.bonusLedger.push(entry);
  return entry;
}

// The route also requires owner authentication and the dedicated staging service.
export function recordTestBonusCredit(store: Store, input: { id: string; tgId: number; cents: number; note: string }, by: number) {
  migrateLegacyBonuses(store);
  const { id, tgId, cents, note } = input;
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(id) || !Number.isSafeInteger(cents) || cents <= 0 || cents > 100_000_000 || !store.users[String(tgId)] || !note.trim()) throw new Error("referral_bad_payout");
  const existing = store.bonusLedger.find(e => e.id === `test-credit:${id}`);
  if (existing) {
    if (existing.tg_id !== tgId || existing.cents !== cents || existing.note !== note) throw new Error("referral_payout_conflict");
    return existing;
  }
  const entry: BonusEntry = { id: `test-credit:${id}`, tg_id: tgId, cents, currency: "CashCoin", kind: "test_credit", created_at: new Date().toISOString(), by, note };
  store.bonusLedger.push(entry);
  return entry;
}

export function requestBonusAmounts(request: StoredRequest, format: (currency: string, n: number) => string) {
  const bonus = request.cashcoin;
  const sell = format(request.sellCurrency, request.sellAmount);
  const buy = format(request.buyCurrency, request.buyAmount);
  if (!bonus) return { sell, buy };
  const added = bonus.welcomeBuy + bonus.redeemBuy;
  return {
    sell: bonus.welcomeSell ? `${sell} + ${format(request.sellCurrency, bonus.welcomeSell)} б = ${format(request.sellCurrency, request.sellAmount + bonus.welcomeSell)}` : sell,
    buy: added ? `${format(request.buyCurrency, bonus.baseBuyAmount)} + ${format(request.buyCurrency, added)} б = ${buy}` : buy,
  };
}

export function ownerReferralReport(store: Store) {
  const people = Object.values(store.users);
  const label = (id: number) => {
    const u = store.users[String(id)];
    return { tgId: id, name: u?.username ? `@${u.username}` : [u?.first_name, u?.last_name].filter(Boolean).join(" ") || String(id) };
  };
  return {
    accounts: people.map(u => ({ ...label(u.tg_id), ...referralSummary(store, u.tg_id) })),
    referrals: people.filter(u => u.referred_by).map(u => {
      const completed = store.requests.filter(r => r.from.id === u.tg_id && r.state === "done");
      const volume: Record<string, number> = {};
      for (const r of completed) volume[r.sellCurrency] = (volume[r.sellCurrency] || 0) + r.sellAmount;
      const rewards = store.bonusLedger.filter(e => e.request_id === u.referral_reward_request_id && e.currency === "CashCoin");
      const first = completed.find(r => r.id === u.referral_reward_request_id);
      return { inviter: label(u.referred_by!), friend: label(u.tg_id), invitedAt: u.referred_at,
        status: u.referral_reward_request_id ? "credited" : completed.length ? "completed" : "invited",
        rewardedAt: u.referral_rewarded_at, firstRequestId: u.referral_reward_request_id,
        completedCount: completed.length, volume,
        inviterCents: rewards.find(e => e.kind === "referrer")?.cents || 0,
        friendCents: rewards.find(e => e.kind === "welcome")?.cents || 0,
        friendBonus: first?.cashcoin ? { amount: first.cashcoin.welcomeSell, currency: first.sellCurrency, received: first.cashcoin.welcomeBuy, receiveCurrency: first.buyCurrency } : undefined,
      };
    }).sort((a, b) => String(b.invitedAt).localeCompare(String(a.invitedAt))),
    ledger: [...store.bonusLedger].reverse(), terms: REFERRAL_TERMS,
  };
}
