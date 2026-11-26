/**
 * Print PDFs — the book's pages and cover as files a printer can use.
 *
 * Input: the order's frozen book document and the manifest from
 * server/print/render.ts (every placed photo already cut from its HD original
 * with the customer's framing, at up to 300 DPI). Output: two PDFs streamed to
 * disk, never held whole in memory:
 *   interior.pdf  one PDF page per book page, trim 12×12 in + 3 mm bleed
 *   cover.pdf     the front cover (page 1) and back cover (page 2), same trim
 *                 + bleed, each cover style drawn as the preview draws it
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
 * Lettering: the book's font pair, embedded (server/print/fonts.ts), heading
 * face for titles and body face for the line under them and captions. Books
 * made before the pairs print in the standard PDF fonts (Helvetica / Times)
 * they always printed in. Covers made before 2026-11-22 in the retired styles
 * keep their simplified layout.
 */

import PDFDocument from "pdfkit";
import { createWriteStream } from "fs";
import sharp from "sharp";
import type { BuilderDocument } from "@shared/document";
import { bookTheme, contrastRatio, deriveTheme } from "../../client/src/features/builder/palette";
import { LOGO_PATHS, LOGO_VIEWBOX } from "./logo";
import { PATTERN_COVER_UNITS, PATTERN_PLATE, patternById, type CoverPattern } from "@shared/patterns";
import { CAPTION_SIZE } from "../../client/src/features/builder/data";
import { mediaStore } from "../media";
import { printFonts, type PrintFonts } from "./fonts";
import { renderSlot, type PrintManifest } from "./render";

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
  const fonts = await printFonts(pdf, doc.fontId);

  // Write as we go: PDFKit streams finished objects to the file, so memory stays flat.
  const file = streamTo(pdf, path);

  for (let p = 0; p < doc.pages.length; p++) {
    const page = doc.pages[p];
    const theme = page.bg ? deriveTheme(base, page.bg) : base;
    addPage(pdf, W, H, B, theme.page);

    if (page.layout === "title") {
      const title = doc.title || "";
      pdf.fillColor(theme.ink).font(fonts.head).fontSize(W * 0.07);
      pdf.text(title, B + W * 0.1, B + H * 0.38, { width: W * 0.8, align: "center" });
      const below = pdf.y + H * 0.02;
      pdf.rect(B + W / 2 - W * 0.07, below, W * 0.14, 2).fill(theme.accent);
      if (doc.subtitle) {
        pdf.fillColor(theme.ink).opacity(0.65).font(fonts.label).fontSize(W * 0.03);
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
      // golden-ratio type scale (CAPTION_SIZE in the client's data.ts); handwriting reads small
      const size = W * (doc.fontId === "script" ? 0.03 : CAPTION_SIZE);
      pdf.font(fonts.body).fontSize(size);
      if (page.layout === "full") {
        const tw = Math.min(pdf.widthOfString(caption) + size * 2, W * 0.86);
        const y = B + H * 0.93 - size * 1.6;
        pdf.save().fillColor(theme.page).opacity(0.88).roundedRect(B + (W - tw) / 2, y, tw, size * 1.6, size * 0.8).fill().restore();
        pdf.fillColor(theme.ink).text(caption, B + (W - tw) / 2, y + size * 0.3, { width: tw, align: "center", lineBreak: false, ellipsis: true });
      } else if (page.layout === "grid") {
        // the band the page's photos made room for (captionFrames): 86% down to the foot
        pdf.fillColor(theme.ink).text(caption, B + W * 0.08, B + H * 0.9, { width: W * 0.84, height: H * 0.07, align: "center", ellipsis: true });
      } else {
        pdf.fillColor(theme.ink).text(caption, B + W * 0.075, B + H * 0.937, { width: W * 0.85, align: "center", lineBreak: false, ellipsis: true });
      }
    }
  }

  await file.end();
  return { pages: doc.pages.length, lowDpi, missing };
}

/**
 * A cover pattern across the whole page, bleed included (shared/patterns.ts).
 * The tile grid starts at the trim's top-left corner, as the preview's does,
 * so the same flowers sit in the same places; the bleed gets the tiles that
 * run off the edge.
 */
function drawPattern(pdf: Pdf, pat: CoverPattern, W: number, H: number, B: number) {
  const u = W / PATTERN_COVER_UNITS;
  const t = pat.tile * u;
  pdf.save();
  pdf.rect(0, 0, W + 2 * B, H + 2 * B).fill(pat.ground);
  pdf.rect(0, 0, W + 2 * B, H + 2 * B).clip();
  for (let ty = B - Math.ceil(B / t) * t; ty < H + 2 * B; ty += t)
    for (let tx = B - Math.ceil(B / t) * t; tx < W + 2 * B; tx += t)
      for (const sh of pat.shapes) {
        const x = tx + sh.x * u;
        const y = ty + sh.y * u;
        pdf.save().fillOpacity(sh.opacity ?? 1);
        if (sh.kind === "circle") pdf.circle(x, y, sh.r * u).fill(sh.fill);
        else pdf.rotate(sh.rotate, { origin: [x, y] }).ellipse(x, y, sh.rx * u, sh.ry * u).fill(sh.fill);
        pdf.restore();
      }
  pdf.restore();
}

/** Indigo, the logo's colour on a light cover (brand kit). */
const LOGO_INDIGO = "#2A1E5C";

/**
 * The logo's colour on a page (owner, 2026-11-22: "condition for logo with
 * matching to color"): indigo when it reads clearly (WCAG 4.5:1 or better),
 * otherwise white. Measured, so a custom page colour works too.
 */
export function logoColourOn(pageHex: string): string {
  return contrastRatio(LOGO_INDIGO, pageHex) >= 4.5 ? LOGO_INDIGO : "#FFFFFF";
}

/** The cover photo cut to w × h inches at 300 DPI (cover-fit, centred), or null. */
async function coverPhoto(manifest: PrintManifest, wIn: number, hIn: number, doc?: BuilderDocument): Promise<Buffer | null> {
  if (!manifest.cover) return null;
  // framed in the editor (CoverAdjust.tsx): cut it exactly as page photos are cut
  const frame = doc?.coverFrame;
  if (frame && frame.photoId === manifest.cover.photoId) {
    const r = await renderSlot(await mediaStore.get(manifest.cover.originalKey), { w: wIn, h: hIn }, frame);
    return r.jpeg;
  }
  return sharp(await mediaStore.get(manifest.cover.originalKey))
    .rotate()
    .resize(Math.round(wIn * 300), Math.round(hIn * 300), { fit: "cover", position: "centre", withoutEnlargement: false })
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

/**
 * The title, a short rule and the line under it, centred on `cx` and
 * vertically centred on `cy`, never wider than 6 in (half the cover) and never
 * more than two lines: the title steps down in size until it fits, as the
 * preview does (builder.css .bb-cover-title). Sizes follow the golden-ratio
 * scale: title 0.054 of the cover, the line under it ÷ 1.618.
 */
function coverWords(pdf: Pdf, doc: BuilderDocument, fonts: PrintFonts, theme: ReturnType<typeof bookTheme>, W: number, cx: number, cy: number, withRule: boolean) {
  const title = (doc.title || "").trim();
  const sub = (doc.subtitle ?? "").trim();
  const maxW = W * 0.5;
  let size = W * (doc.fontId === "script" ? 0.07 : 0.054);
  const titleFont = fonts.head;
  pdf.font(titleFont).fontSize(size);
  while (title && pdf.heightOfString(title, { width: maxW, align: "center" }) > size * 2.5 && size > W * 0.03) {
    size *= 0.94;
    pdf.fontSize(size);
  }
  const titleH = title ? pdf.heightOfString(title, { width: maxW, align: "center" }) : 0;
  const subSize = size / 1.618;
  const gap = size * 0.4;
  const ruleH = withRule ? 2 : 0;
  const subH = sub ? subSize * 1.3 : 0;
  const total = titleH + (withRule ? gap + ruleH : 0) + (sub ? gap + subH : 0);
  let y = cy - total / 2;
  if (title) {
    pdf.fillColor(theme.ink).font(titleFont).fontSize(size).text(title, cx - maxW / 2, y, { width: maxW, align: "center" });
    y += titleH;
  }
  if (withRule) {
    y += gap;
    pdf.rect(cx - W * 0.03, y, W * 0.06, ruleH).fill(theme.accent);
    y += ruleH;
  }
  if (sub) {
    y += gap;
    pdf.fillColor(theme.ink).font(fonts.body).fontSize(subSize).text(sub, cx - maxW / 2, y, { width: maxW, align: "center", lineBreak: false, ellipsis: true });
  }
}

/**
 * Compose cover.pdf: page 1 the front, page 2 the back (owner, 2026-11-22:
 * the printer gets the cover and the back; the spine waits for the printer's
 * spine width, which depends on the paper and page count).
 *
 * The front is drawn per cover style, with the same geometry as the preview
 * (builder.css / upload.css), so what was approved is what prints:
 *   classic ("Minimal")   inside a 0.75 in margin, a square photo centred in
 *                         the top 61.8%, the words centred in the 38.2% below
 *   moment ("Full Picture") the photo inside a 0.5 in border, no words
 *   minimal ("Just text") the words centred on the 38.2% line
 *   pattern               the pattern across the cover and bleed, the words
 *                         on a plate whose top is on the 61.8% line
 *   older styles          the photo full-bleed with the title in a band at
 *                         the foot, as these books printed before
 * The back is the page colour with the logo 4 in wide, centred, 1 in up from
 * the bottom edge, indigo or white by contrast (logoColourOn).
 */
export async function composeCover(doc: BuilderDocument, manifest: PrintManifest, path: string): Promise<{ pages: number }> {
  const { pdf, W, H, B } = newPdf(`${doc.title || "TrueKeeps book"} (cover)`);
  const theme = bookTheme(doc.themeId, doc.pageColor);
  const file = streamTo(pdf, path);
  const inch = PT_PER_IN;
  const style = doc.coverStyle;
  const fonts = await printFonts(pdf, doc.fontId);

  // ── front
  addPage(pdf, W, H, B, theme.page);
  if (style === "classic") {
    const m = W * 0.0625;
    const live = H - 2 * m;
    const photoPart = live * 0.618;
    const side = photoPart * 0.92;
    const img = await coverPhoto(manifest, side / inch, side / inch, doc);
    const x = B + (W - side) / 2;
    const y = B + m + (photoPart - side) / 2;
    if (img) pdf.image(img, x, y, { width: side, height: side });
    else pdf.rect(x, y, side, side).fill(theme.soft);
    coverWords(pdf, doc, fonts, theme, W, B + W / 2, B + m + photoPart + (live * 0.382) / 2, true);
  } else if (style === "moment") {
    const border = W * 0.041667;
    const img = await coverPhoto(manifest, (W - 2 * border) / inch, (H - 2 * border) / inch, doc);
    if (img) pdf.image(img, B + border, B + border, { width: W - 2 * border, height: H - 2 * border });
  } else if (style === "minimal") {
    coverWords(pdf, doc, fonts, theme, W, B + W / 2, B + H * 0.382, true);
  } else if (style === "pattern") {
    drawPattern(pdf, patternById(doc.coverPattern), W, H, B);
    const pat = patternById(doc.coverPattern);
    const P = PATTERN_PLATE;
    pdf.rect(B + P.x * W, B + P.y * H, P.w * W, P.h * H).fill(pat.plate);
    coverWords(pdf, doc, fonts, { ...theme, ink: pat.ink, accent: pat.ink }, W, B + (P.x + P.w / 2) * W, B + (P.y + P.h / 2) * H, true);
  } else {
    // older styles (Full photo, Framed, Split, Truekeeps Design): as before
    if (manifest.cover) {
      const px = Math.round((PRINT_SPEC.trimInches.w + (2 * PRINT_SPEC.bleedMm) / 25.4) * 300);
      const jpeg = await sharp(await mediaStore.get(manifest.cover.originalKey))
        .rotate()
        .resize(px, px, { fit: "cover", position: "centre", withoutEnlargement: false })
        .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
        .toBuffer();
      pdf.image(jpeg, 0, 0, { width: W + 2 * B, height: H + 2 * B });
    }
    if (doc.title) {
      const size = W * 0.054;
      pdf.save().fillColor("#000000").opacity(0.35).rect(0, B + H * 0.72, W + 2 * B, H * 0.28 + B).fill().restore();
      pdf.fillColor("#FFFFFF").font(fonts.head).fontSize(size);
      pdf.text(doc.title, B + W * 0.08, B + H * 0.78, { width: W * 0.84, align: "left" });
      if (doc.subtitle) pdf.font(fonts.body).fontSize(size / 1.618).text(doc.subtitle, { width: W * 0.84 });
    }
  }

  // ── back: the page colour, or a patterned book's ground
  const backColour = style === "pattern" ? patternById(doc.coverPattern).ground : theme.page;
  addPage(pdf, W, H, B, backColour);
  const logoW = 4 * inch;
  const scale = logoW / LOGO_VIEWBOX.w;
  const logoH = LOGO_VIEWBOX.h * scale;
  pdf.save();
  pdf.translate(B + (W - logoW) / 2, B + H - inch - logoH).scale(scale);
  const colour = logoColourOn(backColour);
  for (const d of LOGO_PATHS) pdf.path(d).fill(colour);
  pdf.restore();

  await file.end();
  return { pages: 2 };
}
