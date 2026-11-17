/**
 * Checks for the layout engine (arrange.ts).
 *
 * What: lays out four kinds of photo sets (mixed phone, mostly portrait,
 * mostly landscape, small files) at several photo counts, in all three
 * arrangements and several book sizes, and fails if any promise breaks:
 *   - a slot off the page or overlapping another slot
 *   - a photo trimmed past CROP_CAP (except a full-bleed page)
 *   - a photo printed below DPI_MIN
 *   - a photo used twice, dropped, or moved out of reading order
 *   - a book with the wrong number of pages for the sheets asked
 *   - a grid page whose rectangles don't match its slots
 * It also re-lays single pages the way the editors do.
 *
 * Run: npx tsx client/src/features/builder/arrange.test.ts
 * (No test runner in this repo; this exits non-zero on any failure.)
 */

import { ARRANGEMENTS, CROP_CAP, DPI_MIN, MAX_SHEETS, PAGE, arrangeBook, plan, relayoutPage, sheetRange, sheetsToFit, type ArrangementId } from "./arrange";
import type { BuilderPhoto } from "./data";

let fails = 0;
const bad = (m: string) => {
  fails++;
  console.log("FAIL", m);
};
const EPS = 1e-6;

/* Deterministic stand-in photo sets: [width px, height px, weight]. */
const MIX: Record<string, { seed: number; shapes: number[][] }> = {
  phone: { seed: 11, shapes: [[3024, 4032, 38], [4032, 3024, 30], [4032, 2268, 9], [2268, 4032, 6], [3024, 3024, 5], [1600, 1200, 6], [1200, 1600, 6]] },
  portrait: { seed: 23, shapes: [[3024, 4032, 62], [2268, 4032, 14], [4032, 3024, 14], [3024, 3024, 4], [1200, 1600, 6]] },
  landscape: { seed: 37, shapes: [[6000, 4000, 58], [4032, 3024, 18], [4000, 6000, 14], [5472, 3078, 6], [3024, 3024, 4]] },
  small: { seed: 41, shapes: [[1600, 1200, 26], [1280, 960, 16], [1200, 1600, 22], [960, 1280, 14], [1280, 720, 10], [800, 600, 6], [1080, 1080, 6]] },
};
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function samplePhotos(kind: string, n: number): BuilderPhoto[] {
  const mix = MIX[kind];
  const r = rng(mix.seed);
  const total = mix.shapes.reduce((a, s) => a + s[2], 0);
  const out: BuilderPhoto[] = [];
  let prev: number[] | null = null;
  for (let i = 0; i < n; i++) {
    let shape = prev;
    if (!prev || r() > 0.4) {
      let roll = r() * total;
      for (const s of mix.shapes) {
        roll -= s[2];
        if (roll <= 0) {
          shape = s;
          break;
        }
      }
    }
    prev = shape;
    out.push({ id: "ph" + (i + 1), label: "photo " + (i + 1), shade: 0, w: shape![0], h: shape![1] });
    r(); // the design prototype draws a tint here; kept so both produce the same sets
  }
  if (kind === "phone" && n >= 20) out[Math.floor(n * 0.6)] = { id: "ph" + (Math.floor(n * 0.6) + 1), label: "pano", shade: 0, w: 8000, h: 3600 };
  return out;
}

function checkPlan(photos: BuilderPhoto[], pages: number, style: ArrangementId, label: string) {
  const res = plan(photos, pages, style);
  const seen = new Set<string>();
  const order: number[] = [];
  const index = new Map(photos.map((p, i) => [p.id, i]));
  res.pages.forEach((pg, pi) => {
    pg.slots.forEach((s, si) => {
      if (seen.has(s.photo.id)) bad(`${label} photo twice ${s.photo.id}`);
      seen.add(s.photo.id);
      if (s.x < -EPS || s.y < -EPS || s.x + s.w > PAGE + EPS || s.y + s.h > PAGE + EPS) bad(`${label} off page p${pi} s${si}`);
      if (!s.unknown && s.crop > CROP_CAP + 1e-3 && pg.template !== "FULL") bad(`${label} crop ${s.crop.toFixed(3)} p${pi} ${pg.template}`);
      if (!s.unknown && s.dpi < DPI_MIN - 0.01) bad(`${label} dpi ${s.dpi.toFixed(1)} p${pi}`);
      for (let k = 0; k < si; k++) {
        const o = pg.slots[k];
        if (s.x < o.x + o.w - EPS && o.x < s.x + s.w - EPS && s.y < o.y + o.h - EPS && o.y < s.y + s.h - EPS) bad(`${label} overlap p${pi}`);
      }
    });
    pg.slots.map((s) => index.get(s.photo.id)!).sort((a, b) => a - b).forEach((i) => order.push(i));
  });
  if (seen.size !== res.placed) bad(`${label} placed ${res.placed} but drew ${seen.size}`);
  order.forEach((v, i) => v !== i && bad(`${label} order break at ${i}`));
  if (res.placed + res.leftover !== photos.length) bad(`${label} count`);
  const wantPages = Math.min(pages - (pages % 2), res.placed < pages ? Math.max(res.placed - (res.placed % 2), Math.min(res.placed, 2)) : pages);
  if (res.placed >= 2 && res.pages.length !== wantPages) bad(`${label} pages ${res.pages.length} want ${wantPages}`);
  return res;
}

const kinds = Object.keys(MIX);
const pct = (v: number) => Math.round(v * 100) + "%";
console.log("set".padEnd(26) + "sheets  placed  maxcrop  wrongway  reshaped  smaller");
for (const kind of kinds)
  for (const n of [10, 15, 24, 36, 48, 60, 90, 180]) {
    const photos = samplePhotos(kind, n);
    for (const a of ARRANGEMENTS) {
      const sheets = sheetsToFit(n, a.id);
      const res = checkPlan(photos, sheets * 2, a.id, `${kind}${n}${a.id}`);
      const range = sheetRange(n, a.id);
      if (range.min > range.max) bad(`${kind}${n}${a.id} range ${range.min}>${range.max}`);
      if (range.max > MAX_SHEETS) bad(`${kind}${n}${a.id} max ${range.max}`);
      if (res.leftover && sheets < MAX_SHEETS) bad(`${kind}${n}${a.id} leftover ${res.leftover} in a book sized to fit`);
      for (const s of [5, 8, 12, 16]) checkPlan(photos, s * 2, a.id, `${kind}${n}${a.id}@${s}`);
      if (n === 36 || n === 60)
        console.log(
          `${kind} ${n} ${a.name}`.padEnd(26) +
            String(sheets).padEnd(8) +
            String(res.placed).padEnd(8) +
            pct(res.stats.maxCrop).padEnd(9) +
            String(res.stats.clashes).padEnd(10) +
            String(res.stats.eased).padEnd(10) +
            res.stats.shrunk,
        );

      // The builder's pages: grid, one rectangle per slot, all inside the page.
      const book = arrangeBook(photos, a.id, null);
      if (book.pages.length % 2) bad(`${kind}${n}${a.id} odd page count ${book.pages.length}`);
      if (book.pages.length !== book.sheets * 2 && n >= 10) bad(`${kind}${n}${a.id} ${book.pages.length} pages for ${book.sheets} sheets`);
      for (const pg of book.pages) {
        if (pg.layout !== "grid" || !pg.frames || pg.frames.length !== pg.slots.length) bad(`${kind}${n}${a.id} frames`);
        for (const f of pg.frames ?? []) if (f.x < 0 || f.y < 0 || f.x + f.w > 1.0001 || f.y + f.h > 1.0001) bad(`${kind}${n}${a.id} frame off page`);
        if (new Set(book.pages.map((p) => p.id)).size !== book.pages.length) bad("page ids not unique");
      }

      // An editor re-lays one page with a photo removed, and with one added.
      const pg = book.pages[1];
      if (pg && pg.slots.length > 1) {
        const fewer = relayoutPage(pg, pg.slots.slice(1), photos, 1);
        if (!fewer || fewer.slots.length !== pg.slots.length - 1 || fewer.frames!.length !== fewer.slots.length) bad(`${kind}${n}${a.id} relayout fewer`);
      }
      if (pg && pg.slots.length < 6) {
        const extra = photos[photos.length - 1];
        const more = relayoutPage(pg, [...pg.slots, { photoId: extra.id, fx: 0.5, fy: 0.5, zoom: 1, turn: 0 }], photos, 1);
        if (!more || more.slots.length !== pg.slots.length + 1) bad(`${kind}${n}${a.id} relayout more`);
      }
    }
  }

// More sheets than the arrangement needs: every page still gets a photo.
{
  const photos = samplePhotos("phone", 24);
  const b = arrangeBook(photos, "family", 12);
  if (b.pages.some((p) => p.slots.length === 0)) bad("empty page in a roomier book");
  if (b.sheets !== Math.min(12, sheetRange(24, "family").max)) bad("sheet clamp " + b.sheets);
}
// Unknown sizes (HEIC) and tiny inputs must not throw.
checkPlan([{ id: "a", label: "", shade: 0 }, { id: "b", label: "", shade: 0, w: 4000, h: 3000 }, { id: "c", label: "", shade: 0 }], 10, "classic", "unknown");
checkPlan(samplePhotos("phone", 3), 10, "story", "tiny");
if (plan([], 10, "story").pages.length !== 0) bad("empty");
{
  const one = arrangeBook(samplePhotos("phone", 1), "story", null);
  if (one.pages.length !== 1 || one.placed !== 1) bad("one photo " + one.pages.length);
}

console.log(fails ? `${fails} FAILURES` : "ALL CHECKS PASSED");
process.exit(fails ? 1 : 0);
