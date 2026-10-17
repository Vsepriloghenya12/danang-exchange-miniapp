import { findContact, normalizeStatus, type Store } from './store.js';
import { setUserStatus } from './userStatus.js';
import { GOLD_AT_VND, SILVER_AT_VND, vndEquivalent } from './domain/loyalty.js';

export function loyaltyVolume(store: Store, tgId: number) {
  let total = 0, partial = false;
  for (const request of store.requests) {
    if (request.from.id !== tgId || request.state !== 'done') continue;
    const date = new Date(request.created_at);
    const day = Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }) : '';
    const amount = vndEquivalent(request, store.ratesByDate?.[day]?.rates);
    if (amount == null) partial = true; else total += amount;
  }
  return { total, partial };
}

// Call inside the same transaction that completes the exchange. Never downgrade.
export function promoteLoyaltyStatus(store: Store, tgId: number, now: string) {
  const user = store.users[String(tgId)];
  const current = normalizeStatus(user?.status ?? findContact(store, { tg_id: tgId, username: user?.username })?.status);
  const { total } = loyaltyVolume(store, tgId);
  const next = total >= GOLD_AT_VND ? 'gold' : total >= SILVER_AT_VND ? 'silver' : 'standard';
  const rank = { standard: 0, silver: 1, gold: 2 };
  return rank[next] > rank[current] ? setUserStatus(store, tgId, next, now) : null;
}
