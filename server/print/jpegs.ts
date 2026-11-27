/**
 * Print JPEGs: one picture per printed SHEET, in one ZIP, for the printer
 * (owner, 2026-11-22: "jpeg according to sheet number, cover page, back, zip
 * the files"; 2026-11-28: the printer, a Noritsu QSS-3901G/3904G photo-paper
 * laser, "directly prints sheet not page separately"; docs/adr/026).
 *
 * What a sheet is: one photo print of an open spread, folded in the middle:
 * the two pages the customer saw side by side in the builder (toSpreads:
 * pages 1|2, 3|4, …). The files:
 *   00-cover-front.jpg                 the front cover, with its 3 mm bleed
 *   sheet-01-pages-01-02.jpg            pages 1 (left) and 2 (right)
 *   sheet-02-pages-03-04.jpg            …
 *   99-cover-back.jpg                   the back cover, with its 3 mm bleed
 *   readme.txt                          what the files are, for the printer
 *
 * Sheet size, from the printer's paper (owner's choice, 2026-11-28): the
 * Noritsu's widest roll is 12 in, exactly the page height, so a sheet is the
 * full 12 in tall edge to edge (no margin top and bottom) and 24 in plus the
 * 3 mm cutting margin at each outer end long: 12 × 24.24 in. Paper width 12 in,
 * paper advance 24.24 in, well inside its 36 in maximum.
 *
 * Resolution: 300 dpi by default, 640 dpi (the printer's native) when the
 * owner switches it on (Admin › Print queue › Print settings). A 640 dpi
 * sheet is 15,512 × 7,680 px, so pages are rendered in horizontal strips and
 * copied into one RGB buffer; memory is that buffer (357 MB at 640 dpi,
 * 79 MB at 300) plus one strip, never a whole page canvas on top.
 *
 * Why render the PDFs rather than draw the JPEGs a second way: the JPEG of a
 * page is then exactly the PDF page, pixel for pixel, whatever changes in the
 * page drawing later. pdf.js does the rendering (the same engine Firefox uses)
 * onto @napi-rs/canvas, which ships prebuilt binaries, so the server needs no
 * system packages.
 *
 * Why a hand-written ZIP: JPEGs don't compress further, so the entries are
 * STORED (no compression), and the format for that is a few dozen lines; it
 * streams to disk one entry at a time, so memory holds one page at most.
 */

import { createWriteStream, readFileSync } from "fs";
import { createRequire } from "module";
import path from "path";
import sharp from "sharp";

/** Render resolution, the same as the photos inside the PDF. */
const DPI = 300;

/* ── ZIP (stored entries) ───────────────────────────────────────── */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A ZIP written entry by entry. Call add() per file, then end(). */
function zipWriter(file: string) {
  const out = createWriteStream(file);
  let failure: unknown = null;
  out.on("error", (err) => (failure = err));
  let offset = 0;
  const central: Buffer[] = [];
  const write = (b: Buffer) =>
    new Promise<void>((resolve, reject) => {
      out.write(b, (err) => (err ? reject(err) : resolve()));
      offset += b.length;
    });
  // a fixed date (1 Jan 2026): the bytes then depend only on the pages
  const DOS_TIME = 0;
  const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
  return {
    async add(name: string, data: Buffer) {
      if (failure) throw failure;
      const nameBuf = Buffer.from(name, "utf8");
      const crc = crc32(data);
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4); // version needed
      local.writeUInt16LE(0x0800, 6); // UTF-8 names
      local.writeUInt16LE(0, 8); // stored
      local.writeUInt16LE(DOS_TIME, 10);
      local.writeUInt16LE(DOS_DATE, 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(data.length, 18);
      local.writeUInt32LE(data.length, 22);
      local.writeUInt16LE(nameBuf.length, 26);
      local.writeUInt16LE(0, 28);
      const at = offset;
      await write(Buffer.concat([local, nameBuf]));
      await write(data);
      const c = Buffer.alloc(46);
      c.writeUInt32LE(0x02014b50, 0);
      c.writeUInt16LE(20, 4);
      c.writeUInt16LE(20, 6);
      c.writeUInt16LE(0x0800, 8);
      c.writeUInt16LE(0, 10);
      c.writeUInt16LE(DOS_TIME, 12);
      c.writeUInt16LE(DOS_DATE, 14);
      c.writeUInt32LE(crc, 16);
      c.writeUInt32LE(data.length, 20);
      c.writeUInt32LE(data.length, 24);
      c.writeUInt16LE(nameBuf.length, 28);
      c.writeUInt32LE(at, 42);
      central.push(Buffer.concat([c, nameBuf]));
    },
    async end() {
      const start = offset;
      const dir = Buffer.concat(central);
      await write(dir);
      const e = Buffer.alloc(22);
      e.writeUInt32LE(0x06054b50, 0);
      e.writeUInt16LE(central.length, 8);
      e.writeUInt16LE(central.length, 10);
      e.writeUInt32LE(dir.length, 12);
      e.writeUInt32LE(start, 16);
      await write(e);
      await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
      if (failure) throw failure;
      return central.length;
    },
  };
}

/* ── PDF → pixels ───────────────────────────────────────────────── */

/** Resolutions the owner can choose (Admin › Print queue › Print settings). */
export const SHEET_DPI_OPTIONS = [300, 640] as const;
export type SheetDpi = (typeof SHEET_DPI_OPTIONS)[number];
export const DEFAULT_SHEET_DPI: SheetDpi = 300;

// big images go through sharp one at a time; its cache would only hold them longer
sharp.cache(false);

/** Rows rendered at a time: a 7,756 px wide strip of 512 rows is 16 MB of RGBA. */
const STRIP_ROWS = 512;
const PT = 72;
const MM = 72 / 25.4;

/** pdf.js and the canvas, loaded only when a print job runs. */
async function renderer() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createCanvas } = await import("@napi-rs/canvas");
  // the standard PDF fonts (Times, Helvetica) the pages use, shipped inside pdfjs-dist
  const fonts = path.join(path.dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json")), "standard_fonts") + path.sep;
  return { pdfjs, createCanvas, fonts };
}

type Renderer = Awaited<ReturnType<typeof renderer>>;
type PdfPage = Awaited<ReturnType<Awaited<ReturnType<Renderer["pdfjs"]["getDocument"]>["promise"]>["getPage"]>>;

/** An RGB picture being assembled, row-major, 3 bytes a pixel. */
interface Target {
  buf: Buffer;
  width: number;
  height: number;
}

/**
 * A picture filled with one colour. Pass `reuse` (same size) to refill it
 * instead of allocating: a 640 dpi sheet is 357 MB, and a fresh one per sheet
 * would sit in memory until the garbage collector ran.
 */
function blankTarget(width: number, height: number, hex: string, reuse?: Target): Target {
  const buf = reuse && reuse.width === width && reuse.height === height ? reuse.buf : Buffer.allocUnsafe(width * height * 3);
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex) ?? [, "ff", "ff", "ff"];
  const px = Buffer.from([parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)]);
  // fill by doubling: one pixel, then copy what is there over the rest
  px.copy(buf, 0);
  let filled = 3;
  while (filled < buf.length) {
    const n = Math.min(filled, buf.length - filled);
    buf.copy(buf, filled, 0, n);
    filled += n;
  }
  return { buf, width, height };
}

/**
 * Draw one PDF page into `t` with the page's top-left corner at (originX,
 * originY) in target pixels, painting only columns [x0, x1). Rendered strip by
 * strip so a 640 dpi page never needs a whole-page canvas.
 */
async function renderInto(r: Renderer, page: PdfPage, dpi: number, t: Target, originX: number, originY: number, x0: number, x1: number) {
  const viewport = page.getViewport({ scale: dpi / PT });
  const w = x1 - x0;
  // one canvas for every strip of this page: native canvases are freed only
  // when the garbage collector gets round to them, so new ones pile up
  const canvas = r.createCanvas(w, STRIP_ROWS);
  const ctx = canvas.getContext("2d");
  for (let y0 = 0; y0 < t.height; y0 += STRIP_ROWS) {
    const h = Math.min(STRIP_ROWS, t.height - y0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, STRIP_ROWS);
    // shift the page so this strip's corner (x0, y0) lands on the canvas's (0, 0)
    await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport, transform: [1, 0, 0, 1, originX - x0, originY - y0] }).promise;
    const rgb = await sharp(Buffer.from(ctx.getImageData(0, 0, w, h).data.buffer), { raw: { width: w, height: h, channels: 4 } })
      .removeAlpha()
      .raw()
      .toBuffer();
    for (let row = 0; row < h; row++) rgb.copy(t.buf, ((y0 + row) * t.width + x0) * 3, row * w * 3, (row + 1) * w * 3);
  }
}

/**
 * Encode the assembled picture. `optimiseCoding: false` matters: the
 * optimised Huffman pass holds the whole image's coefficients (1.4 GB for a
 * 640 dpi sheet, measured), while the plain pass streams in ~20 MB. It only
 * changes the file size a little, never a pixel.
 */
const toJpeg = (t: Target, dpi: number) =>
  sharp(t.buf, { raw: { width: t.width, height: t.height, channels: 3 } })
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4", optimiseCoding: false })
    .withMetadata({ density: dpi })
    .toBuffer();

/* ── sizes ─────────────────────────────────────────────────────── */

/**
 * The pixel geometry of a sheet at `dpi`, from the PDF page size (trim plus
 * bleed on every side, in points). Exported for the tests.
 */
export function sheetGeometry(pagePt: { w: number; h: number }, bleedMm: number, dpi: number) {
  const s = dpi / PT;
  const bleed = bleedMm * MM * s; // exact, in px
  const trimW = Math.round((pagePt.w - 2 * bleedMm * MM) * s);
  const trimH = Math.round((pagePt.h - 2 * bleedMm * MM) * s);
  const end = Math.round(bleed); // the margin kept at each outer end
  const fold = end + trimW;
  return {
    width: fold + trimW + end,
    height: trimH,
    fold,
    // where each page's own top-left corner (its bleed corner) goes on the sheet
    left: { x: end - bleed, y: -bleed },
    right: { x: fold - bleed, y: -bleed },
  };
}

/* ── names and the ZIP ─────────────────────────────────────────── */

const two = (n: number) => String(n).padStart(2, "0");

/** File names for the printer, in the ZIP's order. `sheet` counts from 1. */
export function jpegName(kind: "cover-front" | "cover-back" | "sheet", sheet = 1, pages = 2): string {
  if (kind === "cover-front") return "00-cover-front.jpg";
  if (kind === "cover-back") return "99-cover-back.jpg";
  const first = sheet * 2 - 1;
  return `sheet-${two(sheet)}-pages-${two(first)}${pages > 1 ? `-${two(first + 1)}` : ""}.jpg`;
}

/** How many JPEGs a book's ZIP holds: one per sheet, plus the covers. */
export const jpegCount = (interiorPages: number, coverPages: number) => Math.ceil(interiorPages / 2) + coverPages;

export interface JpegZipOptions {
  orderNumber: string;
  title: string;
  /** 300 (default) or 640 */
  dpi?: SheetDpi;
  /** the book's paper colour, for the empty half of a last sheet with one page */
  paper?: string;
  /** the bleed composeInterior drew, in mm (PRINT_SPEC.bleedMm) */
  bleedMm: number;
}

/**
 * Write the ZIP of JPEGs for one order: the covers as pages (with bleed), the
 * inside as sheets of two pages side by side. `coverPdf` has the front on page
 * 1 and the back on page 2 (composeCover). Returns how many JPEGs it holds.
 */
export async function composeJpegZip(interiorPdf: string, coverPdf: string, zipPath: string, info: JpegZipOptions): Promise<{ files: number; sheets: number; dpi: SheetDpi }> {
  const dpi: SheetDpi = info.dpi ?? DEFAULT_SHEET_DPI;
  const r = await renderer();
  const open = (file: string) => r.pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), disableFontFace: true, standardFontDataUrl: r.fonts, verbosity: 0 }).promise;
  const zip = zipWriter(zipPath);
  let jpegs = 0;

  // a cover page: the whole PDF page, bleed included
  const coverDoc = await open(coverPdf);
  const coverJpeg = async (n: number) => {
    const page = await coverDoc.getPage(n);
    const vp = page.getViewport({ scale: dpi / PT });
    const t = blankTarget(Math.round(vp.width), Math.round(vp.height), "#ffffff");
    await renderInto(r, page, dpi, t, 0, 0, 0, t.width);
    page.cleanup();
    return toJpeg(t, dpi);
  };

  let sheets = 0;
  let size = { width: 0, height: 0 };
  try {
    if (coverDoc.numPages >= 1) {
      await zip.add(jpegName("cover-front"), await coverJpeg(1));
      jpegs++;
    }
    const doc = await open(interiorPdf);
    try {
      const first = await doc.getPage(1);
      const [, , pw, ph] = first.view;
      const g = sheetGeometry({ w: pw, h: ph }, info.bleedMm, dpi);
      size = { width: g.width, height: g.height };
      let sheet: Target | undefined;
      for (let p = 1; p <= doc.numPages; p += 2) {
        sheets++;
        const t = (sheet = blankTarget(g.width, g.height, info.paper ?? "#ffffff", sheet));
        const left = await doc.getPage(p);
        await renderInto(r, left, dpi, t, g.left.x, g.left.y, 0, g.fold);
        left.cleanup();
        const hasRight = p + 1 <= doc.numPages;
        if (hasRight) {
          const right = await doc.getPage(p + 1);
          await renderInto(r, right, dpi, t, g.right.x, g.right.y, g.fold, g.width);
          right.cleanup();
        }
        await zip.add(jpegName("sheet", sheets, hasRight ? 2 : 1), await toJpeg(t, dpi));
        jpegs++;
      }
    } finally {
      await doc.destroy();
    }
    if (coverDoc.numPages >= 2) {
      await zip.add(jpegName("cover-back"), await coverJpeg(2));
      jpegs++;
    }
  } finally {
    await coverDoc.destroy();
  }

  const inches = (px: number) => (px / dpi).toFixed(2);
  const readme = [
    `TrueKeeps order ${info.orderNumber}: ${info.title}`,
    "",
    "One JPEG per printed sheet, in book order:",
    "  00-cover-front.jpg            the front cover (with 3 mm bleed on every side)",
    "  sheet-NN-pages-AA-BB.jpg      sheet NN: page AA on the left, page BB on the right,",
    "                                as one print, folded in the middle",
    "  99-cover-back.jpg             the back cover (with 3 mm bleed on every side)",
    "",
    `Sheets: ${sheets}. Each sheet is 12 in tall (the full paper width, edge to edge)`,
    `and 24 in plus 3 mm at each outer end long: ${size.width} x ${size.height} px`,
    `(${inches(size.width)} x ${inches(size.height)} in) at ${dpi} dpi, sRGB.`,
    "The fold is exactly in the middle of the 24 in. Trim 3 mm off each end.",
    "",
    "Rendered from interior.pdf and cover.pdf, so they match them exactly.",
    "",
  ].join("\r\n");
  await zip.add("readme.txt", Buffer.from(readme, "utf8"));
  await zip.end();
  return { files: jpegs, sheets, dpi };
}
