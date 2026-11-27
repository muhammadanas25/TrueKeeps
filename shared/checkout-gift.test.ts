/**
 * Checks for the checkout's gift option, second number and city list
 * (docs/adr/025).
 *
 * What: fails if the city list loses a big three city or its province, if a
 * city appears twice in the A–Z list, if the optional second number rejects
 * an empty value or accepts junk, or if an order body with a gift doesn't
 * keep the buyer apart from the recipient.
 *
 * Run: npx tsx shared/checkout-gift.test.ts
 * (No test runner in this repo; this exits non-zero on any failure.)
 */

import { PK_CITIES, TOP_CITIES, provinceOf } from "./cities";
import { createOrderSchema, shippingAddressSchema } from "./orders";
import { isKarachi } from "./pricing";

let failures = 0;
function check(ok: boolean, what: string) {
  if (!ok) {
    failures++;
    console.error("FAIL", what);
  }
}

// city list
for (const c of TOP_CITIES) check(PK_CITIES.some((x) => x.name === c), `${c} is also in the A–Z list`);
check(provinceOf("Karachi") === "Sindh", "Karachi is in Sindh");
check(provinceOf(" lahore ") === "Punjab", "case and spaces don't matter");
check(provinceOf("Islamabad") === "Islamabad Capital Territory", "Islamabad's province");
check(provinceOf("Kharian") === "Punjab", "a smaller town is listed");
check(provinceOf("Nowhere Town") === null, "an unlisted town has no province");
const names = PK_CITIES.map((c) => c.name.toLowerCase());
check(new Set(names).size === names.length, "no city is listed twice");
check(names.join() === [...names].sort((a, b) => a.localeCompare(b)).join(), "the list is A to Z");
check(PK_CITIES.length >= 80, `around 80 cities and towns (${PK_CITIES.length})`);
check(isKarachi({ city: "Karachi" }), "the listed Karachi still delivers free");

// second number
const base = { fullName: "Ayesha Khan", phone: "0321 7654321", line1: "Flat 3B, Clifton Block 5", city: "Karachi", province: "Sindh" };
check(shippingAddressSchema.safeParse(base).success, "no second number is fine");
check(shippingAddressSchema.safeParse({ ...base, altPhone: "" }).success, "an empty second number is fine");
const alt = shippingAddressSchema.safeParse({ ...base, altPhone: "021 3456 7890" });
check(alt.success && alt.data.altPhone === "02134567890", "a landline is accepted and tidied");
check(!shippingAddressSchema.safeParse({ ...base, altPhone: "call me" }).success, "junk is refused");

// gift order body
const shape = createOrderSchema.shape;
check(shape.gift.safeParse(undefined).success, "gift is optional");
const g = shape.gift.safeParse({ name: "Sara Ahmed", phone: "0300-1234567" });
check(g.success && g.data?.phone === "03001234567", "the buyer's mobile is tidied");
check(!shape.gift.safeParse({ name: "Sara Ahmed", phone: "12345" }).success, "the buyer needs a Pakistani mobile");

if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("checkout gift: all checks passed");
