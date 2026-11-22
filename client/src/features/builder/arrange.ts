/**
 * Arrange — the layout engine behind "Pick your book" (flow v2, 2026-11-17).
 *
 * What: turns the customer's photos, in the order they added them, into the
 * pages of a 12 x 12 in book. It decides how many photos go on each page,
 * which page template each page uses, which photo sits in which slot, and
 * exactly where each slot is.
 *
 * Why it replaced the old pattern dealer (generatePages before 2026-11-17):
 * that dealt photos into a fixed rhythm of at most three slots a page, and
 * every slot was filled edge to edge. A portrait could land in a wide slot
 * and lose most of itself, and a 36-photo book needed 14 sheets. This engine
 * keeps three promises instead (measured on a 36-photo phone mix: 5 sheets,
 * at most 18% trimmed from any photo, nothing the wrong way round):
 *   1. Shape match. A photo goes to a slot of its own shape whenever the page
 *      can offer one (landscape to landscape, portrait to portrait).
 *   2. Crop cap. A slot never trims more than CROP_CAP of a photo's area. If
 *      it would, the slot is reshaped toward the photo and the rest of the
 *      cell stays paper.
 *   3. Sharpness floor. A photo is never printed larger than DPI_MIN allows
 *      (same floor as print.ts). If its slot is too big for its pixels, it is
 *      printed smaller instead of being blown up.
 *
 * Approach, in order:
 *   a. TEMPLATES: page templates in inches (0.5 in safe margin, 0.25 in
 *      gaps), built from 3:2, 2:3 and 1:1 slots, one to six slots a page.
 *   b. slotCost(): the price of one photo in one slot (crop lost, wrong way
 *      round, too few pixels).
 *   c. assign(): the cheapest photo-to-slot pairing for one page (bitmask
 *      DP), with a small charge for moving a photo out of reading order.
 *   d. plan(): a second DP over the whole book. It cuts the photo list into
 *      exactly `pages` consecutive groups so the total cost is lowest, while
 *      a rhythm target per arrangement keeps the page counts varied.
 *   e. frame(): applies the crop cap and the sharpness floor to each slot.
 *
 * The arrangement is stored in the book's existing `density` field so saved
 * books and the server schema did not need a new field:
 *   minimal → Story, balanced → Classic, collage → Family Album.
 *
 * Output pages use the "grid" layout: each page carries its slot rectangles
 * (`frames`, fractions of the page) and each placement is cover-fitted with
 * its focal point at (0.5, FOCAL_Y), which reproduces frame()'s crop exactly.
 *
 * Pure functions, no DOM. The design prototype of this engine (with the
 * comparison against the old layout) lives in flow_v2/ and on the design
 * canvas; tests: `npx tsx client/src/features/builder/arrange.test.ts`.
 */

import { PRICE_LIST } from "@shared/pricing";
import type { BookPage, BuilderPhoto, DensityId, PageFrame, Placement } from "./data";

/* ── Constants ─────────────────────────────────────────────── */

/** Page edge, inches. */
export const PAGE = 12;
/** Same floor as print.ts DPI_MIN: below this a print looks soft. */
export const DPI_MIN = 150;
/** Most of a photo's area a slot may trim. */
export const CROP_CAP = 0.18;
/** When top or bottom must go, keep more of the top (heads live there). */
export const FOCAL_Y = 0.4;
/** Weight of (photos on page − target)²: keeps the pages varied. */
const W_RHYTHM = 5;
/** Charge per position a photo moves out of reading order on its page. */
const W_ORDER = 1.2;
/** A landscape photo in a portrait slot, or the reverse. */
const CLASH = 60;
/** The most sheets a book can have (owner, 2026-11-16). */
export const MAX_SHEETS = 16;
/** The most photos any one page can hold. */
export const MAX_PER_PAGE = 6;

/* ── Templates ─────────────────────────────────────────────── */

interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
  /** runs to the page edge, so it cannot be reshaped */
  bleed: boolean;
}

interface Template {
  id: string;
  n: number;
  /** mirrored on right-hand pages so the spread sits level */
  asym: boolean;
  slots: Cell[];
}

/** Each slot is [x, y, w, h] in inches on a 12 x 12 page. */
const RAW: Record<string, { s: number[][]; asym?: boolean; bleed?: boolean }> = {
  // one photo
  L1: { s: [[0.5, 2.335, 11, 7.33]] },
  P1: { s: [[2.5, 0.75, 7, 10.5]] },
  S1: { s: [[1, 1, 10, 10]] },
  FULL: { s: [[0, 0, 12, 12]], bleed: true },
  // two
  L2: { s: [[1.97, 0.5, 8.06, 5.375], [1.97, 6.125, 8.06, 5.375]] },
  P2: { s: [[0.5, 1.97, 5.375, 8.06], [6.125, 1.97, 5.375, 8.06]] },
  S2: { s: [[0.5, 3.3125, 5.375, 5.375], [6.125, 3.3125, 5.375, 5.375]] },
  PL2: { s: [[0.5, 2.7, 4.4, 6.6], [5.15, 3.883, 6.35, 4.233]], asym: true },
  // three
  L3: { s: [[0.5, 0.5, 11, 7.33], [0.5, 8.08, 5.375, 3.42], [6.125, 8.08, 5.375, 3.42]] },
  P3: { s: [[0.5, 0.5, 7.33, 11], [8.08, 0.5, 3.42, 5.375], [8.08, 6.125, 3.42, 5.375]], asym: true },
  PLL3: { s: [[0.5, 2.14, 5.147, 7.72], [5.897, 2.14, 5.603, 3.735], [5.897, 6.125, 5.603, 3.735]], asym: true },
  PPL3: { s: [[1.875, 0.5, 4, 6], [6.125, 0.5, 4, 6], [2.4375, 6.75, 7.125, 4.75]] },
  // four
  M4: { s: [[0.5, 0.915, 3.31, 4.96], [4.06, 0.915, 7.44, 4.96], [0.5, 6.125, 7.44, 4.96], [8.19, 6.125, 3.31, 4.96]], asym: true },
  S4: { s: [[0.5, 0.5, 5.375, 5.375], [6.125, 0.5, 5.375, 5.375], [0.5, 6.125, 5.375, 5.375], [6.125, 6.125, 5.375, 5.375]] },
  L4: { s: [[0.5, 2.29, 5.375, 3.58], [6.125, 2.29, 5.375, 3.58], [0.5, 6.12, 5.375, 3.58], [6.125, 6.12, 5.375, 3.58]] },
  P4: { s: [[2.295, 0.5, 3.58, 5.375], [6.125, 0.5, 3.58, 5.375], [2.295, 6.125, 3.58, 5.375], [6.125, 6.125, 3.58, 5.375]] },
  L1S3: { s: [[0.5, 0.5, 11, 7.33], [0.5, 8.08, 3.5, 3.42], [4.25, 8.08, 3.5, 3.42], [8, 8.08, 3.5, 3.42]] },
  P1S3: { s: [[0.5, 0.5, 7.33, 11], [8.08, 0.5, 3.42, 3.5], [8.08, 4.25, 3.42, 3.5], [8.08, 8, 3.42, 3.5]], asym: true },
  // five
  M5: { s: [[0.5, 1.46, 3.5, 5.25], [4.25, 1.46, 3.5, 5.25], [8, 1.46, 3.5, 5.25], [0.5, 6.96, 5.375, 3.58], [6.125, 6.96, 5.375, 3.58]] },
  M5B: { s: [[0.5, 1.46, 5.375, 3.58], [6.125, 1.46, 5.375, 3.58], [0.5, 5.29, 3.5, 5.25], [4.25, 5.29, 3.5, 5.25], [8, 5.29, 3.5, 5.25]] },
  L2S3: { s: [[0.5, 2.335, 5.375, 3.58], [6.125, 2.335, 5.375, 3.58], [0.5, 6.165, 3.5, 3.5], [4.25, 6.165, 3.5, 3.5], [8, 6.165, 3.5, 3.5]] },
  P5: { s: [[0.5, 0.5, 3.5, 5.375], [4.25, 0.5, 3.5, 5.375], [8, 0.5, 3.5, 5.375], [2.375, 6.125, 3.5, 5.375], [6.125, 6.125, 3.5, 5.375]] },
  // six
  P6: { s: [[0.5, 0.5, 3.5, 5.375], [4.25, 0.5, 3.5, 5.375], [8, 0.5, 3.5, 5.375], [0.5, 6.125, 3.5, 5.375], [4.25, 6.125, 3.5, 5.375], [8, 6.125, 3.5, 5.375]] },
  L6: { s: [[0.5, 0.5, 5.375, 3.5], [6.125, 0.5, 5.375, 3.5], [0.5, 4.25, 5.375, 3.5], [6.125, 4.25, 5.375, 3.5], [0.5, 8, 5.375, 3.5], [6.125, 8, 5.375, 3.5]] },
  S6: { s: [[0.5, 2.375, 3.5, 3.5], [4.25, 2.375, 3.5, 3.5], [8, 2.375, 3.5, 3.5], [0.5, 6.125, 3.5, 3.5], [4.25, 6.125, 3.5, 3.5], [8, 6.125, 3.5, 3.5]] },
};

const BY_COUNT: Record<number, Template[]> = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
for (const id of Object.keys(RAW)) {
  const r = RAW[id];
  const t: Template = {
    id,
    n: r.s.length,
    asym: !!r.asym,
    slots: r.s.map(([x, y, w, h]) => ({ x, y, w, h, bleed: !!r.bleed })),
  };
  BY_COUNT[t.n].push(t);
}

/**
 * The engine templates the editor's layout picker offers for 4, 5 and 6
 * photos a page (owner, 2026-11-22: "I don't see the advanced layouts, like
 * 4 boxes in one"). The picker's own named layouts stop at three photos; these
 * are the engine's, so a page picked here looks exactly like one the engine
 * made. `frames` are page fractions, for drawing the thumbnail.
 */
export const PICKER_TEMPLATES: Array<{ id: string; name: string; n: number; frames: PageFrame[] }> = (
  [
    ["S4", "Grid of 4"],
    ["L1S3", "Big + 3"],
    ["M4", "Mosaic"],
    ["L2S3", "2 + 3"],
    ["M5", "3 + 2"],
    ["P5", "Five tall"],
    ["L6", "Six wide"],
    ["P6", "Six tall"],
    ["S6", "Six square"],
  ] as const
).map(([id, name]) => ({
  id,
  name,
  n: RAW[id].s.length,
  // inches → page fractions (toFrame is defined further down, after this runs)
  frames: RAW[id].s.map(([x, y, w, h]) => ({ x: x / PAGE, y: y / PAGE, w: w / PAGE, h: h / PAGE })),
}));

/* ── Arrangements ──────────────────────────────────────────── */

export type ArrangementId = "story" | "classic" | "family";

interface Style {
  id: ArrangementId;
  /** the most photos on any one page */
  max: number;
  /** average photos per page this arrangement is comfortable at */
  lo: number;
  hi: number;
  /** the page-count pattern it follows, scaled to the book's real average */
  rhythm: number[];
}

const STYLES: Record<ArrangementId, Style> = {
  story: { id: "story", max: 3, lo: 1, hi: 2, rhythm: [1, 2, 1, 2, 2, 1] },
  classic: { id: "classic", max: 5, lo: 2, hi: 4, rhythm: [1, 3, 4, 2, 4, 3] },
  family: { id: "family", max: 6, lo: 3.5, hi: 5.5, rhythm: [3, 5, 6, 4, 5, 6] },
};

/** The arrangements in the order the customer sees them. */
export const ARRANGEMENTS: Array<{ id: ArrangementId; density: DensityId; name: string; line: string }> = [
  { id: "story", density: "minimal", name: "Story", line: "1 to 2 photos a page. Big and calm." },
  { id: "classic", density: "balanced", name: "Classic", line: "2 to 4 photos a page. One big photo, then small groups." },
  { id: "family", density: "collage", name: "Family Album", line: "4 to 6 photos a page. The most memories on every sheet." },
];

/** The arrangement stored in a book's `density` field. */
export function arrangementOf(density: DensityId | string | null | undefined): ArrangementId {
  return ARRANGEMENTS.find((a) => a.density === density)?.id ?? "classic";
}

/** The `density` value that stores an arrangement. */
export function densityOf(id: ArrangementId): DensityId {
  return ARRANGEMENTS.find((a) => a.id === id)?.density ?? "balanced";
}

/* ── Small helpers ─────────────────────────────────────────── */

/** What the engine needs to know about a photo. */
export interface SizedPhoto {
  id: string;
  w?: number;
  h?: number;
}

const aspect = (p: SizedPhoto): number | null => (p.w && p.h && p.w > 0 && p.h > 0 ? p.w / p.h : null);
/** Landscape, portrait or square-ish. */
const cls = (a: number): "L" | "P" | "S" => (a >= 1.2 ? "L" : a <= 0.83 ? "P" : "S");
/** Share of the photo's area lost when it fills a slot edge to edge. */
const cropLoss = (ap: number, as: number): number => 1 - Math.min(ap / as, as / ap);
const clash = (ap: number, as: number): boolean => {
  const p = cls(ap);
  const s = cls(as);
  return (p === "L" && s === "P") || (p === "P" && s === "L");
};

/* ── frame(): crop cap and sharpness floor for one photo in one cell ── */

/** One photo printed in one slot. Rectangles are in inches on the page. */
export interface Framed {
  x: number;
  y: number;
  w: number;
  h: number;
  /** share of the photo's area trimmed */
  crop: number;
  /** print resolution at this size; 0 when the size is unknown */
  dpi: number;
  /** the slot was reshaped toward the photo to respect CROP_CAP */
  eased: boolean;
  /** the slot was shrunk to respect DPI_MIN */
  shrunk: boolean;
  /** photo and slot point different ways */
  clash: boolean;
  /** the photo's pixel size is not known (some HEIC files) */
  unknown: boolean;
  /** how much the sharpness floor shrank the slot (1 = not at all) */
  scale: number;
}

/**
 * The rectangle the photo is printed in, inside `cell`.
 *   1. Fits edge to edge when that trims no more than CROP_CAP.
 *   2. Otherwise the slot is narrowed (or lowered) toward the photo's own
 *      shape until the trim is exactly CROP_CAP, centred in the cell.
 *   3. If the photo's pixels are below DPI_MIN at that size, the rectangle
 *      shrinks about its centre until they are not.
 * Bleed cells are never reshaped; the planner keeps unsuitable photos away.
 */
export function frame(p: SizedPhoto, cell: Cell): Framed {
  const ap = aspect(p);
  const r = { x: cell.x, y: cell.y, w: cell.w, h: cell.h };
  const out: Framed = { ...r, crop: 0, dpi: 0, eased: false, shrunk: false, clash: false, unknown: !ap, scale: 1 };
  if (!ap) return out;
  const as = cell.w / cell.h;
  let loss = cropLoss(ap, as);
  out.clash = clash(ap, as);
  if (loss > CROP_CAP && !cell.bleed) {
    out.eased = true;
    if (ap > as) {
      const nh = r.w / (ap * (1 - CROP_CAP));
      r.y += (r.h - nh) / 2;
      r.h = nh;
    } else {
      const nw = r.h * (ap / (1 - CROP_CAP));
      r.x += (r.w - nw) / 2;
      r.w = nw;
    }
    loss = CROP_CAP;
  }
  out.crop = loss;
  let dpi = Math.min(p.w! / r.w, p.h! / r.h);
  if (dpi < DPI_MIN) {
    const s = dpi / DPI_MIN;
    r.x += (r.w * (1 - s)) / 2;
    r.y += (r.h * (1 - s)) / 2;
    r.w *= s;
    r.h *= s;
    out.shrunk = true;
    out.scale = s;
    dpi = DPI_MIN;
  }
  out.dpi = dpi;
  return { ...out, ...r };
}

/* ── slotCost(): how bad is this photo in this slot ────────── */

function slotCost(p: SizedPhoto, slot: Cell): number {
  const ap = aspect(p);
  const as = slot.w / slot.h;
  // Size unknown (some HEIC files): a square slot is the safest guess.
  if (!ap) return 8 + (cls(as) === "S" ? 0 : 4);
  const loss = cropLoss(ap, as);
  let c = loss * 100;
  if (clash(ap, as)) c += CLASH;
  if (slot.bleed && loss > CROP_CAP) c += 400;
  const f = frame(p, slot);
  if (f.shrunk) c += 40 + (1 - f.scale) * 120; // would print smaller than its slot
  else if (f.dpi < 200) c += (200 - f.dpi) * 0.12; // fine, but prefer a smaller slot
  return c;
}

/* ── assign(): cheapest photo-to-slot pairing for one page ─── */

const popcount = (m: number): number => {
  let c = 0;
  while (m) {
    c += m & 1;
    m >>= 1;
  }
  return c;
};

/**
 * The cheapest way to put `chunk` into `tpl`'s slots.
 * g[mask] = cheapest way to fill the first popcount(mask) slots with the
 * photos in mask; walking `pick` back recovers which photo went where.
 */
function assign(chunk: SizedPhoto[], tpl: Template): { cost: number; map: number[] } {
  const n = chunk.length;
  const full = (1 << n) - 1;
  const cost: number[][] = chunk.map((ph, j) => tpl.slots.map((slot, k) => slotCost(ph, slot) + W_ORDER * Math.abs(j - k)));
  const g = new Array<number>(full + 1);
  const pick = new Array<number>(full + 1);
  g[0] = 0;
  for (let m = 1; m <= full; m++) {
    const slotIdx = popcount(m) - 1;
    let best = Infinity;
    let bj = -1;
    for (let q = 0; q < n; q++) {
      if (!(m & (1 << q))) continue;
      const v = g[m ^ (1 << q)] + cost[q][slotIdx];
      if (v < best) {
        best = v;
        bj = q;
      }
    }
    g[m] = best;
    pick[m] = bj;
  }
  const map = new Array<number>(n);
  let mm = full;
  for (let s = n - 1; s >= 0; s--) {
    map[s] = pick[mm];
    mm ^= 1 << pick[mm];
  }
  return { cost: g[full], map }; // map[slot] = index of the photo within the chunk
}

/** Every template for these photos, cheapest first. */
function rank(chunk: SizedPhoto[]): Array<{ tpl: Template; cost: number; map: number[] }> {
  return BY_COUNT[chunk.length]
    .map((tpl) => ({ tpl, ...assign(chunk, tpl) }))
    .sort((a, b) => a.cost - b.cost);
}

/** Lay one template out for a page, mirrored on a right-hand page if it leans. */
function layPage<T extends SizedPhoto>(chunk: T[], option: { tpl: Template; map: number[] }, rightHand: boolean) {
  const mirror = option.tpl.asym && rightHand;
  return option.tpl.slots.map((cell, s) => {
    const photo = chunk[option.map[s]];
    const c2: Cell = mirror ? { ...cell, x: PAGE - cell.x - cell.w } : cell;
    return { photo, at: option.map[s], ...frame(photo, c2) };
  });
}

/* ── plan(): the whole book ────────────────────────────────── */

export interface PlannedSlot<T extends SizedPhoto = SizedPhoto> extends Framed {
  photo: T;
}

export interface PlannedPage<T extends SizedPhoto = SizedPhoto> {
  template: string;
  slots: Array<PlannedSlot<T>>;
}

export interface BookPlan<T extends SizedPhoto = SizedPhoto> {
  pages: Array<PlannedPage<T>>;
  /** photos in the book */
  placed: number;
  /** photos that did not fit (the last ones), when the book is too small */
  leftover: number;
  stats: { maxCrop: number; clashes: number; eased: number; shrunk: number };
}

/**
 * Lay out a book.
 *
 * @param photos  in the order the customer added them
 * @param pages   pages inside the book (2 per sheet); rounded down to even
 * @param style   the arrangement
 *
 * A book never has more pages than photos: with too few photos to give every
 * page one, it gets fewer pages (still an even number).
 */
export function plan<T extends SizedPhoto>(photos: T[], pages: number, style: ArrangementId): BookPlan<T> {
  const st = STYLES[style] ?? STYLES.classic;
  pages = Math.max(2, pages - (pages % 2));
  const capacity = Math.floor(pages * st.hi);
  const n = Math.min(photos.length, capacity);
  let P = pages;
  if (n < P) P = Math.max(2, n - (n % 2));
  const use = photos.slice(0, n);
  if (n === 0) return { pages: [], placed: 0, leftover: photos.length, stats: { maxCrop: 0, clashes: 0, eased: 0, shrunk: 0 } };
  if (n < P) P = n; // one or three photos: as many pages as photos

  // Rhythm targets: the arrangement's pattern, scaled to this book's average.
  const mean = st.rhythm.reduce((a, b) => a + b, 0) / st.rhythm.length;
  const avg = n / P;
  const target = Array.from({ length: P }, (_, t) => Math.min(st.max, Math.max(1, (st.rhythm[t % st.rhythm.length] * avg) / mean)));

  // Ranked template options for the photos [i, i + c), cached.
  const cache = new Map<number, ReturnType<typeof rank>>();
  const options = (i: number, c: number) => {
    const key = i * 8 + c;
    let list = cache.get(key);
    if (!list) {
      list = rank(use.slice(i, i + c));
      cache.set(key, list);
    }
    return list;
  };

  // f[p][i] = lowest cost of putting the first i photos on the first p pages
  const f: number[][] = [];
  const back: Array<Array<{ p: number; i: number; c: number } | null>> = [];
  for (let p = 0; p <= P; p++) {
    f.push(new Array(n + 1).fill(Infinity));
    back.push(new Array(n + 1).fill(null));
  }
  f[0][0] = 0;
  for (let p = 0; p < P; p++) {
    for (let i = 0; i < n; i++) {
      const base = f[p][i];
      if (base === Infinity) continue;
      for (let c = 1; c <= st.max && i + c <= n; c++) {
        const d = c - target[p];
        const v = base + options(i, c)[0].cost + W_RHYTHM * d * d;
        if (v < f[p + 1][i + c]) {
          f[p + 1][i + c] = v;
          back[p + 1][i + c] = { p, i, c };
        }
      }
    }
  }

  // Walk back from the end to recover each page's group.
  const steps: Array<{ p: number; i: number; c: number }> = [];
  let cp = P;
  let ci = n;
  while (cp > 0 && back[cp][ci]) {
    const b = back[cp][ci]!;
    steps.unshift(b);
    cp = b.p;
    ci = b.i;
  }

  const chosen = steps.map((s) => ({ ...s, opt: options(s.i, s.c), pick: 0 }));
  // Spread harmony: if both pages of a spread chose the same template and the
  // right-hand page has a near-equal alternative, take the alternative.
  for (let k = 0; k + 1 < chosen.length; k += 2) {
    const L = chosen[k];
    const R = chosen[k + 1];
    if (L.c < 2) continue;
    if (L.opt[0].tpl.id === R.opt[0].tpl.id && R.opt.length > 1 && R.opt[1].cost <= R.opt[0].cost + 10) R.pick = 1;
  }

  const out: Array<PlannedPage<T>> = chosen.map((s) => {
    const o = s.opt[s.pick];
    const chunk = use.slice(s.i, s.i + s.c);
    return { template: o.tpl.id, slots: layPage(chunk, o, s.p % 2 === 1).map(({ at: _at, ...rest }) => rest) };
  });

  const stats = { maxCrop: 0, clashes: 0, eased: 0, shrunk: 0 };
  for (const pg of out)
    for (const sl of pg.slots) {
      stats.maxCrop = Math.max(stats.maxCrop, sl.crop);
      if (sl.clash) stats.clashes++;
      if (sl.eased) stats.eased++;
      if (sl.shrunk) stats.shrunk++;
    }
  return { pages: out, placed: n, leftover: photos.length - n, stats };
}

/* ── Book sizing ───────────────────────────────────────────── */

/** Fewest sheets (at least the included ones) that hold n photos in this arrangement. */
export function sheetsToFit(n: number, style: ArrangementId): number {
  const st = STYLES[style] ?? STYLES.classic;
  let s: number = PRICE_LIST.includedSheets;
  while (Math.floor(s * 2 * st.hi) < n && s < MAX_SHEETS) s++;
  return s;
}

/**
 * The sheet counts a customer may choose for n photos in this arrangement.
 *   min:   fewest sheets that hold every photo at the arrangement's comfortable fullness
 *   max:   most sheets where every page still gets a photo, capped at MAX_SHEETS
 *   holds: photos that fit at `min`; below n only when the biggest book is too small
 */
export function sheetRange(n: number, style: ArrangementId): { min: number; max: number; holds: number } {
  const st = STYLES[style] ?? STYLES.classic;
  const min = sheetsToFit(n, style);
  const max = Math.max(min, Math.min(MAX_SHEETS, Math.floor(n / 2)));
  return { min, max, holds: Math.min(n, Math.floor(min * 2 * st.hi)) };
}

/** Clamp a chosen sheet count (null = fewest that hold every photo) into the range. */
export function sheetsFor(n: number, style: ArrangementId, chosen: number | null | undefined): number {
  const r = sheetRange(n, style);
  return Math.min(r.max, Math.max(r.min, chosen ?? r.min));
}

/** The first arrangement, roomiest first, whose biggest book holds every photo. */
export function arrangementThatFits(n: number): ArrangementId | null {
  return ARRANGEMENTS.find((a) => sheetRange(n, a.id).holds >= n)?.id ?? null;
}

/* ── Adapter: plan → builder pages ─────────────────────────── */

const round4 = (v: number) => Math.round(v * 10000) / 10000;

/** A slot rectangle in inches → the page fractions a "grid" page stores. */
const toFrame = (s: { x: number; y: number; w: number; h: number }): PageFrame => ({
  x: round4(s.x / PAGE),
  y: round4(s.y / PAGE),
  w: round4(s.w / PAGE),
  h: round4(s.h / PAGE),
});

/** The placement that reproduces frame()'s crop: centred across, a little high. */
const placed = (photoId: string): Placement => ({ photoId, fx: 0.5, fy: FOCAL_Y, zoom: 1, turn: 0, tilt: 0 });

export interface Arranged {
  pages: BookPage[];
  sheets: number;
  placed: number;
  leftover: number;
  stats: BookPlan["stats"];
}

/**
 * The customer's photos as a finished book of "grid" pages.
 *
 * @param photos  in the order they were added
 * @param style   the arrangement
 * @param chosen  sheets the customer picked; null = the fewest that hold every photo
 */
export function arrangeBook(photos: BuilderPhoto[], style: ArrangementId, chosen?: number | null): Arranged {
  const sheets = sheetsFor(photos.length, style, chosen);
  const p = plan(photos, sheets * 2, style);
  const pages: BookPage[] = p.pages.map((pg, i) => ({
    id: "pg" + i + "-" + pg.template.toLowerCase(),
    layout: "grid",
    slots: pg.slots.map((s) => placed(s.photo.id)),
    frames: pg.slots.map(toFrame),
    caption: "",
  }));
  return { pages, sheets, placed: p.placed, leftover: p.leftover, stats: p.stats };
}

/**
 * Lay out ONE page again for a new set of photos (a photo added, removed or
 * swapped in an editor). Same templates and rules as the whole book.
 * Returns null when there are no photos or too many for one page.
 *
 * Framing the customer already set on a photo is kept: only photos that are
 * new to the page get the engine's default framing.
 */
export function relayoutPage(page: BookPage, slots: Placement[], photos: BuilderPhoto[], pageIndex: number, templateId?: string): BookPage | null {
  if (!slots.length || slots.length > MAX_PER_PAGE) return null;
  const byId = new Map(photos.map((p) => [p.id, p]));
  const chunk: SizedPhoto[] = slots.map((s) => byId.get(s.photoId) ?? { id: s.photoId });
  // a template the customer picked in the editor, when it holds exactly these photos
  const asked = templateId ? BY_COUNT[chunk.length].find((t) => t.id === templateId) : undefined;
  const best = asked ? { tpl: asked, ...assign(chunk, asked) } : rank(chunk)[0];
  const laid = layPage(chunk, best, pageIndex % 2 === 1);
  const before = new Set(page.slots.map((s) => s.photoId));
  return {
    ...page,
    layout: "grid",
    slots: laid.map((s) => (before.has(slots[s.at].photoId) ? slots[s.at] : placed(slots[s.at].photoId))),
    frames: laid.map(toFrame),
    mirror: undefined,
  };
}
