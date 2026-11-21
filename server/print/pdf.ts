/**
 * Print PDFs — the book's pages and cover as files a printer can use.
 *
 * Input: the order's frozen book document and the manifest from
 * server/print/render.ts (every placed photo already cut from its HD original
 * with the customer's framing, at up to 300 DPI). Output: two PDFs streamed to
 * disk, never held whole in memory:
 *   interior.pdf  one PDF page per book page, trim 12×12 in + 3 mm bleed
 *   cover.pdf     the front cover at the same trim + bleed
 *
 * The print spec (trim, bleed) is PRINT_SPEC below; when the printer sends
 * theirs, that is the one place to change.
 *
 * Page geometry is transcribed from builder.css, the same source
 * client/src/features/builder/print.ts uses for slot sizes:
 *   - .bb-page padding 7.5% → content box 0.075 … 0.925
 *   - single / duo / duo-side / trio-strip: flex/grid inside that box
 *   - collage: the c0/c1/c2 absolute rules, with their small rotations
 *   - grid (the layout engine): each slot's own rectangle (page.frames)
 *   - full, and grid cells touching an edge: run out into the bleed
 * Photos are drawn into their slot with cover fit, so the pixels the renderer
 * cut land exactly where the editor showed them. Page colours come from the
 * client's own palette code (bookTheme / deriveTheme).
 *
 * What is approximate in this version (flagged on the order in the admin):
 * captions, the title page and the cover's title use standard PDF fonts
 * (Helvetica / Times) rather than the book's chosen lettering, and the cover
 * is drawn as a full-bleed photo with the title, not each cover style.
 */

import PDFDocument from "pdfkit";
import { createWriteStream } from "fs";
import sharp from "sharp";
import type { BuilderDocument } from "@shared/document";
import { bookTheme, deriveTheme } from "../../client/src/features/builder/palette";
import { mediaStore } from "../media";
import type { PrintManifest } from "./render";

const PT_PER_IN = 72;
const MM = PT_PER_IN / 25.4;

/** The default print spec (owner's choice until the printer confirms theirs). */
export const PRINT_SPEC = {
  trimInches: { w: 12, h: 12 },
  bleedMm: 3,
  /** below this a photo is flagged as possibly soft */
  warnDpi: 200,
};

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Slot extends Box {
  rotate?: number;
}

/** Slot rectangles as fractions of the page for the named layouts. */
function namedSlots(layout: string, mirror: boolean): Slot[] {
  const c = { x: 0.075, y: 0.075, w: 0.85, h: 0.85 };
  switch (layout) {
    case "full":
      return [{ x: 0, y: 0, w: 1, h: 1 }];
    case "single":
      return [c];
    case "duo":
      return [
        { x: c.x, y: c.y, w: c.w, h: 0.4 },
        { x: c.x, y: c.y + 0.45, w: c.w, h: 0.4 },
      ];
    case "duo-side":
      return [
        { x: c.x, y: c.y, w: 0.4, h: c.h },
        { x: c.x + 0.45, y: c.y, w: 0.4, h: c.h },
      ];
    case "trio-strip": {
      const h = 0.26 * (4 / 3);
      const y = (1 - h) / 2;
      return [0, 1, 2].map((i) => ({ x: c.x + i * (0.26 + 0.035), y, w: 0.26, h }));
    }
    case "collage":
      return mirror
        ? [
            { x: 1 - 0.07 - 0.56, y: 0.08, w: 0.56, h: 0.56, rotate: 2.5 },
            { x: 0.06, y: 0.22, w: 0.38, h: 0.38, rotate: -2 },
            { x: 1 - 0.22 - 0.48, y: 1 - 0.07 - 0.34, w: 0.48, h: 0.34, rotate: -1.2 },
          ]
        : [
            { x: 0.07, y: 0.08, w: 0.56, h: 0.56, rotate: -2.5 },
            { x: 1 - 0.06 - 0.38, y: 0.22, w: 0.38, h: 0.38, rotate: 2 },
            { x: 0.22, y: 1 - 0.07 - 0.34, w: 0.48, h: 0.34, rotate: 1.2 },
          ];
    default:
      return [];
  }
}

type Pdf = InstanceType<typeof PDFDocument>;

function newPdf(title: string): { pdf: Pdf; W: number; H: number; B: number } {
  const W = PRINT_SPEC.trimInches.w * PT_PER_IN;
  const H = PRINT_SPEC.trimInches.h * PT_PER_IN;
  const B = PRINT_SPEC.bleedMm * MM;
  const pdf = new PDFDocument({ autoFirstPage: false, compress: true, info: { Title: title, Producer: "TrueKeeps", Creator: "TrueKeeps print pipeline" } });
  return { pdf, W, H, B };
}

function addPage(pdf: Pdf, W: number, H: number, B: number, colour: string) {
  pdf.addPage({ size: [W + 2 * B, H + 2 * B], margin: 0 });
  // Trim and bleed boxes tell the printer where the cut goes.
  const dict = (pdf.page as unknown as { dictionary: { data: Record<string, unknown> } }).dictionary.data;
  dict.TrimBox = [B, B, B + W, B + H];
  dict.BleedBox = [0, 0, W + 2 * B, H + 2 * B];
  pdf.rect(0, 0, W + 2 * B, H + 2 * B).fill(colour);
}

/**
 * Stream the document into `path` as it is drawn. Returns `end()`: call it
 * after the last page; it resolves once the file is completely on disk. Any
 * stream error is held and re-thrown by end(), never left unhandled.
 */
function streamTo(pdf: Pdf, path: string): { end: () => Promise<void> } {
  let failure: unknown = null;
  const written = new Promise<void>((resolve, reject) => {
    const out = createWriteStream(path);
    out.on("finish", () => resolve());
    out.on("error", reject);
    pdf.on("error", reject);
    pdf.pipe(out);
  }).catch((err) => {
    failure = err;
  });
  return {
    end: async () => {
      pdf.end();
      await written;
      if (failure) throw failure;
    },
  };
}

const fontFor = (fontId: string | undefined, bold = false) =>
  fontId === "modern" ? (bold ? "Helvetica-Bold" : "Helvetica") : fontId === "script" ? "Times-Italic" : bold ? "Times-Bold" : "Times-Roman";

export interface InteriorResult {
  pages: number;
  /** slots drawn from a photo below PRINT_SPEC.warnDpi */
  lowDpi: number;
  /** slots with no rendered photo (see manifest.problems) */
  missing: number;
}

/**
 * Compose interior.pdf. Pages are drawn in book order; each slot's rendered
 * photo is read from storage, drawn, and dropped before the next is read.
 */
export async function composeInterior(doc: BuilderDocument, manifest: PrintManifest, path: string): Promise<InteriorResult> {
  const { pdf, W, H, B } = newPdf(doc.title || "TrueKeeps book");
  const byPage = new Map<number, PrintManifest["items"]>();
  for (const it of manifest.items) byPage.set(it.page, [...(byPage.get(it.page) ?? []), it]);
  const base = bookTheme(doc.themeId, doc.pageColor);
  const edge = doc.edge ?? "clean";
  let lowDpi = 0;
  let missing = 0;

  // Write as we go: PDFKit streams finished objects to the file, so memory stays flat.
  const file = streamTo(pdf, path);

  for (let p = 0; p < doc.pages.length; p++) {
    const page = doc.pages[p];
    const theme = page.bg ? deriveTheme(base, page.bg) : base;
    addPage(pdf, W, H, B, theme.page);

    if (page.layout === "title") {
      const title = doc.title || "";
      pdf.fillColor(theme.ink).font(fontFor(doc.fontId, true)).fontSize(W * 0.07);
      pdf.text(title, B + W * 0.1, B + H * 0.38, { width: W * 0.8, align: "center" });
      const below = pdf.y + H * 0.02;
      pdf.rect(B + W / 2 - W * 0.07, below, W * 0.14, 2).fill(theme.accent);
      if (doc.subtitle) {
        pdf.fillColor(theme.ink).opacity(0.65).font("Helvetica").fontSize(W * 0.03);
        pdf.text(doc.subtitle.toUpperCase(), B + W * 0.1, below + H * 0.03, { width: W * 0.8, align: "center", characterSpacing: W * 0.003 });
        pdf.opacity(1);
      }
      continue;
    }

    const slots: Slot[] =
      page.layout === "grid" ? (page.frames ?? []).map((f) => ({ x: f.x, y: f.y, w: f.w, h: f.h })) : namedSlots(page.layout, Boolean(page.mirror));
    const items = byPage.get(p) ?? [];

    for (let i = 0; i < page.slots.length; i++) {
      const fr = slots[i] ?? { x: 0, y: 0, w: 1, h: 1 };
      const item = items.find((it) => it.slot === i);
      const touches = { l: fr.x <= 0.001, t: fr.y <= 0.001, r: fr.x + fr.w >= 0.999, b: fr.y + fr.h >= 0.999 };
      const bleedCell = page.layout === "full" || (page.layout === "grid" && (touches.l || touches.t || touches.r || touches.b));
      // run edge-touching slots out into the bleed so the cut never shows paper
      const box: Box = {
        x: B + fr.x * W - (touches.l ? B : 0),
        y: B + fr.y * H - (touches.t ? B : 0),
        w: fr.w * W + (touches.l ? B : 0) + (touches.r ? B : 0),
        h: fr.h * H + (touches.t ? B : 0) + (touches.b ? B : 0),
      };
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;

      pdf.save();
      if (fr.rotate) pdf.rotate(fr.rotate, { origin: [cx, cy] });
      if (edge === "soft" && !bleedCell) pdf.roundedRect(box.x, box.y, box.w, box.h, W * 0.022).clip();
      else pdf.rect(box.x, box.y, box.w, box.h).clip();
      if (item) {
        const jpeg = await mediaStore.get(item.key);
        pdf.image(jpeg, box.x, box.y, { cover: [box.w, box.h], align: "center", valign: "center" });
        if (item.dpi < PRINT_SPEC.warnDpi) lowDpi++;
      } else {
        missing++;
        pdf.rect(box.x, box.y, box.w, box.h).fill(theme.soft);
      }
      pdf.restore();

      if (edge === "border" && !bleedCell) {
        const bw = W * 0.011;
        pdf.save();
        if (fr.rotate) pdf.rotate(fr.rotate, { origin: [cx, cy] });
        pdf.lineWidth(bw).strokeColor("#FFFFFF").rect(box.x - bw / 2, box.y - bw / 2, box.w + bw, box.h + bw).stroke();
        pdf.restore();
      }
    }

    const caption = page.caption?.trim();
    if (caption && !doc.captionsHidden) {
      const size = W * (doc.fontId === "script" ? 0.04 : 0.026);
      pdf.font(fontFor(doc.fontId)).fontSize(size);
      if (page.layout === "full") {
        const tw = Math.min(pdf.widthOfString(caption) + size * 2, W * 0.86);
        const y = B + H * 0.93 - size * 1.6;
        pdf.save().fillColor(theme.page).opacity(0.88).roundedRect(B + (W - tw) / 2, y, tw, size * 1.6, size * 0.8).fill().restore();
        pdf.fillColor(theme.ink).text(caption, B + (W - tw) / 2, y + size * 0.3, { width: tw, align: "center", lineBreak: false, ellipsis: true });
      } else {
        pdf.fillColor(theme.ink).text(caption, B + W * 0.075, B + H * 0.937, { width: W * 0.85, align: "center", lineBreak: false, ellipsis: true });
      }
    }
  }

  await file.end();
  return { pages: doc.pages.length, lowDpi, missing };
}

/**
 * Compose cover.pdf: the cover photo (from the manifest, so it follows the
 * same cover choice as the renderer) full-bleed, the title in a band at the
 * foot. Returns 0 pages when the book has no cover photo stored.
 */
export async function composeCover(doc: BuilderDocument, manifest: PrintManifest, path: string): Promise<{ pages: number }> {
  const { pdf, W, H, B } = newPdf(`${doc.title || "TrueKeeps book"} (cover)`);
  const theme = bookTheme(doc.themeId, doc.pageColor);
  const file = streamTo(pdf, path);
  addPage(pdf, W, H, B, theme.page);
  if (manifest.cover) {
    // the cover carries no framing: centre-crop the original to the cover at 300 DPI
    const px = Math.round((PRINT_SPEC.trimInches.w + (2 * PRINT_SPEC.bleedMm) / 25.4) * 300);
    const jpeg = await sharp(await mediaStore.get(manifest.cover.originalKey))
      .rotate()
      .resize(px, px, { fit: "cover", position: "centre", withoutEnlargement: false })
      .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
      .toBuffer();
    pdf.image(jpeg, 0, 0, { width: W + 2 * B, height: H + 2 * B });
  }
  if (doc.title) {
    const size = W * 0.065;
    pdf.save().fillColor("#000000").opacity(0.35).rect(0, B + H * 0.72, W + 2 * B, H * 0.28 + B).fill().restore();
    pdf.fillColor("#FFFFFF").font(fontFor(doc.fontId, true)).fontSize(size);
    pdf.text(doc.title, B + W * 0.08, B + H * 0.78, { width: W * 0.84, align: "left" });
    if (doc.subtitle) pdf.font("Helvetica").fontSize(W * 0.026).text(doc.subtitle.toUpperCase(), { width: W * 0.84, characterSpacing: W * 0.002 });
  }
  await file.end();
  return { pages: 1 };
}
