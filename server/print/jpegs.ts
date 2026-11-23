/**
 * Print JPEGs — every printed side of the book as a JPEG, in one ZIP
 * (owner, 2026-11-22: "jpeg according to sheet number, cover page, back, zip
 * the files"; "just want to give them what to print").
 *
 * What: renders the two PDFs the pipeline has just composed (interior.pdf and
 * cover.pdf, see pdf.ts) page by page at 300 DPI, and stores the JPEGs in a
 * ZIP named for the printer:
 *   00-cover-front.jpg
 *   sheet-01-front.jpg, sheet-01-back.jpg   (pages 1 and 2: one leaf)
 *   sheet-02-front.jpg, ...                 (pages 3 and 4, and so on)
 *   99-cover-back.jpg
 *   readme.txt                              what the files are
 * Each JPEG is the full page with its 3 mm bleed (12 × 12 in trim), sRGB,
 * 300 DPI written into the file.
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

/* ── PDF → JPEG ─────────────────────────────────────────────────── */

/** pdf.js and the canvas, loaded only when a print job runs. */
async function renderer() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createCanvas } = await import("@napi-rs/canvas");
  // the standard PDF fonts (Times, Helvetica) the pages use, shipped inside pdfjs-dist
  const fonts = path.join(path.dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json")), "standard_fonts") + path.sep;
  return { pdfjs, createCanvas, fonts };
}

/** Each page of a PDF as a 300 DPI JPEG, one at a time. */
async function* pagesOf(pdfPath: string): AsyncGenerator<Buffer> {
  const { pdfjs, createCanvas, fonts } = await renderer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(pdfPath)), disableFontFace: true, standardFontDataUrl: fonts, verbosity: 0 }).promise;
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const vp = page.getViewport({ scale: DPI / 72 });
      const w = Math.round(vp.width);
      const h = Math.round(vp.height);
      const canvas = createCanvas(w, h);
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport: vp }).promise;
      const raw = Buffer.from(ctx.getImageData(0, 0, w, h).data.buffer);
      yield await sharp(raw, { raw: { width: w, height: h, channels: 4 } })
        .removeAlpha()
        .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
        .withMetadata({ density: DPI })
        .toBuffer();
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
}

/** File names for the printer, in the ZIP's order. */
export function jpegName(kind: "cover-front" | "cover-back" | "page", pageIndex = 0): string {
  if (kind === "cover-front") return "00-cover-front.jpg";
  if (kind === "cover-back") return "99-cover-back.jpg";
  const sheet = String(Math.floor(pageIndex / 2) + 1).padStart(2, "0");
  return `sheet-${sheet}-${pageIndex % 2 === 0 ? "front" : "back"}.jpg`;
}

/**
 * Write the ZIP of JPEGs for one order. `coverPdf` has the front on page 1
 * and the back on page 2 (composeCover). Returns how many JPEGs it holds.
 */
export async function composeJpegZip(interiorPdf: string, coverPdf: string, zipPath: string, info: { orderNumber: string; title: string }): Promise<{ files: number }> {
  const zip = zipWriter(zipPath);
  const cover: Buffer[] = [];
  for await (const jpg of pagesOf(coverPdf)) cover.push(jpg);
  let jpegs = 0;
  if (cover[0]) {
    await zip.add(jpegName("cover-front"), cover[0]);
    jpegs++;
  }
  let i = 0;
  for await (const jpg of pagesOf(interiorPdf)) {
    await zip.add(jpegName("page", i++), jpg);
    jpegs++;
  }
  if (cover[1]) {
    await zip.add(jpegName("cover-back"), cover[1]);
    jpegs++;
  }
  const readme = [
    `TrueKeeps order ${info.orderNumber}: ${info.title}`,
    "",
    "Every printed side of the book, one JPEG each:",
    "  00-cover-front.jpg       the front cover",
    "  sheet-NN-front.jpg       sheet NN, front side (pages 1, 3, 5 ...)",
    "  sheet-NN-back.jpg        sheet NN, back side (pages 2, 4, 6 ...)",
    "  99-cover-back.jpg        the back cover",
    "",
    "Each file: 12 x 12 in trim plus 3 mm bleed on every side, 300 dpi, sRGB.",
    "The same pages as interior.pdf and cover.pdf, rendered from them.",
    "",
  ].join("\r\n");
  await zip.add("readme.txt", Buffer.from(readme, "utf8"));
  await zip.end();
  return { files: jpegs };
}
