/**
 * Print geometry and resolution math.
 *
 * This module exists so that "the photo will look blurry when printed"
 * stops being a thing the user finds out after paying, and becomes a
 * thing the UI physically cannot let them do.
 *
 * The whole chain is:
 *   photo pixels  ÷  printed inches  ÷  zoom   =   effective DPI
 * and the zoom slider's maximum is derived by solving that for the DPI
 * floor. So the slider simply STOPS where quality would stop. The user
 * never sees the number "150 DPI", never learns what DPI means, and
 * never ships a soft page — the constraint is expressed as the end of a
 * track rather than as a warning they can dismiss.
 *
 * Nothing here is stateful or React-aware; it's pure arithmetic over
 * the slot geometry declared in builder.css, so it can be reused by the
 * server-side print pipeline later.
 */

import type { BookPage, BuilderPhoto, PageLayoutId, Placement } from "./data";

/* ── Resolution thresholds ──────────────────────────────────── */

/** Commercial print target. Above this, more pixels buy nothing. */
export const DPI_IDEAL = 300;

/**
 * The floor. Below ~150 DPI softness is visible to a normal person
 * holding a photo book at reading distance, so this is where the zoom
 * track ends and where the preflight badge turns from advisory to
 * blocking.
 */
export const DPI_MIN = 150;

/**
 * Printed page size, in inches. The quiz builder currently sells one
 * square trim; when per-product sizing lands this becomes a lookup
 * keyed off the chosen binding/product rather than a constant. Every
 * function below takes the page size as an argument precisely so that
 * change is a one-line call-site edit, not a refactor.
 */
export const PAGE_INCHES = { w: 8, h: 8 };

/* ── Slot geometry ──────────────────────────────────────────── */

/**
 * The fraction of the page edge each slot occupies, transcribed from
 * builder.css so the two cannot drift silently:
 *
 *   .bb-page           padding: 7.5%          → content box 0.85 × 0.85
 *   .bb-page-full      padding: 0; inset: 0   → 1.00 × 1.00 (full bleed)
 *   .bb-page-single    .bb-ph { flex: 1 }     → the whole content box
 *   .bb-page-duo       gap 0.05, two flex:1   → (0.85 − 0.05) / 2 = 0.40 tall
 *   .bb-page-duo-side  gap 0.05, two columns  → (0.85 − 0.05) / 2 = 0.40 wide
 *   .bb-page-collage   absolutely positioned  → the three c0/c1/c2 rules
 *   .bb-page-trio      3 cols, gap 0.035      → (0.85 − 0.07) / 3 = 0.26 wide,
 *                      .bb-ph aspect-ratio 3/4 → 0.26 × 4/3 = 0.3467 tall
 *
 * WHICH size to quote, when a caption can shrink the slot: the LARGEST
 * the slot can reach. `effectiveDpi` divides pixels by inches, so a
 * smaller quoted slot reports a HIGHER DPI — quoting the with-caption
 * height would make us warn too late, which is the one direction that
 * costs the user a printed book. So `single` and `duo-side` are quoted
 * at the full 0.85 content height (the caption element is absent
 * entirely when there is no caption, not merely empty). `duo`'s 0.40 is
 * already its no-caption height, and `trio-strip`'s fixed aspect-ratio
 * makes its slot caption-independent.
 */
export const SLOT_FRACTIONS: Record<PageLayoutId, Array<{ w: number; h: number }>> = {
  title: [],
  full: [{ w: 1.0, h: 1.0 }],
  single: [{ w: 0.85, h: 0.85 }],
  duo: [
    { w: 0.85, h: 0.4 },
    { w: 0.85, h: 0.4 },
  ],
  "duo-side": [
    { w: 0.4, h: 0.85 },
    { w: 0.4, h: 0.85 },
  ],
  collage: [
    { w: 0.56, h: 0.56 },
    { w: 0.38, h: 0.38 },
    { w: 0.48, h: 0.34 },
  ],
  "trio-strip": [
    { w: 0.26, h: 0.26 * (4 / 3) },
    { w: 0.26, h: 0.26 * (4 / 3) },
    { w: 0.26, h: 0.26 * (4 / 3) },
  ],
};

/** Printed size of one slot, in inches. */
export function slotInches(
  layout: PageLayoutId,
  slotIndex: number,
  page: { w: number; h: number } = PAGE_INCHES,
): { w: number; h: number } {
  const frac = SLOT_FRACTIONS[layout]?.[slotIndex];
  // Unknown slot → assume full bleed, the most demanding case. Being
  // pessimistic here can only ever make us warn earlier, never later.
  if (!frac) return { w: page.w, h: page.h };
  return { w: frac.w * page.w, h: frac.h * page.h };
}

/** Aspect ratio (w/h) of a slot — used by orientation-aware layout scoring. */
export const slotAspect = (layout: PageLayoutId, slotIndex: number, page = PAGE_INCHES): number => {
  const s = slotInches(layout, slotIndex, page);
  return s.w / s.h;
};

/* ── Quarter turns ──────────────────────────────────────────── */

/**
 * The slot as the PHOTO meets it, once the turn is taken into account.
 *
 * A quarter-turned photo is fitted to the slot's transposed box and then
 * rotated into place (see `Ph` in book.tsx) — an 8×3.2in duo slot is
 * filled by a photo that was cover-fitted to 3.2×8in. So every question
 * that depends on how many source pixels land on how much paper has to
 * be asked of the TRANSPOSED box, not the printed one.
 *
 * Doing the transpose here, rather than boosting the zoom to make a
 * centre-fitted photo big enough to cover after rotation, is what keeps
 * a turn free: the alternative wastes a factor of max(a, 1/a) of the
 * photo's resolution — 2.1× on a duo slot — for no visible gain.
 */
export const orientedSlot = (
  slot: { w: number; h: number },
  turn: Placement["turn"],
): { w: number; h: number } => (turn === 90 || turn === 270 ? { w: slot.h, h: slot.w } : slot);

/** Printed size of a slot in inches, turn included. */
export const placedInches = (
  layout: PageLayoutId,
  slotIndex: number,
  turn: Placement["turn"] = 0,
  page = PAGE_INCHES,
): { w: number; h: number } => orientedSlot(slotInches(layout, slotIndex, page), turn);

/* ── Straightening ──────────────────────────────────────────── */

/**
 * The most a photo may be straightened, in degrees either way.
 *
 * Ten is not a UI preference, it is where the arithmetic below stops
 * being worth it. Straightening is a correction — a horizon two degrees
 * off, a picture frame that isn't square — and the cost grows fast: at
 * ten degrees on the widest slot in the book we are already throwing
 * away a third of the photo's resolution to hide the corners. Past that
 * the honest advice is to crop, not to rotate.
 */
export const TILT_MAX = 10;

/** Degrees, clamped and NaN-proofed. Every consumer runs input through
 *  this, so no code path downstream has to wonder. */
export const clampTilt = (tilt: number | undefined | null): number =>
  Number.isFinite(tilt as number) ? Math.min(TILT_MAX, Math.max(-TILT_MAX, tilt as number)) : 0;

/**
 * How much a tilted photo must be scaled up so its corners never show.
 *
 * A quarter turn is free (see `orientedSlot`) because a rotated
 * rectangle lands back on a rectangle. Any other angle does not: rotate
 * a W×H photo by θ inside a W×H hole and four wedges of background
 * appear. The fix is to enlarge the photo until it covers again, and the
 * smallest enlargement that does is exact rather than approximate.
 *
 * Derivation: the enlarged photo is axis-aligned in its own frame, so
 * ask the question there — rotate the HOLE by −θ instead, and require
 * the s·W × s·H photo to contain it. An axis-aligned rectangle contains
 * a rotated one exactly when it contains its bounding box, which is
 *   (W·cosθ + H·sinθ) × (W·sinθ + H·cosθ).
 * Both axes must fit, so
 *   s = max( cosθ + (H/W)·sinθ , cosθ + (W/H)·sinθ )
 *     = cosθ + sinθ · max(a, 1/a)      where a = W/H.
 *
 * Two things fall out of that closed form, and both matter:
 *
 *  - The cost depends on the slot's SHAPE, not just the angle. A square
 *    slot at 10° needs 1.16×; the 2.1:1 stacked slot needs 1.35×. The
 *    long thin slots are exactly the ones where a tilt is most tempting
 *    and most expensive.
 *  - `s` is a pure multiplier on the photo's magnification, which means
 *    it is indistinguishable from zoom as far as resolution goes. So it
 *    does not need its own place in the DPI model — it multiplies the
 *    zoom, and every existing guarantee carries over untouched.
 *
 * `aspect` is the slot's OWN aspect, before any quarter turn: the tilt
 * is applied by a wrapper that sits outside the turn wrapper and is
 * inset to the slot exactly (see `Ph`), so the box being rotated is the
 * slot itself no matter which way the photo inside it is facing.
 */
export function tiltCover(tilt: number | undefined | null, aspect: number): number {
  const deg = clampTilt(tilt);
  if (deg === 0) return 1;
  const t = (Math.abs(deg) * Math.PI) / 180;
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  return Math.cos(t) + Math.sin(t) * Math.max(a, 1 / a);
}

/**
 * The magnification a placement actually asks of the photo: the user's
 * zoom times whatever the tilt costs.
 *
 * This is the number every resolution question should use. Passing the
 * raw `zoom` instead is the one mistake available here, and it is a
 * quiet one — the page would print soft and nothing would have warned.
 */
export const framedZoom = (
  pl: Pick<Placement, "zoom" | "tilt">,
  layout: PageLayoutId,
  slotIndex: number,
  page = PAGE_INCHES,
): number => {
  const z = Number.isFinite(pl.zoom) ? Math.max(1, pl.zoom) : 1;
  return z * tiltCover(pl.tilt, slotAspect(layout, slotIndex, page));
};

/* ── The core arithmetic ────────────────────────────────────── */

/**
 * Effective DPI of a photo printed into a slot at a given zoom.
 *
 * Because slots are filled with `object-fit: cover`, the photo is
 * scaled by whichever axis needs the MOST magnification, and the other
 * axis is cropped. So the binding constraint — and the honest DPI — is
 * the minimum of the two per-axis densities. Zoom divides it directly:
 * zooming 2× spreads half as many source pixels over the same paper.
 */
export function effectiveDpi(px: { w: number; h: number }, inches: { w: number; h: number }, zoom = 1): number {
  if (!(px.w > 0 && px.h > 0 && inches.w > 0 && inches.h > 0 && zoom > 0)) return 0;
  return Math.min(px.w / inches.w, px.h / inches.h) / zoom;
}

/**
 * The largest zoom that still clears DPI_MIN — i.e. where the slider
 * ends.
 *
 * Solving `min(Pw/W, Ph/H) / zoom >= DPI_MIN` for zoom gives
 * `zoom <= min(Pw/W, Ph/H) / DPI_MIN`, which is exactly the ratio of
 * the photo's native density to the floor. Clamped below at 1 (never
 * offer less than cover-fit, which would expose the slot background)
 * and above at MAX_ZOOM_CEILING (past ~4× the interaction becomes
 * fiddly and the composition rarely survives, regardless of pixels).
 */
export const MAX_ZOOM_CEILING = 4;

export function maxZoom(px: { w: number; h: number } | null | undefined, inches: { w: number; h: number }): number {
  // Unknown dimensions (undecodable HEIC): allow a modest, safe amount
  // of zoom rather than locking the control entirely. Refusing to let
  // someone reframe a photo because we couldn't read its header is a
  // worse failure than a slightly soft page.
  if (!px || !(px.w > 0) || !(px.h > 0)) return 2;
  const native = Math.min(px.w / inches.w, px.h / inches.h);
  return Math.min(MAX_ZOOM_CEILING, Math.max(1, native / DPI_MIN));
}

/**
 * Where the zoom slider ends for one photo in one slot at one turn —
 * the form the reframe UI actually needs.
 *
 * Turning the photo changes this number (a portrait photo turned into a
 * wide slot has more headroom than the same photo upright), so the
 * slider's end has to be recomputed on every rotate, and the current
 * zoom re-clamped to it. That re-clamp is the whole promise: you cannot
 * rotate your way past the quality floor.
 */
export function slotMaxZoom(
  photo: BuilderPhoto | undefined | null,
  layout: PageLayoutId,
  slotIndex: number,
  turn: Placement["turn"] = 0,
  page = PAGE_INCHES,
  tilt: number | undefined | null = 0,
): number {
  const px = photo && photo.w && photo.h ? { w: photo.w, h: photo.h } : null;
  const ceiling = maxZoom(px, placedInches(layout, slotIndex, turn, page));
  // Straightening spends magnification the zoom slider can no longer
  // spend. Dividing the ceiling — rather than leaving it and checking
  // the product afterwards — is what makes the track physically shorten
  // as the dial moves, so the two controls cannot be combined into a
  // state neither of them would have allowed on its own.
  const cover = tiltCover(tilt, slotAspect(layout, slotIndex, page));
  return Math.max(1, ceiling / cover);
}

/* ── Preflight verdicts ─────────────────────────────────────── */

export type PrintQuality = "unknown" | "great" | "good" | "low";

/**
 * Three buckets, deliberately not five: the user needs to know whether
 * to act, not to grade their camera.
 *   great — at or above the 300 DPI ideal; say nothing
 *   good  — between the floor and the ideal; fine in print, no nag
 *   low   — under the floor; this is the only case worth surfacing
 */
export function printQuality(dpi: number): PrintQuality {
  if (!(dpi > 0)) return "unknown";
  if (dpi >= DPI_IDEAL) return "great";
  if (dpi >= DPI_MIN) return "good";
  return "low";
}

/** Human phrasing for the one case we surface. Avoids the word "DPI". */
export function qualityMessage(q: PrintQuality): string | null {
  switch (q) {
    case "low":
      return "This photo is small — it may look soft in print. Try a larger copy, or zoom out a little.";
    case "unknown":
      return null; // we genuinely don't know; saying so would only worry them
    default:
      return null;
  }
}

/* ── Whole-book preflight ───────────────────────────────────── */

export interface SlotQuality {
  slotIndex: number;
  photoId: string;
  /** 0 when the photo's pixel size is unknown */
  dpi: number;
  quality: PrintQuality;
}

/**
 * Grade every filled slot on a page. `photoById` is passed in rather
 * than looked up so callers can reuse one Map across the whole book
 * instead of doing an O(n²) find-per-slot on large uploads.
 */
export function pageQuality(page: BookPage, photoById: Map<string, BuilderPhoto>): SlotQuality[] {
  return page.slots.map((s, i) => {
    const photo = photoById.get(s.photoId);
    const px = photo && photo.w && photo.h ? { w: photo.w, h: photo.h } : null;
    // framedZoom, not s.zoom — a straightened photo is magnified to hide
    // its corners, and the preflight badge has to see that too or a
    // tilted page passes here and prints soft.
    const dpi = px ? effectiveDpi(px, placedInches(page.layout, i, s.turn), framedZoom(s, page.layout, i)) : 0;
    return { slotIndex: i, photoId: s.photoId, dpi, quality: printQuality(dpi) };
  });
}

/** True if any slot on the page would print below the floor. */
export const pageHasLowQuality = (page: BookPage, photoById: Map<string, BuilderPhoto>): boolean =>
  pageQuality(page, photoById).some((s) => s.quality === "low");

/** Convenience index for the functions above. */
export const indexPhotos = (photos: BuilderPhoto[]): Map<string, BuilderPhoto> =>
  new Map(photos.map((p) => [p.id, p]));

/**
 * Book-wide count of pages that would print soft — the number the order
 * summary needs. Zero means say nothing at all.
 */
export function lowQualityPageCount(pages: BookPage[], photos: BuilderPhoto[]): number {
  const idx = indexPhotos(photos);
  return pages.reduce((n, pg) => n + (pageHasLowQuality(pg, idx) ? 1 : 0), 0);
}
