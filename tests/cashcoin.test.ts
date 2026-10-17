import assert from "node:assert/strict";
import { test } from "node:test";
import { balanceCents, captureCoinQuote, changeRequestState, migrateLegacyBonuses, prepareReferralRequest, previewCashCoin, recordBonusCredit, recordBonusPayout, recordTestBonusCredit, referralSummary, repriceCashCoinRequest, requestBonusAmounts } from "../server/src/referrals.js";
import { cashCoinPreview } from "../webapp/src/lib/cashcoin.js";
import { cashDeliveryFee, grossForNetDelivery } from "../server/src/domain/delivery.js";
import { matchesBonusAccount } from "../webapp/src/lib/referrals.js";
import type { Store, StoredRequest } from "../server/src/store.js";
import { loyaltyVolume, promoteLoyaltyStatus } from '../server/src/loyalty.js';

test('loyalty counts completed deals once at historical rates, skips unknown values and never downgrades', () => {
  const request = (id:string, extra:any={}) => ({id,from:{id:1},state:'done',sellCurrency:'RUB',buyCurrency:'VND',sellAmount:1,buyAmount:99999999,created_at:'2026-10-01T18:00:00Z',...extra});
  const s = {users:{'1':{tg_id:1,status:'standard'}},contacts:[],requests:[request('one')],ratesByDate:{'2026-10-02':{rates:{USD:{buy_vnd:25000,sell_vnd:26000}}}}} as unknown as Store;
  const now = new Date().toISOString();
  assert.equal(promoteLoyaltyStatus(s,1,now),null);
  s.requests.push(request('two',{buyAmount:1}) as any);
  assert.equal(promoteLoyaltyStatus(s,1,now)?.next,'silver');
  assert.equal(promoteLoyaltyStatus(s,1,now),null);
  s.requests.push(request('pending',{state:'in_progress',buyAmount:999999999}) as any,request('canceled',{state:'canceled',buyAmount:999999999}) as any,request('other',{from:{id:2},buyAmount:999999999}) as any);
  assert.equal(loyaltyVolume(s,1).total,100000000);
  s.requests.push(request('historical',{sellCurrency:'EUR',buyCurrency:'USD',buyAmount:100}) as any);
  assert.equal(loyaltyVolume(s,1).total,102500000);
  s.requests.push(request('saved',{buyCurrency:'USD',buyAmount:100,cashcoin:{quote:{rates:{'USD>VND':20000}}}}) as any);
  assert.equal(loyaltyVolume(s,1).total,104500000);
  s.requests.push(request('unknown',{sellCurrency:'EUR',buyCurrency:'THB'}) as any);
  assert.equal(loyaltyVolume(s,1).partial,true);
  s.users['1'].status='gold';
  assert.equal(promoteLoyaltyStatus(s,1,now),null);
  s.users['1'].status='standard'; s.requests=[request('jump',{buyAmount:300000000}) as any];
  assert.equal(promoteLoyaltyStatus(s,1,now)?.next,'gold');
});

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
  check("missing daily rates defer USD migration without blocking CashCoin credits", () => {
    const s = fixture(), rates = s.ratesByDate; s.ratesByDate = {};
    s.bonusLedger.push({ id: "old-usd", tg_id: 1, cents: 108, kind: "referrer", created_at: now });
    migrateLegacyBonuses(s, now);
    recordTestBonusCredit(s, { id: "midnight-test-credit", tgId: 1, cents: 100000, note: "Approved test credit" }, 9);
    assert.equal(referralSummary(s, 1).legacyUsdCents, 108);
    assert.equal(balanceCents(s, 1), 100000);
    assert.equal(s.bonusLedger[0].currency, undefined);
    s.ratesByDate = rates; migrateLegacyBonuses(s, now);
    assert.equal(balanceCents(s, 1), 109720);
    assert.equal(referralSummary(s, 1).legacyUsdCents, 0);
    migrateLegacyBonuses(s, now);
    assert.equal(balanceCents(s, 1), 109720);
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
  check("owner credits are audited, idempotent, spendable and preserve first exchange eligibility", () => {
    const s = fixture(), input = { id: "owner-credit-1000-bonus", tgId: 2, cents: 100000, note: "Подарок клиенту" };
    const entry = recordBonusCredit(s, input, 9);
    assert.equal(entry.kind, "manual_credit"); assert.equal(entry.by, 9); assert.equal(entry.note, input.note);
    assert.equal(recordBonusCredit(s, input, 9), entry);
    assert.equal(s.bonusLedger.length, 1);
    assert.equal(referralSummary(s, 2).availableCents, 100000);
    assert.throws(() => recordBonusCredit(s, { ...input, cents: 200000 }, 9), /payout_conflict/);
    assert.throws(() => recordBonusCredit(s, { ...input, tgId: 1 }, 9), /payout_conflict/);
    assert.throws(() => recordBonusCredit(s, { ...input, note: "Other reason" }, 9), /payout_conflict/);
    const r = create(s, request("manual-credit-redemption"), 100000);
    assert.equal(r.cashcoin?.welcomeSell, 50);
    assert.equal(r.cashcoin?.redeemBuy, 280000);
    assert.equal(referralSummary(s, 2).availableCents, 0);
    assert.throws(() => recordBonusPayout(s, { ...input, id: "cannot-spend-reserved" }, 9), /insufficient_balance/);
    changeRequestState(s, r, "canceled", 9, false);
    recordBonusPayout(s, { ...input, id: "owner-payout-1000-bonus" }, 9);
    assert.equal(balanceCents(s, 2), 0);
  });
  check("owner credit validation rejects invalid amounts and missing clients without a ledger entry", () => {
    const s = fixture(), input = { id: "owner-credit-validation", tgId: 2, cents: 1, note: "Reason" };
    for (const cents of [0, -1, .5, NaN, Infinity, 100_000_001, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => recordBonusCredit(s, { ...input, cents }, 9), /bad_credit/);
    }
    for (const bad of [{ tgId: 404 }, { note: " " }, { note: "x".repeat(301) }, { id: "short" }]) {
      assert.throws(() => recordBonusCredit(s, { ...input, ...bad }, 9), /bad_credit/);
    }
    assert.equal(s.bonusLedger.length, 0);
    s.ratesByDate = {};
    recordBonusCredit(s, input, 9);
    assert.equal(balanceCents(s, 2), 1, "A bonus credit needs no exchange rate");
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

test('delivery is deducted once after bonuses, saved in requests and described to managers', () => {
  const now = new Date().toISOString(), day = new Date(now).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  const s = { users: { '1': { tg_id: 1 }, '2': { tg_id: 2, referred_by: 1 } }, contacts: [], requests: [], bonusLedger: [], ratesByDate: { [day]: { rates: { RUB: { buy_vnd: 280, sell_vnd: 300 }, USD: { buy_vnd: 25000, sell_vnd: 26000 } } } } } as unknown as Store;
  const r = { id: 'delivery', from: { id: 2 }, created_at: now, state: 'in_progress', status: 'standard', sellCurrency: 'RUB', buyCurrency: 'VND', sellAmount: 10000, buyAmount: 2800000, payMethod: 'transfer', receiveMethod: 'cash' } as StoredRequest;
  const input = { ...r, tgId: 2 };
  const q = previewCashCoin(s, input, now);
  assert.equal(q.deliveryFee,70000); assert.equal(q.welcomeBuy,14000); assert.equal(q.totalBuy,2744000);
  const local = cashCoinPreview({ welcomeAvailable: true } as any,false,'RUB','VND',10000,2800000);
  assert.equal(local.totalBuy - cashDeliveryFee(input,1).fee,q.totalBuy);
  assert.throws(()=>prepareReferralRequest(s,r,{quoteKey:'stale'}),/quote_changed/);
  prepareReferralRequest(s,r,{quoteKey:q.key}); s.requests.push(r);
  assert.equal(r.buyAmount,q.totalBuy); assert.match(requestBonusAmounts(r,(_,n)=>String(n)).buy,/70000 доставка/);
  repriceCashCoinRequest(s,r,2800000); assert.equal(r.buyAmount,q.totalBuy);
  const historical = { ...r, cashcoin: { ...r.cashcoin! } }; delete historical.cashcoin.deliveryFee; delete historical.cashcoin.deliveryFeeVnd;
  repriceCashCoinRequest(s,historical,2800000); repriceCashCoinRequest(s,historical,2800000); assert.equal(historical.buyAmount,2814000);
  assert.equal(previewCashCoin(s,{...input,id:r.id,status:'gold'},now).deliveryFee,0);
  assert.equal(previewCashCoin(s,{...input,id:r.id,receiveMethod:'transfer'},now).deliveryFee,0);
  assert.equal(previewCashCoin(s,{...input,id:r.id,sellAmount:20000,buyAmount:5600000},now).deliveryFee,0);
  assert.equal(previewCashCoin(s,{...input,id:r.id,buyCurrency:'USD',buyAmount:100},now).deliveryFee,2.69);
  assert.throws(()=>previewCashCoin(s,{...input,tgId:1,id:r.id,buyCurrency:'EUR',buyAmount:100},now),/delivery_rates_missing/);
  assert.throws(()=>previewCashCoin(s,{...input,id:r.id,buyAmount:50000},now),/delivery_exceeds_amount/);
  changeRequestState(s,r,'done',9,true);
  assert.equal(balanceCents(s,1),Math.round(q.totalBuy * .005 / 300 * 100));
});

test('reverse delivery calculation handles free-delivery boundary and transfer/ATM without fees', () => {
  const input = { sellCurrency:'RUB', buyCurrency:'VND', sellAmount:10000, buyAmount:2800000, payMethod:'transfer', receiveMethod:'cash', status:'standard' };
  const fee = (gross: number) => cashDeliveryFee({...input,sellAmount:gross/280,buyAmount:gross},1).fee;
  assert.equal(Math.round(grossForNetDelivery(2730000,0,0,fee)),2800000);
  assert.equal(Math.round(grossForNetDelivery(2744000,.005,0,fee)),2800000);
  assert.equal(Math.round(grossForNetDelivery(3010000,0,280000,fee)),2800000);
  const boundary = grossForNetDelivery(5570000,0,0,fee);
  assert.ok(boundary - fee(boundary) >= 5570000); assert.ok(Math.abs(boundary-5600000)<1);
  for (const receiveMethod of ['transfer','atm']) assert.equal(cashDeliveryFee({...input,receiveMethod},1).fee,0);
  assert.equal(cashDeliveryFee({...input,sellAmount:0,buyAmount:0},1).fee,0);
});

test('bonus account search matches nickname, Telegram name, owner name and ID', () => {
  const account = { name:'@cash_friend',fullName:'Артём Иванов',adminName:'Алексей курьер',tgId:12345 } as any;
  for (const q of ['@CASH','артем','ИВАНОВ артём','курьер','12345','']) assert.equal(matchesBonusAccount(account,q),true,q);
  assert.equal(matchesBonusAccount(account,'Мария'),false);
});

test('THB and KZT delivery thresholds include the exact free boundary in both directions', () => {
  for (const [currency, threshold] of [['THB',8000],['KZT',100000]] as const) {
    for (const amount of [threshold-1,threshold,threshold+1,threshold*10]) {
      const expected = amount < threshold ? 70000 : 0;
      const input = { sellCurrency:currency,buyCurrency:'VND',sellAmount:amount,buyAmount:5000000,payMethod:'transfer',receiveMethod:'cash',status:'standard' };
      assert.equal(cashDeliveryFee(input,1).feeVnd,expected,`${currency} ${amount}`);
      assert.equal(cashDeliveryFee({...input,sellCurrency:'VND',buyCurrency:currency,sellAmount:5000000,buyAmount:amount,payMethod:'cash',receiveMethod:'transfer'},.01).feeVnd,expected);
      assert.equal(cashDeliveryFee({...input,status:'gold'},1).fee,0);
      assert.equal(cashDeliveryFee({...input,receiveMethod:'transfer'},1).fee,0);
      const now = new Date().toISOString(), day = new Date(now).toLocaleDateString('en-CA',{timeZone:'Asia/Ho_Chi_Minh'});
      const store = {users:{'1':{tg_id:1}},contacts:[],requests:[],bonusLedger:[],ratesByDate:{[day]:{rates:{[currency]:{buy_vnd:50,sell_vnd:55}}}}} as unknown as Store;
      const quote = previewCashCoin(store,{...input,tgId:1},now);
      assert.equal(quote.deliveryFeeVnd,expected);
      assert.equal(quote.totalBuy,5000000-expected);
    }
  }
});
