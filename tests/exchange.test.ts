import assert from "node:assert/strict";
import { test } from "node:test";
import { formatAmountInput, parseAmount } from "../webapp/src/domain/amountInput.ts";
import { DEFAULT_G_FORMULAS, EXCHANGE_RATE_PAIRS, calcFromGRate } from "../webapp/src/domain/exchange.ts";
import { MARKUP_DIRECTIONS, defaultBonuses, markupFor, resolveQuote, effectiveRate, convertForward, convertBackward, allowedPayMethods, allowedReceiveMethods } from "../webapp/src/domain/pricing.ts";
import { buildG } from "../server/src/marketRates.ts";
import { defaultGFormulas } from "../server/src/domain/exchange.ts";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EffectiveRatesTable } from "../webapp/src/admin/EffectiveRates.tsx";
import { parsePublishChatId, publishTextHtml } from "../server/src/publish.ts";
import { formatAmount } from "../server/src/format.ts";
import { apiGetTodayRates, apiAdminSetTodayRates } from "../webapp/src/lib/api.ts";

test("decimal input survives thousands grouping for every fractional currency", () => {
  for (const cur of ["RUB", "USDT", "USD", "EUR", "THB", "KZT"] as const) {
    for (const separator of [",", "."]) {
      let value = "";
      for (const char of `1000${separator}25`) {
        const raw = value + char;
        const formatted = formatAmountInput(cur, raw, value, { text: char, index: value.length });
        assert.equal(formatted.mapCaret(raw.length), formatted.text.length);
        value = formatted.text;
      }
      assert.equal(value, "1,000.25", cur);
      assert.equal(parseAmount(cur, value), 1000.25);
      assert.equal(formatAmount(cur, 1000.25), value);
    }
  }
});

test("saving rates invalidates cached reads, including an older in-flight request", async (t) => {
  let oldResponse: ((value: Response) => void) | undefined;
  let reads = 0;
  t.mock.method(globalThis, "fetch", async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") return Response.json({ ok: true });
    reads++;
    if (reads === 1) return new Promise<Response>(resolve => { oldResponse = resolve; });
    return Response.json({ ok: true, marker: "new" });
  });
  const oldRead = apiGetTodayRates();
  await apiAdminSetTodayRates("adminkey:test", {});
  assert.equal((await apiGetTodayRates() as any).marker, "new");
  oldResponse!(Response.json({ ok: true, marker: "old" }));
  await oldRead;
  assert.equal((await apiGetTodayRates() as any).marker, "new");
  assert.equal(reads, 2);
});

test("mobile replacement input, paste, deletion and decimal precision", () => {
  for (const [raw, previous, expected] of [
    ["2000,", "2,000", "2,000."],
    ["1,000,25", "1,000", "1,000.25"],
    ["1.000,25", null, "1,000.25"],
    ["1 000,25", null, "1,000.25"],
    ["1,00", "1,000", "100"],
    ["1,000,00", "1,000,000", "100,000"],
    ["1,000.257", "1,000.25", "1,000.25"],
  ] as const) assert.equal(formatAmountInput("RUB", raw, previous).text, expected, raw);
  assert.equal(formatAmountInput("VND", "1,000.25", null).text, "1,000");
});

test("manual rates and all status/method markups cover all 42 exchange directions", () => {
  assert.equal(EXCHANGE_RATE_PAIRS.length, 21);
  assert.equal(MARKUP_DIRECTIONS.length, 42);
  assert.deepEqual(DEFAULT_G_FORMULAS, defaultGFormulas());
  const rates = Object.fromEntries(EXCHANGE_RATE_PAIRS.filter(p => p.mode === "vnd").map(p => [p.base, { buy_vnd: 100, sell_vnd: 110 }]));
  const cross = Object.fromEntries(EXCHANGE_RATE_PAIRS.filter(p => p.mode === "g").map(p => [`${p.base}/${p.quote}`, { buy: 10, sell: 11 }]));
  const bonuses = defaultBonuses();
  for (const d of MARKUP_DIRECTIONS) {
    bonuses.pairs[d.key] = { tiers: [{ min: 0, standard: 0.1, silver: 0.2, gold: 0.3 }], methods: { cash: 0.01, transfer: 0.02, atm: 0.03 } };
    const quote = resolveQuote(d.from, d.to, { rates, cross, formulas: DEFAULT_G_FORMULAS, market: null });
    assert.ok(quote, d.key);
    for (const [status, tier] of [["standard", 0.1], ["silver", 0.2], ["gold", 0.3]] as const) {
      assert.deepEqual(markupFor(d.from, d.to, 1000, status, "transfer", bonuses), { tier, method: 0.02 }, `${d.key} ${status}`);
      for (const sign of [-1, 1]) {
        const rate = effectiveRate(quote, { tier: tier * sign, method: 0.02 * sign });
        assert.ok(Math.abs(rate - (quote.rate + sign * (tier + 0.02))) < 1e-10, d.key);
        assert.ok(Math.abs(convertBackward(quote.side, rate, convertForward(quote.side, rate, 1000)) - 1000) < 1e-8);
      }
    }
  }
});

test("negative RUB to USDT modifier lowers both the quote and rendered preview", () => {
  const ctx = { rates: null, cross: { "USDT/RUB": { buy: 90, sell: 93.3 } }, market: null, formulas: DEFAULT_G_FORMULAS };
  const bonuses = defaultBonuses();
  bonuses.pairs["RUB>USDT"] = { tiers: [{ min: 0, standard: -0.5, silver: -0.5, gold: -1 }], methods: { cash: 0, transfer: 0, atm: 0 } };
  const quote = resolveQuote("RUB", "USDT", ctx)!;
  assert.equal(effectiveRate(quote, markupFor("RUB", "USDT", 100, "silver", "transfer", bonuses)), 92.8);
  assert.equal(convertForward(quote.side, 92.8, 9280), 100);
  const html = renderToStaticMarkup(React.createElement(EffectiveRatesTable, { from: "RUB", to: "USDT", bonuses, ctx }));
  assert.match(html, /92,8/);
  assert.match(html, /−0,5/);
  assert.doesNotMatch(html, /93,8/);
  assert.ok(Number.isNaN(effectiveRate(quote, { tier: -100, method: 0 })));
});

test("KZT supports transfer only and precise automatic and manual cross rates", () => {
  assert.deepEqual(allowedPayMethods("KZT", "VND"), ["transfer"]);
  assert.deepEqual(allowedReceiveMethods("KZT"), ["transfer"]);
  const g = buildG({ RUB: 90, THB: 35, EUR: 0.9, KZT: 500 });
  assert.equal(g["KZT/RUB"], 0.18);
  assert.equal(g["USD/KZT"], 500);
  assert.equal(g["USDT/KZT"], 500);
  assert.ok(Math.abs(g["EUR/KZT"] - 500 / 0.9) < 1e-10);
  assert.ok(Math.abs(g["THB/KZT"] - 500 / 35) < 1e-10);
  const market = { ok: true as const, stale: false, source: "test", updated_at: "2026-09-24", g };
  assert.deepEqual(calcFromGRate(market, DEFAULT_G_FORMULAS, "KZT", "RUB"), { buy: 0.18, sell: 0.18 });
  const manual = { "KZT/RUB": { buy: 0.175, sell: 0.185 } };
  assert.deepEqual(calcFromGRate(market, DEFAULT_G_FORMULAS, "KZT", "RUB", manual), manual["KZT/RUB"]);
  const withoutKzt = buildG({ RUB: 90, THB: 35, EUR: 0.9 });
  assert.equal(withoutKzt["USD/RUB"], 90);
  assert.equal(withoutKzt["USD/KZT"], undefined);
});

test("publication accepts public channels and numeric IDs, escapes links once", () => {
  assert.equal(parsePublishChatId("@exchange_channel"), "@exchange_channel");
  assert.equal(parsePublishChatId("https://t.me/exchange_channel"), "@exchange_channel");
  assert.equal(parsePublishChatId("-1001234567890"), -1001234567890);
  for (const invalid of ["", "0", "NaN", "https://evil.test/channel", "@x", "1.5"]) assert.equal(parsePublishChatId(invalid), null);
  assert.equal(publishTextHtml('Курс < 2 & [ссылка](https://example.com/?a=1&b=2)'), 'Курс &lt; 2 &amp; <a href="https://example.com/?a=1&amp;b=2">ссылка</a>');
});
