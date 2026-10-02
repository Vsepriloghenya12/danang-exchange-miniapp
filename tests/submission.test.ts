import assert from "node:assert/strict";
import { test } from "node:test";
import { createSubmissionGate } from "../webapp/src/lib/submissionGate.js";
import { referralApi, ReferralApiError } from "../webapp/src/lib/referrals.js";

test("one submission runs while repeated presses are ignored; another can run after completion", async () => {
  const submit = createSubmissionGate();
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  let requests = 0;
  const first = submit(async () => { requests++; await waiting; });
  await Promise.all([submit(async () => { requests++; }), submit(async () => { requests++; })]);
  assert.equal(requests, 1);
  release(); await first;
  await submit(async () => { requests++; });
  assert.equal(requests, 2);
});

test("a failed submission releases the guard for retry", async () => {
  const submit = createSubmissionGate();
  await assert.rejects(submit(async () => { throw new Error("offline"); }), /offline/);
  let retried = false;
  await submit(async () => { retried = true; });
  assert.equal(retried, true);
});

test("a reserved first bonus is a business response with the accepted request number", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ ok: false, error: "referral_first_pending", requestId: "accepted-64b035" }, { status: 400 }));
  await assert.rejects(referralApi("signed-test", "/referrals/quote", {}), error => {
    assert.ok(error instanceof ReferralApiError);
    assert.equal(error.code, "referral_first_pending");
    assert.equal(error.requestId, "accepted-64b035");
    assert.match(error.message, /#64b035 уже в работе/);
    assert.doesNotMatch(error.message, /Ошибка сети/);
    return true;
  });
});
