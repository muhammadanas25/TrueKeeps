/**
 * Photo quality flags — the few photos that would print badly (owner,
 * 2026-11-22: "flagging for low resolution pic for extreme outliers, flag
 * blur").
 *
 * What: one function, photoFlag(), that says whether a photo is too small or
 * far blurrier than the customer's other photos. The photos step and the
 * editor's Photos panel show the flag on the tile; the order records which
 * photos were flagged when the customer approved (the refund policy says
 * photos used after our low-quality warning aren't covered).
 *
 * Why "extreme outliers" only: a wall of warnings teaches people to ignore
 * them. So:
 *  - SMALL: the short side is under 800 px. Even a 4 in slot then prints
 *    under 200 dpi, which looks soft on paper. Phone photos are 3000 px and
 *    up; 800 px is a forwarded copy or a screenshot crop.
 *  - BLURRY: sharpness (variance of the Laplacian, measured on the phone
 *    while uploading; see prepare.ts) under a quarter of the median of the
 *    customer's photos AND under an absolute floor. Comparing with their own
 *    photos is what keeps a calm sky or a misty mountain from being flagged:
 *    those are low everywhere in a book of landscapes, so the median is low
 *    too. Needs at least 5 measured photos to have a median worth trusting.
 */

import type { BuilderPhoto } from "./data";

/** Short side below this prints soft even small. */
export const SMALL_PX = 800;
/** A photo this much less sharp than the median of the book is an outlier. */
const BLUR_RATIO = 0.25;
/** ... and below this it is blurry in absolute terms too. */
const BLUR_FLOOR = 60;
/** Fewer measured photos than this: no blur verdicts at all. */
const MIN_SAMPLE = 5;

export type PhotoFlag = "small" | "blurry";

/** The median sharpness of these photos, or null when too few were measured. */
export function medianSharpness(photos: BuilderPhoto[]): number | null {
  const v = photos.map((p) => p.sharp).filter((s): s is number => typeof s === "number" && s >= 0);
  if (v.length < MIN_SAMPLE) return null;
  v.sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/**
 * The flag for one photo, given the median of the book (medianSharpness).
 * Small wins over blurry: it's the more certain of the two.
 */
export function photoFlag(p: BuilderPhoto, median: number | null): PhotoFlag | null {
  if (p.w && p.h && Math.min(p.w, p.h) < SMALL_PX) return "small";
  if (median !== null && typeof p.sharp === "number" && p.sharp < BLUR_FLOOR && p.sharp < median * BLUR_RATIO) return "blurry";
  return null;
}

/** Every flagged photo in the book, id → flag. */
export function flaggedPhotos(photos: BuilderPhoto[]): Map<string, PhotoFlag> {
  const median = medianSharpness(photos);
  const out = new Map<string, PhotoFlag>();
  for (const p of photos) {
    const f = photoFlag(p, median);
    if (f) out.set(p.id, f);
  }
  return out;
}

/** The words on a flagged tile. */
export function flagLabel(p: BuilderPhoto, flag: PhotoFlag): string {
  return flag === "small" ? `Small file · ${p.w} × ${p.h}` : "Looks blurry";
}
