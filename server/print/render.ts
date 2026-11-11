/**
 * Print renderer — each placed photo, framed exactly as the customer framed
 * it, cut from the untouched HD original at print resolution.
 *
 * Why: the editor only ever shows a ~1600px display copy, and the customer's
 * framing (pan, zoom, quarter turns, straightening) is saved as numbers on
 * the book, not as pixels. Without this step the printer would get either the
 * small copy or an unframed original. This produces what they saw, at full
 * quality (docs/adr/014).
 *
 * The geometry is a straight transcription of how `Ph` in
 * client/src/features/builder/book.tsx draws a photo in the browser, so the
 * two cannot disagree on meaning. From the inside out, `Ph` does this:
 *
 *   1. the photo fills its box with `object-fit: cover`, positioned at the
 *      focal point (fx, fy), then `scale(zoom)` about that same point
 *   2. for a quarter turn, that box is the slot's TRANSPOSED box, rotated
 *      about its centre so it lands back on the slot exactly
 *   3. for straightening, a wrapper the size of the slot is rotated by the
 *      tilt and scaled by `tiltCover` about its centre, which is the smallest
 *      enlargement that keeps the slot covered
 *
 * Here those become pixel operations on the original:
 *
 *   a. apply EXIF orientation, then rotate the whole photo by the quarter turn.
 *      Rotating the content is the same as rotating the box: the focal point
 *      just moves with it (see `turnFocus`).
 *   b. work out which rectangle of the photo is visible in the slot: the
 *      cover-fit, shifted by the focal point, narrowed by the zoom
 *   c. cut that rectangle out and resize it to the slot at the output DPI.
 *      With a tilt it's resized `tiltCover` times larger, rotated, and the
 *      slot-sized centre is kept, which is what the tilt wrapper shows.
 *
 * Output DPI is 300, or the photo's own effective resolution if that's lower:
 * enlarging past what the original holds adds no detail, and the printer
 * should see the honest figure. Every file records its DPI, so its physical
 * size is right whatever its pixel size.
 *
 * Covers carry no framing (the cover shows the first photo centred), so the
 * manifest points at the original for the cover rather than rendering it.
 */

import sharp from "sharp";
import type { BuilderDocument } from "@shared/document";
import { PAGE_INCHES, clampTilt, slotInches, tiltCover } from "../../client/src/features/builder/print";
import type { PageLayoutId } from "../../client/src/features/builder/data";
import { mediaStore, mediaUrl } from "../media";
import { storage } from "../storage";
import { enqueue, register } from "../jobs";
import { log } from "../logger";

export const PRINT_DPI = 300;

/** A placement as stored in the book document. */
export interface Framing {
  fx: number;
  fy: number;
  zoom: number;
  turn: 0 | 90 | 180 | 270;
  tilt?: number;
}

export interface RenderedSlot {
  jpeg: Buffer;
  width: number;
  height: number;
  dpi: number;
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5);

/**
 * Where the focal point lands after the photo is turned clockwise.
 * A point at (x, y) of the box goes to (1 - y, x) after 90°, (1 - x, 1 - y)
 * after 180°, and (y, 1 - x) after 270°.
 */
export function turnFocus(fx: number, fy: number, turn: Framing["turn"]): { fx: number; fy: number } {
  if (turn === 90) return { fx: 1 - fy, fy: fx };
  if (turn === 180) return { fx: 1 - fx, fy: 1 - fy };
  if (turn === 270) return { fx: fy, fy: 1 - fx };
  return { fx, fy };
}

/**
 * The rectangle of a W×H photo that a slot of aspect `slotW/slotH` shows,
 * in photo pixels. Steps, matching CSS:
 *   cover:   k = max(slotW / W, slotH / H)   (slot px per photo px)
 *   offset:  ox = (slotW − W·k) · fx         (object-position)
 *   zoom z about (fx·slotW, fy·slotH): slot point x shows pre-zoom point
 *            fx·slotW + (x − fx·slotW) / z
 * so slot x = 0 shows photo u = (fx·slotW·(1 − 1/z) − ox) / k, and the
 * slot's width covers slotW / (z·k) photo pixels.
 */
export function visibleRect(W: number, H: number, slotW: number, slotH: number, fx: number, fy: number, zoom: number) {
  const z = Number.isFinite(zoom) ? Math.max(1, zoom) : 1;
  const k = Math.max(slotW / W, slotH / H);
  const ox = (slotW - W * k) * fx;
  const oy = (slotH - H * k) * fy;
  const left = (fx * slotW * (1 - 1 / z) - ox) / k;
  const top = (fy * slotH * (1 - 1 / z) - oy) / k;
  return { left, top, width: slotW / (z * k), height: slotH / (z * k) };
}

/** Render one slot. `slot` is the slot's printed size in inches, as the editor uses it. */
export async function renderSlot(original: Buffer, slot: { w: number; h: number }, framing: Framing, maxDpi = PRINT_DPI): Promise<RenderedSlot> {
  const turn = framing.turn ?? 0;
  const tilt = clampTilt(framing.tilt);
  const zoom = Number.isFinite(framing.zoom) ? Math.max(1, framing.zoom) : 1;
  const cover = tiltCover(tilt, slot.w / slot.h);

  // a. upright, then turned. Raw pixels between steps, so nothing is re-encoded.
  const turned = await sharp(original, { limitInputPixels: 300e6 })
    .rotate()
    .rotate(turn)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = turned.info.width;
  const H = turned.info.height;
  const raw = { raw: { width: W, height: H, channels: turned.info.channels as 3 } };

  // Output resolution: what the photo can honestly supply, capped at 300 DPI.
  const nativeDpi = Math.min(W / slot.w, H / slot.h) / (zoom * cover);
  const dpi = Math.max(1, Math.min(maxDpi, Math.floor(nativeDpi)));
  const outW = Math.max(1, Math.round(slot.w * dpi));
  const outH = Math.max(1, Math.round(slot.h * dpi));

  // b. the visible rectangle, in photo pixels
  const { fx, fy } = turnFocus(clamp01(framing.fx), clamp01(framing.fy), turn);
  const r = visibleRect(W, H, outW, outH, fx, fy, zoom);
  const left = Math.max(0, Math.min(W - 1, Math.round(r.left)));
  const top = Math.max(0, Math.min(H - 1, Math.round(r.top)));
  const width = Math.max(1, Math.min(W - left, Math.round(r.width)));
  const height = Math.max(1, Math.min(H - top, Math.round(r.height)));

  // c. cut and resize; with a tilt, enlarge by the cover factor first
  const bigW = Math.round(outW * cover);
  const bigH = Math.round(outH * cover);
  let framed = await sharp(turned.data, raw)
    .extract({ left, top, width, height })
    .resize(bigW, bigH, { fit: "fill", kernel: "lanczos3" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (tilt) {
    const rotated = await sharp(framed.data, { raw: { width: bigW, height: bigH, channels: framed.info.channels as 3 } })
      .rotate(tilt, { background: "#ffffff" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    framed = await sharp(rotated.data, { raw: { width: rotated.info.width, height: rotated.info.height, channels: rotated.info.channels as 3 } })
      .extract({
        left: Math.round((rotated.info.width - outW) / 2),
        top: Math.round((rotated.info.height - outH) / 2),
        width: outW,
        height: outH,
      })
      .raw()
      .toBuffer({ resolveWithObject: true });
  }

  const jpeg = await sharp(framed.data, { raw: { width: framed.info.width, height: framed.info.height, channels: framed.info.channels as 3 } })
    .withMetadata({ density: dpi })
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4", mozjpeg: true })
    .toBuffer();
  return { jpeg, width: framed.info.width, height: framed.info.height, dpi };
}

/* ── The order job ───────────────────────────────────────────── */

export interface PrintManifestItem {
  /** 0-based index into the book's pages; page 0 is the title page */
  page: number;
  layout: PageLayoutId;
  /** collage only: tile positions are flipped left to right */
  mirror: boolean;
  slot: number;
  photoId: string;
  key: string;
  widthPx: number;
  heightPx: number;
  dpi: number;
  framing: Framing;
}

export interface PrintManifest {
  orderId: string;
  renderedAt: string;
  pageInches: { w: number; h: number };
  cover: { photoId: string; originalKey: string; coverStyle: string } | null;
  items: PrintManifestItem[];
  /** placed photos that couldn't be rendered, with why */
  problems: Array<{ page: number; slot: number; photoId: string; reason: string }>;
}

/** Where an order's print files live: inside its project, so the /media route's ownership check covers them. */
export const printPrefix = (projectId: string, orderId: string) => `projects/${projectId}/print/${orderId}`;
export const manifestKey = (projectId: string, orderId: string) => `${printPrefix(projectId, orderId)}/manifest.json`;

export async function readManifest(projectId: string, orderId: string): Promise<PrintManifest | null> {
  try {
    return JSON.parse((await mediaStore.get(manifestKey(projectId, orderId))).toString("utf8")) as PrintManifest;
  } catch {
    return null;
  }
}

/** Render every placed photo of an order, then write the manifest last, so its presence means "complete". */
export async function renderOrder(orderId: string): Promise<PrintManifest> {
  const order = await storage.getOrder(orderId);
  if (!order) throw new Error(`order ${orderId} not found`);
  const doc = order.documentSnapshot as BuilderDocument;
  const rows = new Map((await storage.getUploadedPhotos(order.projectId)).map((r) => [r.id, r]));
  const prefix = printPrefix(order.projectId, order.id);
  const manifest: PrintManifest = {
    orderId,
    renderedAt: new Date().toISOString(),
    pageInches: PAGE_INCHES,
    cover: null,
    items: [],
    problems: [],
  };

  const first = doc.photos[0] && rows.get(doc.photos[0].id);
  if (first?.storageKey) manifest.cover = { photoId: first.id, originalKey: first.storageKey, coverStyle: doc.coverStyle };

  // One original in memory at a time is plenty: a photo placed twice is rare.
  let cached = { key: "", bytes: Buffer.alloc(0) };
  for (let pageIndex = 0; pageIndex < doc.pages.length; pageIndex++) {
    const page = doc.pages[pageIndex];
    for (let slotIndex = 0; slotIndex < page.slots.length; slotIndex++) {
      const placement = page.slots[slotIndex];
      const row = rows.get(placement.photoId);
      const problem = (reason: string) => manifest.problems.push({ page: pageIndex, slot: slotIndex, photoId: placement.photoId, reason });
      if (!row?.storageKey) {
        problem("no stored original");
        continue;
      }
      if (!row.originalUploadedAt) {
        problem("original never finished uploading");
        continue;
      }
      try {
        if (cached.key !== row.storageKey) cached = { key: row.storageKey, bytes: await mediaStore.get(row.storageKey) };
        const layout = page.layout as PageLayoutId;
        const framing: Framing = { fx: placement.fx, fy: placement.fy, zoom: placement.zoom, turn: placement.turn, tilt: placement.tilt };
        const out = await renderSlot(cached.bytes, slotInches(layout, slotIndex, PAGE_INCHES), framing);
        const key = `${prefix}/page-${String(pageIndex).padStart(3, "0")}-slot-${slotIndex}.jpg`;
        await mediaStore.put(key, out.jpeg, "image/jpeg");
        manifest.items.push({
          page: pageIndex,
          layout,
          mirror: Boolean(page.mirror),
          slot: slotIndex,
          photoId: row.id,
          key,
          widthPx: out.width,
          heightPx: out.height,
          dpi: out.dpi,
          framing,
        });
      } catch (err) {
        problem(err instanceof Error ? err.message : "render failed");
      }
    }
  }

  await mediaStore.put(manifestKey(order.projectId, order.id), Buffer.from(JSON.stringify(manifest, null, 2)), "application/json");
  log.info(
    { orderId, files: manifest.items.length, problems: manifest.problems.length, lowDpi: manifest.items.filter((i) => i.dpi < 150).length },
    "[print] order rendered",
  );
  return manifest;
}

register("print.render", async (payload) => {
  await renderOrder((payload as { orderId: string }).orderId);
});

/** Queue an order's print files. Safe to call again: files are overwritten. */
export function queuePrintRender(orderId: string): void {
  enqueue("print.render", { orderId });
}

/** The public URL of a print file, for links. */
export const printFileUrl = (key: string) => mediaUrl(key);
