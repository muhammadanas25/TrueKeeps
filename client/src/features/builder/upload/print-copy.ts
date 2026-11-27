/**
 * Print copies: when a photo may be re-saved smaller before it goes up for
 * printing, and when it must go up exactly as it is.
 *
 * What: one decision per photo, made from its header (jpeg-info.ts) the moment
 * it's picked. The re-save itself happens later, in the HD lane, just before
 * that photo uploads (engine.ts runOriginal), so it never slows the photos
 * appearing in the book.
 *
 * Why (owner, 2026-11-28; docs/adr/023): 80 photos of 5 to 6 MB took 20 to 30
 * minutes on mobile data. Re-saving phone photos at JPEG quality 0.95, full
 * resolution, measured 44% of the original size with SSIMULACRA2 88 to 90,
 * where 90 means no visible difference even zoomed to 100% on screen. Paper
 * hides even more. The owner approved it with one firm rule: quality comes
 * first, and a photo that is already compressed must not be compressed again.
 *
 * The rules, in order. The first that applies wins:
 *   1. Not a JPEG (PNG, WebP, GIF): sent as it is. HEIC is converted to JPEG
 *      at 0.95 elsewhere, as before, because printers can't read it.
 *   2. Anything unreadable, or unusual (not 8-bit, not 3 colour channels):
 *      sent as it is.
 *   3. A colour profile other than sRGB, such as Display P3: sent as it is.
 *      A browser canvas squashes wide colours into sRGB; the print renderer
 *      converts colours properly.
 *   4. Saved below quality 97: sent as it is. That covers WhatsApp copies,
 *      screenshots saved as JPEG, edited and re-exported photos, and phones
 *      that already save at 95 or less. Re-saving those would add a second
 *      round of loss for little gain. WhatsApp and screenshot files are also
 *      caught by name ("IMG-20260714-WA0012.jpg", "Screenshot_…"), as a
 *      second guard in case a file's tables say otherwise (owner, 2026-11-28:
 *      "make sure we don't compress images like WhatsApp forwarded").
 *   5. Under 1.5 MB: sent as it is. Little to gain.
 *   6. Otherwise re-saved at 0.95, keeping every pixel, unless the photo is
 *      much bigger than any page can use (a 48 or 50 MP camera): then also
 *      resized so its short side is 3,520 px, which is the largest photo on
 *      a page (11 inches) at 320 pixels per inch, half the printer's 640.
 *      The cap only applies to photos that also pass rules 1 to 4.
 *   7. After re-saving, the copy must be at most 80% of the original.
 *      Otherwise the original goes up instead.
 * If re-saving fails for any reason, the original goes up. Being wrong here
 * can only ever mean sending a bigger file, never a worse one.
 */

import type { JpegInfo } from "./jpeg-info";

/** JPEG quality of the re-saved print copy. */
export const PRINT_QUALITY = 0.95;
/** Re-save only files saved at this quality or above (estimated from the file's tables). */
export const MIN_SOURCE_QUALITY = 97;
/** Files smaller than this go up as they are. */
export const MIN_SOURCE_BYTES = 1.5 * 1024 * 1024;
/** The copy must be at most this fraction of the original, or the original is sent. */
export const MAX_COPY_FRACTION = 0.8;
/** Largest photo on a page is 11 in; 320 ppi is half the printer's 640 dpi. */
export const PRINT_SHORT_EDGE = 3520;
/** Resize only photos at least this big on the short side (about 25% more than any page uses). */
export const RESIZE_ABOVE_SHORT_EDGE = 4400;

export type PrintPlan =
  | { reencode: true; maxShortEdge: number | null; reason: "high-quality" | "very-large" }
  | { reencode: false; reason: "not-jpeg" | "unreadable" | "unusual" | "wide-colour" | "already-compressed" | "forwarded" | "small" | "failed" };

/** File names that mean "already compressed by an app": WhatsApp, and screenshots. Same test as the upload notices. */
const FORWARDED_NAME = /^IMG-\d{8}-WA\d+|whatsapp|screenshot|screen shot/i;

/** Decide what to send for printing. See the rules in the header. */
export function printPlan(file: Blob, info: JpegInfo | null): PrintPlan {
  if (!info) return { reencode: false, reason: "not-jpeg" };
  if (file instanceof File && FORWARDED_NAME.test(file.name)) return { reencode: false, reason: "forwarded" };
  if (info.quality === undefined || !info.width || !info.height) return { reencode: false, reason: "unreadable" };
  if (info.precision !== 8 || info.components !== 3) return { reencode: false, reason: "unusual" };
  if (info.icc === "other") return { reencode: false, reason: "wide-colour" };
  if (info.quality < MIN_SOURCE_QUALITY) return { reencode: false, reason: "already-compressed" };
  if (file.size < MIN_SOURCE_BYTES) return { reencode: false, reason: "small" };
  const tooBig = Math.min(info.width, info.height) > RESIZE_ABOVE_SHORT_EDGE;
  return tooBig ? { reencode: true, maxShortEdge: PRINT_SHORT_EDGE, reason: "very-large" } : { reencode: true, maxShortEdge: null, reason: "high-quality" };
}

/** Bytes we expect to send, before the copy exists: for the time estimate only. */
export function expectedPrintBytes(file: Blob, plan: PrintPlan): number {
  // measured: 0.95 at full size came to 44% of the owner's quality-99 photos
  return plan.reencode ? Math.round(file.size * 0.5) : file.size;
}
