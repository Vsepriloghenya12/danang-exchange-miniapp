import type { Store, StoredRequest, StoredUser, RequestState } from "./store.js";

export const REFERRAL_TERMS = { friendVnd: 50_000, inviterRate: 0.005, dailyLimit: 20 } as const;
export type ReferralQuote = { captured_at: string; ratesDate: string; vndPerUsd: number; usdPerUnit: Record<string, number> };
export type BonusEntry = {
  id: string; tg_id: number; cents: number; kind: "welcome" | "referrer" | "payout";
  created_at: string; request_id?: string; peer_id?: number; by?: number; note?: string;
};

export function attachReferral(store: Store, user: StoredUser, payload: string | undefined, now: string) {
  user.referral_code = String(user.tg_id);
  const match = /^ref_([1-9]\d{0,15})$/.exec(payload || "");
  if (!match) return;
  const inviter = store.users[match[1]];
  if (!inviter || inviter.tg_id === user.tg_id || !Number.isSafeInteger(inviter.tg_id)) return;
  // A pre-existing contact or request also makes this an existing customer.
  if (store.requests.some(r => r.from.id === user.tg_id) || store.contacts.some(c => c.tg_id === user.tg_id)) return;
  const day = now.slice(0, 10);
  const today = Object.values(store.users).filter(u => u.referred_by === inviter.tg_id && u.referred_at?.slice(0, 10) === day).length;
  if (today >= REFERRAL_TERMS.dailyLimit) { user.referral_rejected = "daily_limit"; return; }
  user.referred_by = inviter.tg_id;
  user.referred_at = now;
}

export function balanceCents(store: Store, tgId: number) {
  return store.bonusLedger.filter(e => e.tg_id === tgId).reduce((sum, e) => sum + e.cents, 0);
}

export function referralSummary(store: Store, tgId: number) {
  const entries = store.bonusLedger.filter(e => e.tg_id === tgId);
  const invited = Object.values(store.users).filter(u => u.referred_by === tgId);
  return {
    balanceCents: balanceCents(store, tgId), invitedCount: invited.length,
    completedCount: invited.filter(u => u.referral_reward_request_id).length,
    earnedCents: entries.filter(e => e.cents > 0).reduce((s, e) => s + e.cents, 0),
    paidCents: -entries.filter(e => e.kind === "payout").reduce((s, e) => s + e.cents, 0),
  };
}

export function captureReferralQuote(store: Store, now: string): ReferralQuote | undefined {
  const ratesDate = new Date(now).toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  const rates = store.ratesByDate[ratesDate]?.rates;
  const vndPerUsd = Number(rates?.USD?.sell_vnd);
  if (!Number.isFinite(vndPerUsd) || vndPerUsd <= 0) return;
  const usdPerUnit: Record<string, number> = { USD: 1, VND: 1 / vndPerUsd };
  for (const [currency, rate] of Object.entries(rates || {})) {
    if (currency !== "USD" && Number.isFinite(rate.buy_vnd) && rate.buy_vnd > 0) usdPerUnit[currency] = rate.buy_vnd / vndPerUsd;
  }
  return { captured_at: now, ratesDate, vndPerUsd, usdPerUnit };
}

function usdCents(request: StoredRequest) {
  const amount = request.sellAmount * Number(request.referral_quote?.usdPerUnit[request.sellCurrency]) * 100;
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(Math.round(amount))) throw new Error("referral_rates_missing");
  return Math.round(amount);
}

export function prepareReferralRequest(store: Store, request: StoredRequest) {
  request.referral_quote = captureReferralQuote(store, request.created_at);
  request.bonus_balance_cents = balanceCents(store, request.from.id);
  const user = store.users[String(request.from.id)];
  if (user?.referred_by && !user.referral_reward_request_id) usdCents(request);
}

// Called only inside mutateStore: the state, receipt and both credits commit together.
export function changeRequestState(store: Store, request: StoredRequest, next: RequestState, by: number, fundsReceived: boolean) {
  if (request.funds_received_at && next !== "done") throw new Error("referral_completed_locked");
  if (request.state === next) return false;
  if (next === "done") {
    if (!fundsReceived) throw new Error("funds_received_required");
    const now = new Date().toISOString();
    const user = store.users[String(request.from.id)];
    const previousDone = store.requests.some(r => r.id !== request.id && r.from.id === request.from.id && (r.state === "done" || !!r.funds_received_at));
    if (user?.referred_by && !user.referral_reward_request_id && !previousDone) {
      const notionalCents = usdCents(request);
      const friendCents = Math.round(REFERRAL_TERMS.friendVnd / Number(request.referral_quote?.vndPerUsd) * 100);
      const inviterCents = Math.round(notionalCents * REFERRAL_TERMS.inviterRate);
      if (!Number.isSafeInteger(friendCents) || friendCents < 0) throw new Error("referral_rates_missing");
      request.referral_usd_cents = notionalCents;
      const entries: BonusEntry[] = [
        { id: `welcome:${user.tg_id}`, tg_id: user.tg_id, cents: friendCents, kind: "welcome", peer_id: user.referred_by, request_id: request.id, created_at: now },
        { id: `referrer:${user.tg_id}`, tg_id: user.referred_by, cents: inviterCents, kind: "referrer", peer_id: user.tg_id, request_id: request.id, created_at: now },
      ];
      if (entries.some(entry => store.bonusLedger.some(e => e.id === entry.id))) throw new Error("referral_already_rewarded");
      store.bonusLedger.push(...entries);
      user.referral_reward_request_id = request.id;
      user.referral_rewarded_at = now;
    } else if (request.referral_quote?.usdPerUnit[request.sellCurrency]) {
      request.referral_usd_cents = usdCents(request);
    }
    request.funds_received_at = now;
    request.funds_received_by = by;
  }
  request.state = next;
  request.state_updated_at = new Date().toISOString();
  request.state_updated_by = by;
  return true;
}

export function recordBonusPayout(store: Store, input: { id: string; tgId: number; cents: number; note: string }, by: number) {
  const { id, tgId, cents, note } = input;
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(id) || !Number.isSafeInteger(cents) || cents <= 0 || !store.users[String(tgId)] || !note.trim()) throw new Error("referral_bad_payout");
  const existing = store.bonusLedger.find(e => e.id === `payout:${id}`);
  if (existing) {
    if (existing.tg_id !== tgId || existing.cents !== -cents || existing.note !== note) throw new Error("referral_payout_conflict");
    return existing;
  }
  if (balanceCents(store, tgId) < cents) throw new Error("referral_insufficient_balance");
  const entry: BonusEntry = { id: `payout:${id}`, tg_id: tgId, cents: -cents, kind: "payout", created_at: new Date().toISOString(), by, note };
  store.bonusLedger.push(entry);
  return entry;
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
      const rewards = store.bonusLedger.filter(e => e.request_id === u.referral_reward_request_id);
      return {
        inviter: label(u.referred_by!), friend: label(u.tg_id), invitedAt: u.referred_at,
        status: u.referral_reward_request_id ? "credited" : completed.length ? "completed" : "invited",
        rewardedAt: u.referral_rewarded_at, firstRequestId: u.referral_reward_request_id,
        completedCount: completed.length, volume,
        inviterCents: rewards.find(e => e.kind === "referrer")?.cents || 0,
        friendCents: rewards.find(e => e.kind === "welcome")?.cents || 0,
      };
    }).sort((a, b) => String(b.invitedAt).localeCompare(String(a.invitedAt))),
    ledger: [...store.bonusLedger].reverse(), terms: REFERRAL_TERMS,
  };
}
