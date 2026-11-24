/**
 * Checks for the book font pairs (shared/fonts.ts, server/print/fonts.ts).
 *
 *   - every pair has a heading and body face with a Fontshare slug, and the
 *     ids a saved book may carry include the four older typefaces
 *   - each occasion starts on the owner's pair; anything else is Warm Classic
 *   - the .ttf for the requested family and weight is picked out of a
 *     Fontshare stylesheet that also lists other families and weights
 *   - a book in an older typeface prints in the standard fonts, unchanged
 *
 * Offline: no font is downloaded here (scratchpad print tests cover that).
 *
 * Run:
 *   npx tsx server/print/fonts.test.ts
 */

import assert from "node:assert/strict";
import PDFDocument from "pdfkit";
import { BOOK_FONT_IDS, FONT_PAIRS, pairForOccasion } from "@shared/fonts";
import { printFonts, ttfUrlFromCss } from "./fonts";

assert.equal(FONT_PAIRS.length, 8);
for (const p of FONT_PAIRS) {
  for (const f of [p.head, p.body]) assert.ok(f.family && /^[a-z-]+$/.test(f.slug) && f.weight >= 100, `${p.id} face`);
}
for (const id of ["classic", "editorial", "modern", "script", "warm", "timeless"]) assert.ok(BOOK_FONT_IDS.includes(id as never), id);

assert.equal(pairForOccasion("wedding"), "elegant");
assert.equal(pairForOccasion("baby"), "soft");
assert.equal(pairForOccasion("birthday"), "playful");
assert.equal(pairForOccasion("travel"), "adventure");
assert.equal(pairForOccasion("mix"), "warm");
assert.equal(pairForOccasion(null), "warm");
assert.equal(pairForOccasion("something-new"), "warm");

const css = `/* Zodiak */
@font-face {
  font-family: 'Zodiak';
  src: url('//cdn.fontshare.com/wf/A/B/regular.woff2') format('woff2'), url('//cdn.fontshare.com/wf/A/B/regular.ttf') format('truetype');
  font-weight: 400; font-display: swap; font-style: normal;
}
@font-face {
  font-family: 'Zodiak';
  src: url('//cdn.fontshare.com/wf/C/D/bold-italic.ttf') format('truetype');
  font-weight: 700; font-display: swap; font-style: italic;
}
@font-face {
  font-family: 'Zodiak';
  src: url('//cdn.fontshare.com/wf/E/F/bold.woff2') format('woff2'), url('//cdn.fontshare.com/wf/E/F/bold.ttf') format('truetype');
  font-weight: 700; font-display: swap; font-style: normal;
}
@font-face {
  font-family: 'Plein';
  src: url('//cdn.fontshare.com/wf/G/H/plein.ttf') format('truetype');
  font-weight: 700; font-style: normal;
}`;
const zodiak = (weight: number) => ({ family: "Zodiak", slug: "zodiak", weight, fallback: "serif" });
assert.equal(ttfUrlFromCss(css, zodiak(700)), "https://cdn.fontshare.com/wf/E/F/bold.ttf");
assert.equal(ttfUrlFromCss(css, zodiak(400)), "https://cdn.fontshare.com/wf/A/B/regular.ttf");
assert.equal(ttfUrlFromCss(css, zodiak(500)), null);
assert.equal(ttfUrlFromCss(css, { family: "Plein", slug: "plein", weight: 400, fallback: "" }), null);

const pdf = new PDFDocument({ autoFirstPage: false });
assert.deepEqual(await printFonts(pdf, "modern"), { head: "Helvetica-Bold", body: "Helvetica", label: "Helvetica" });
assert.deepEqual(await printFonts(pdf, "classic"), { head: "Times-Bold", body: "Times-Roman", label: "Helvetica" });
assert.deepEqual(await printFonts(pdf, undefined), { head: "Times-Bold", body: "Times-Roman", label: "Helvetica" });

console.log("fonts: all checks passed");
