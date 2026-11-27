/**
 * Unit checks for the affiliate rules (shared/affiliates.ts, docs/adr/022).
 * Run: npx tsx shared/affiliates.test.ts   (exits 1 on the first failure)
 *
 * Covers what is easy to get subtly wrong: commission rounding and the
 * promo/shipping base, month boundaries in Pakistan time (a tap at 23:30 on
 * the 30th belongs to that month, not the next), the payout due date, the
 * 30-day window, the cookie format, self-referral matching, and the state of
 * a line as it moves from waiting to paid or reversed.
 */

import assert from "node:assert/strict";
import {
  commissionFor,
  commissionState,
  isSelfReferral,
  parseRefCookie,
  payableAfterDelivery,
  payoutDue,
  periodEnd,
  periodOf,
  refCookieValue,
  withinWindow,
  affiliateInputSchema,
} from "./affiliates";

const pct = { commissionKind: "percent", commissionValue: 10 };
const fixed = { commissionKind: "fixed", commissionValue: 50000 };

// commission: 10% of Rs 7,340 = Rs 734; rounds to whole rupees; fixed ignores the base
assert.equal(commissionFor(pct, 734000), 73400);
assert.equal(commissionFor(pct, 734050), 73400);
assert.equal(commissionFor({ commissionKind: "percent", commissionValue: 12 }, 569000), 68300); // 682.8 → 683
assert.equal(commissionFor(fixed, 100), 50000);
assert.equal(commissionFor(pct, -500), 0);

// months in Pakistan time (UTC+5)
assert.equal(periodOf(new Date("2026-11-30T18:30:00Z")), "2026-11"); // 23:30 PKT on 30 Nov
assert.equal(periodOf(new Date("2026-11-30T19:00:00Z")), "2026-12"); // 00:00 PKT on 1 Dec
assert.equal(periodEnd("2026-11").toISOString(), "2026-11-30T19:00:00.000Z");
assert.equal(periodEnd("2026-12").toISOString(), "2026-12-31T19:00:00.000Z"); // year roll
assert.equal(payoutDue("2026-11").toISOString(), "2026-12-04T19:00:00.000Z"); // 5 Dec 00:00 PKT
assert.equal(payableAfterDelivery(new Date("2026-11-23T10:00:00Z")).toISOString(), "2026-11-30T10:00:00.000Z");

// the window: 30 days, and a tap "from the future" is refused
const now = new Date("2026-11-26T12:00:00Z");
assert.ok(withinWindow(new Date("2026-10-28T12:00:00Z"), now));
assert.ok(!withinWindow(new Date("2026-10-27T11:59:00Z"), now));
assert.ok(!withinWindow(new Date("2026-11-27T12:00:00Z"), now));

// the cookie round-trips and rejects junk
const c = refCookieValue("mahnoor", now);
assert.deepEqual(parseRefCookie(c), { code: "mahnoor", at: new Date(Math.floor(now.getTime() / 1000) * 1000) });
assert.equal(parseRefCookie("MAHNOOR.123"), null);
assert.equal(parseRefCookie("a.1795699358; drop"), null);
assert.equal(parseRefCookie(undefined), null);

// self-referral: same account, same email (any case), or their wallet is the order phone
const aff = { userId: "u1", email: "Mahnoor@Example.com", payoutMethod: "jazzcash", payoutAccount: "0300 1234567" };
assert.ok(isSelfReferral(aff, { userId: "u1", email: "x@y.z", phone: null }));
assert.ok(isSelfReferral(aff, { userId: "u2", email: "mahnoor@example.com", phone: null }));
assert.ok(isSelfReferral(aff, { userId: "u2", email: "x@y.z", phone: "+923001234567" }));
assert.ok(!isSelfReferral(aff, { userId: "u2", email: "x@y.z", phone: "03001234568" }));
assert.ok(!isSelfReferral({ ...aff, payoutMethod: "bank", payoutAccount: "03001234567" }, { userId: "u2", email: "x@y.z", phone: "03001234567" }));

// line states
const base = { kind: "earn", reversedAt: null, payableAt: null, payoutId: null };
assert.equal(commissionState(base, now), "waiting");
assert.equal(commissionState({ ...base, payableAt: new Date("2026-11-30T00:00:00Z") }, now), "hold");
assert.equal(commissionState({ ...base, payableAt: new Date("2026-11-20T00:00:00Z") }, now), "approved");
assert.equal(commissionState({ ...base, payableAt: new Date("2026-11-20T00:00:00Z"), payoutId: "p" }, now), "paid");
assert.equal(commissionState({ ...base, reversedAt: new Date() }, now), "reversed");
assert.equal(commissionState({ ...base, kind: "clawback", payableAt: now }, now), "taken_back");

// admin input: link names normalise; a percentage over 50 is refused
const ok = affiliateInputSchema.parse({ name: "Mahnoor", email: "M@X.COM", code: " Mahnoor ", commissionKind: "percent", commissionValue: 10, payoutMethod: "jazzcash" });
assert.equal(ok.code, "mahnoor");
assert.equal(ok.email, "m@x.com");
assert.ok(!affiliateInputSchema.safeParse({ ...ok, commissionValue: 60 }).success);
assert.ok(!affiliateInputSchema.safeParse({ ...ok, code: "a b" }).success);

console.log("affiliates: all checks passed");
