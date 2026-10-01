import assert from "node:assert/strict";
import { test } from "node:test";
import { balanceCents, captureCoinQuote, changeRequestState, migrateLegacyBonuses, prepareReferralRequest, previewCashCoin, recordBonusPayout, recordTestBonusCredit, referralSummary, repriceCashCoinRequest, requestBonusAmounts } from "../server/src/referrals.js";
import { cashCoinPreview } from "../webapp/src/lib/cashcoin.js";
import type { Store, StoredRequest } from "../server/src/store.js";

export function verifyCashCoin() {
  const passed: string[] = [];
  const now = new Date().toISOString();
  const day = new Date(now).toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  const fixture = () => ({
    users: { "1": { tg_id: 1 }, "2": { tg_id: 2, referred_by: 1 } }, contacts: [], requests: [], bonusLedger: [],
    ratesByDate: { [day]: { rates: { RUB: { buy_vnd: 280, sell_vnd: 300 }, USD: { buy_vnd: 25_000, sell_vnd: 26_000 }, USDT: { buy_vnd: 25_500, sell_vnd: 25_800 } }, cross: { "USD/RUB": { buy: 90, sell: 95 } } } },
  } as unknown as Store);
  const request = (id: string, user = 2) => ({ id, from: { id: user }, created_at: now, state: "in_progress", sellCurrency: "RUB", buyCurrency: "VND", sellAmount: 10_000, buyAmount: 2_810_000, receiveMethod: "transfer", payMethod: "transfer", status: "standard" } as StoredRequest);
  const quote = (s: Store, r: StoredRequest, coins = 0) => previewCashCoin(s, { ...r, tgId: r.from.id, redeemMinor: coins }, now);
  const create = (s: Store, r: StoredRequest, coins = 0) => { prepareReferralRequest(s, r, { redeemMinor: coins, quoteKey: quote(s, r, coins).key }); s.requests.push(r); return r; };
  const check = (name: string, fn: () => void) => { fn(); passed.push(name); };

  check("0.5% first gift is in the exchange, not credited twice to the wallet", () => {
    const s = fixture(), r = create(s, request("first"));
    assert.equal(r.sellAmount, 10_000); assert.equal(r.cashcoin?.welcomeSell, 50);
    assert.equal(r.cashcoin?.welcomeBuy, 14_050); assert.equal(r.buyAmount, 2_824_050);
    assert.equal(s.bonusLedger.length, 0);
    assert.throws(() => changeRequestState(s, r, "done", 9, false), /funds_received_required/);
    changeRequestState(s, r, "done", 9, true);
    assert.equal(balanceCents(s, 2), 0);
    assert.equal(balanceCents(s, 1), Math.round(2_824_050 * .005 / 300 * 100));
    assert.equal(s.bonusLedger.length, 1);
    assert.equal(changeRequestState(s, r, "done", 9, true), false);
    assert.throws(() => changeRequestState(s, r, "canceled", 9, false), /completed_locked/);
    assert.equal(create(s, request("second")).cashcoin?.welcomeSell, 0);
  });
  check("one active first gift; cancellation releases it and stale requests cannot reopen", () => {
    const s = fixture(), a = create(s, request("a"));
    assert.throws(() => create(s, request("b")), /first_pending/);
    changeRequestState(s, a, "canceled", 9, false);
    const b = create(s, request("b"));
    assert.throws(() => changeRequestState(s, a, "in_progress", 9, false), /first_pending/);
    changeRequestState(s, b, "done", 9, true);
    assert.throws(() => changeRequestState(s, a, "done", 9, true), /first_pending/);
  });
  check("wallet reservation prevents a second spend and manual payout", () => {
    const s = fixture();
    s.bonusLedger.push({ id: "test-credit", tg_id: 1, cents: 123000, currency: "CashCoin", kind: "referrer", created_at: now });
    const a = create(s, request("a", 1), 123000);
    assert.equal(a.cashcoin?.redeemBuy, 344400);
    assert.equal(a.buyAmount, 3154400);
    assert.equal(referralSummary(s, 1).availableCents, 0);
    assert.equal(balanceCents(s, 1), 123000);
    assert.throws(() => create(s, request("b", 1), 1), /insufficient_balance/);
    assert.throws(() => recordBonusPayout(s, { id: "cashcoin-payout-01", tgId: 1, cents: 1, note: "test" }, 9), /insufficient_balance/);
    changeRequestState(s, a, "canceled", 9, false);
    assert.equal(referralSummary(s, 1).availableCents, 123000);
    const b = create(s, request("b", 1), 123000);
    assert.throws(() => changeRequestState(s, a, "in_progress", 9, false), /insufficient_balance/);
    changeRequestState(s, b, "done", 9, true);
    changeRequestState(s, b, "done", 9, true);
    assert.equal(balanceCents(s, 1), 0);
    assert.equal(s.bonusLedger.filter(e => e.kind === "redemption").length, 1);
  });
  check("manual daily cross prices override VND bridge; RUB identity is exactly one", () => {
    const q = captureCoinQuote(fixture(), now);
    assert.equal(q.rates["USD>RUB"], 90);
    assert.equal(q.rates["RUB>USD"], 1 / 95);
    assert.equal(q.rates["RUB>RUB"], 1);
    assert.equal(q.rates["VND>RUB"], 1 / 300);
    assert.equal(q.rates["RUB>VND"], 280);
  });
  check("a stale quote is rejected before reservation, saved quote survives daily updates", () => {
    const s = fixture(), r = request("quote"), key = quote(s, r).key;
    s.ratesByDate[day].rates.RUB.sell_vnd = 350;
    assert.throws(() => prepareReferralRequest(s, r, { quoteKey: key }), /quote_changed/);
    assert.equal(s.requests.length, 0);
    create(s, r);
    s.ratesByDate[day].rates.RUB.sell_vnd = 999;
    changeRequestState(s, r, "done", 9, true);
    assert.equal(balanceCents(s, 1), Math.round(r.buyAmount * .005 / 350 * 100));
  });
  check("missing owner rates never fall back to Google or yesterday", () => {
    const s = fixture(); s.ratesByDate = {};
    assert.throws(() => quote(s, request("missing")), /rates_missing/);
    const q = quote(s, request("ordinary", 1));
    assert.equal(q.welcomeSell, 0);
  });
  check("legacy USD entries migrate once with preserved source amounts and rate", () => {
    const s = fixture();
    s.bonusLedger.push({ id: "old", tg_id: 1, cents: 500, kind: "referrer", created_at: now });
    migrateLegacyBonuses(s, now);
    assert.equal(balanceCents(s, 1), 45000);
    assert.equal(s.bonusLedger[0].legacyUsdCents, 500);
    assert.equal(s.bonusLedger[0].migrationRubPerUsd, 90);
    s.ratesByDate[day].cross!["USD/RUB"].buy = 100;
    migrateLegacyBonuses(s, now);
    assert.equal(balanceCents(s, 1), 45000);
  });
  check("staff edits recalculate the gift without adding it twice", () => {
    const s = fixture(), r = create(s, request("edit"));
    r.sellAmount = 20_000;
    repriceCashCoinRequest(s, r, 5_620_000);
    assert.equal(r.cashcoin?.welcomeSell, 100);
    assert.equal(r.buyAmount, 5_648_100);
    repriceCashCoinRequest(s, r, 5_620_000);
    assert.equal(r.buyAmount, 5_648_100);
  });
  check("legacy rounding preserves the converted net balance", () => {
    const s = fixture(); s.ratesByDate[day].cross!["USD/RUB"].buy = 90.51;
    for (const [i, cents] of [2, -1, -1].entries()) s.bonusLedger.push({ id: `legacy:${i}`, tg_id: 1, cents, kind: cents > 0 ? "referrer" : "payout", created_at: now });
    migrateLegacyBonuses(s, now);
    assert.equal(balanceCents(s, 1), 0);
  });
  check("test credits are idempotent and do not change referral eligibility", () => {
    const s = fixture(), input = { id: "test-credit-1000-coins", tgId: 2, cents: 100000, note: "User-approved test credit" };
    recordTestBonusCredit(s, input, 9); recordTestBonusCredit(s, input, 9);
    assert.equal(balanceCents(s, 2), 100000);
    assert.equal(s.bonusLedger.length, 1);
    assert.throws(() => recordTestBonusCredit(s, { ...input, cents: 200000 }, 9), /payout_conflict/);
    assert.equal(quote(s, request("first-after-credit")).welcomeSell, 50);
  });
  check("manager breakdown uses actual principal, gift and total", () => {
    const s = fixture(), r = create(s, request("message"));
    const amounts = requestBonusAmounts(r, (_cur, n) => String(n));
    assert.equal(amounts.sell, "10000 + 50 б = 10050");
    assert.equal(amounts.buy, "2810000 + 14050 б = 2824050");
  });
  check("frontend and server previews agree, including VND rounding and fractional coins", () => {
    for (const buyCurrency of ["RUB", "VND", "USD", "USDT"]) {
      const s = fixture();
      s.bonusLedger.push({ id: "credit", tg_id: 2, cents: 123045, currency: "CashCoin", kind: "referrer", created_at: now });
      const r = { ...request("preview"), buyCurrency, buyAmount: buyCurrency === "VND" ? 2810000 : 107.15 };
      const server = quote(s, r, 123045);
      const local = cashCoinPreview({ ...referralSummary(s, 2), walletQuote: captureCoinQuote(s, now), welcomeAvailable: true, link: null, history: [], referred: true, rewarded: false }, true, r.sellCurrency, buyCurrency, r.sellAmount, r.buyAmount);
      for (const key of ["welcomeSell", "welcomeBuy", "redeemMinor", "redeemBuy", "totalBuy"] as const) assert.equal(local[key], server[key], `${buyCurrency} ${key}`);
    }
  });
  check("negative, fractional and unsafe coin inputs are rejected", () => {
    const s = fixture(), r = request("bad", 1);
    for (const coins of [-1, .5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => quote(s, r, coins), /bad_payout/);
  });
  return passed;
}

test("CashCoin accounting invariants", verifyCashCoin);
