/**
 * Checks for delivery and price (shared/pricing.ts, owner 2026-11-26).
 *
 *   - Karachi is free, whatever the spelling or area ("Karachi East", "karachi")
 *   - everywhere else is Rs 200 flat, remote provinces included
 *   - no city yet: delivery isn't known, nothing is added to the total
 *   - an album is Rs 6,490 and always hardcover, even for an older draft's binding
 *
 * Run:
 *   npx tsx shared/pricing.test.ts
 */

import assert from "node:assert/strict";
import { DELIVERY_RULE, PRICE_LIST, deliveryFor, isKarachi, quote } from "./pricing";

const at = (city: string, province = "Punjab", binding = "hardcover") => quote({ binding, qty: 1, printedPages: 10, address: { city, province } });

assert.equal(isKarachi({ city: "Karachi" }), true);
assert.equal(isKarachi({ city: "karachi east" }), true);
assert.equal(isKarachi({ city: "Karachiwala" }), false);

assert.equal(at("Karachi", "Sindh").shippingMinor, 0);
assert.equal(at("Karachi", "Sindh").freeShipping, true);
for (const [city, province] of [["Lahore", "Punjab"], ["Hyderabad", "Sindh"], ["Quetta", "Balochistan"], ["Gwadar", "Balochistan"], ["Gilgit", "Gilgit-Baltistan"], ["Muzaffarabad", "Azad Jammu and Kashmir"]]) {
  assert.equal(at(city, province).shippingMinor, 200_00, city);
}
assert.equal(deliveryFor({ city: "Islamabad", province: "Islamabad Capital Territory" }), 200_00);

const noCity = quote({ binding: "hardcover", qty: 1, printedPages: 10, address: { city: "", province: "Gilgit-Baltistan" } });
assert.equal(noCity.deliveryKnown, false);
assert.equal(noCity.shippingMinor, 0);
assert.equal(noCity.freeShipping, false);
assert.equal(noCity.totalMinor, 6_490_00);
assert.equal(quote({ binding: "hardcover", qty: 1, printedPages: 10 }).deliveryKnown, false);

const lahore = at("Lahore");
assert.equal(PRICE_LIST.bookMinor, 6_490_00);
assert.equal(lahore.unitMinor, 6_490_00);
assert.equal(lahore.totalMinor, 6_690_00);
assert.equal(at("Lahore", "Punjab", "softcover").binding, "hardcover");
assert.equal(at("Lahore", "Punjab", "layflat").binding, "hardcover");
assert.equal(DELIVERY_RULE, "Delivery is free in Karachi. Everywhere else in Pakistan it's Rs 200.");

console.log("pricing: all checks passed");
