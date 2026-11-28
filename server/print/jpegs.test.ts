/**
 * Checks the printer's sheet JPEGs (server/print/jpegs.ts, docs/adr/026).
 * Run: npx tsx server/print/jpegs.test.ts [640]   (exits 1 on a failure)
 *
 * Builds a 5-page interior PDF and a 2-page cover PDF the same size as
 * pdf.ts makes (12 × 12 in trim + 3 mm bleed), where the bleed is painted red
 * and each page a different colour, then makes the ZIP and checks, from the
 * pixels:
 *  - one JPEG per sheet (3 for 5 pages) plus the two covers, named in order
 *  - each sheet is 24 in + 2 × 3 mm long and exactly 12 in tall
 *  - the fold sits at the middle: left page colour just before it, right page
 *    colour just after it, no red at the fold
 *  - red (bleed) survives only at the two outer ends, and never at the top or
 *    bottom rows (the top and bottom bleed is cut, the paper is 12 in)
 *  - the last sheet, with one page, has its right half in the paper colour
 *  - the covers keep their bleed on every side
 * and prints the time and the peak memory.
 */

import assert from "node:assert/strict";
import { createWriteStream, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import PDFDocument from "pdfkit";
import sharp from "sharp";
import { composeJpegZip, jpegCount, jpegName, sheetGeometry, type SheetDpi } from "./jpegs";

const dpi = (Number(process.argv[2]) || 300) as SheetDpi;
const BLEED_MM = 3;
const B = (BLEED_MM * 72) / 25.4;
const TRIM = 12 * 72;
const SIZE = TRIM + 2 * B;
const PAGE_COLOURS = ["#1f4fd1", "#16a34a", "#f59e0b", "#7c3aed", "#0891b2"];
const PAPER = "#fbf6f0";

function makePdf(file: string, colours: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ autoFirstPage: false });
    const out = createWriteStream(file);
    out.on("finish", resolve).on("error", reject);
    pdf.pipe(out);
    colours.forEach((c, i) => {
      pdf.addPage({ size: [SIZE, SIZE], margin: 0 });
      pdf.rect(0, 0, SIZE, SIZE).fill("#ff0000"); // the bleed
      pdf.rect(B, B, TRIM, TRIM).fill(c); // the page itself
      pdf.fillColor("#ffffff").fontSize(120).text(`P${i + 1}`, B + 100, B + 100);
    });
    pdf.end();
  });
}

/** The ZIP's stored entries, read from the local headers. */
function unzip(file: string): Map<string, Buffer> {
  const z = readFileSync(file);
  const out = new Map<string, Buffer>();
  let o = 0;
  while (z.readUInt32LE(o) === 0x04034b50) {
    const size = z.readUInt32LE(o + 18);
    const nameLen = z.readUInt16LE(o + 26);
    const extra = z.readUInt16LE(o + 28);
    const name = z.toString("utf8", o + 30, o + 30 + nameLen);
    const start = o + 30 + nameLen + extra;
    out.set(name, z.subarray(start, start + size));
    o = start + size;
  }
  return out;
}

const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const near = (px: number[], h: string, tol = 24) => hex(h).every((v, i) => Math.abs(v - px[i]) <= tol);

async function pixels(jpg: Buffer) {
  const { data, info } = await sharp(jpg).raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => {
    const i = (y * info.width + x) * info.channels;
    return [data[i], data[i + 1], data[i + 2]];
  };
  return { info, at };
}

const work = process.env.KEEP_DIR || mkdtempSync(path.join(tmpdir(), "tk-sheets-"));
const interior = path.join(work, "interior.pdf");
const cover = path.join(work, "cover.pdf");
await makePdf(interior, PAGE_COLOURS);
await makePdf(cover, ["#334155", "#475569"]);

const base = process.memoryUsage().rss;
let peak = base;
const timer = setInterval(() => (peak = Math.max(peak, process.memoryUsage().rss)), 50);
const t0 = Date.now();
const zipPath = path.join(work, "jpegs.zip");
const res = await composeJpegZip(interior, cover, zipPath, { orderNumber: "TK-TEST01", title: "Test", dpi, paper: PAPER, bleedMm: BLEED_MM });
const secs = (Date.now() - t0) / 1000;
clearInterval(timer);

const files = unzip(zipPath);
assert.equal(res.files, jpegCount(5, 2));
assert.equal(res.sheets, 3);
assert.deepEqual(Array.from(files.keys()), ["00-cover-front.jpg", "sheet-01-pages-01-02.jpg", "sheet-02-pages-03-04.jpg", "sheet-03-pages-05.jpg", "99-cover-back.jpg", "readme.txt"]);
assert.equal(jpegName("sheet", 12, 2), "sheet-12-pages-23-24.jpg");

const g = sheetGeometry({ w: SIZE, h: SIZE }, BLEED_MM, dpi);
const end = Math.round((BLEED_MM / 25.4) * dpi);
assert.equal(g.height, 12 * dpi, "exactly 12 in tall");
assert.equal(g.width, 24 * dpi + 2 * end, "24 in plus the two end margins");
assert.equal(g.fold * 2, g.width, "fold in the middle");

for (const [n, name] of [
  [1, "sheet-01-pages-01-02.jpg"],
  [2, "sheet-02-pages-03-04.jpg"],
  [3, "sheet-03-pages-05.jpg"],
] as const) {
  const { info, at } = await pixels(files.get(name)!);
  assert.equal(info.width, g.width, `${name} width`);
  assert.equal(info.height, g.height, `${name} height`);
  const mid = Math.round(g.height / 2);
  const leftColour = PAGE_COLOURS[(n - 1) * 2];
  const rightColour = PAGE_COLOURS[(n - 1) * 2 + 1] ?? PAPER;
  // outer ends keep the red bleed, then the page starts
  assert.ok(near(at(1, mid), "#ff0000"), `${name}: left end margin`);
  assert.ok(near(at(end + 4, mid), leftColour), `${name}: left page starts after the margin`);
  assert.ok(near(at(g.width - 2, mid), n < 3 ? "#ff0000" : PAPER), `${name}: right end margin`);
  // the fold: left colour just before, right colour just after, no red
  assert.ok(near(at(g.fold - 3, mid), leftColour), `${name}: left of the fold ${at(g.fold - 3, mid)}`);
  assert.ok(near(at(g.fold + 3, mid), rightColour), `${name}: right of the fold ${at(g.fold + 3, mid)}`);
  // top and bottom rows are page, not bleed (cut to the 12 in paper)
  for (const x of [end + 40, g.fold - 40, g.fold + 40, g.width - end - 40]) {
    assert.ok(!near(at(x, 0), "#ff0000", 60), `${name}: red at the top, x=${x}`);
    assert.ok(!near(at(x, g.height - 1), "#ff0000", 60), `${name}: red at the bottom, x=${x}`);
  }
  const meta = await sharp(files.get(name)!).metadata();
  assert.equal(meta.density, dpi, `${name}: ${dpi} dpi in the file`);
}

// the covers keep their bleed all round
const front = await pixels(files.get("00-cover-front.jpg")!);
assert.equal(front.info.width, Math.round((SIZE / 72) * dpi));
assert.ok(near(front.at(1, 1), "#ff0000") && near(front.at(Math.round(front.info.width / 2), Math.round(front.info.height / 2)), "#334155"));
assert.ok(readFileSync(zipPath).length > 0 && files.get("readme.txt")!.toString().includes(`${g.width} x ${g.height} px`));

const mb = (b: number) => (b / 1e6).toFixed(1);
console.log(
  `sheets at ${dpi} dpi: ${g.width} x ${g.height} px; sheet-01 ${mb(files.get("sheet-01-pages-01-02.jpg")!.length)} MB; ` +
    `${secs.toFixed(1)} s for 3 sheets + 2 covers; peak memory ${mb(peak)} MB (${mb(peak - base)} MB above the ${mb(base)} MB at start)`,
);
// covers on one sheet (owner, 2026-11-28): back | front, same size as a page sheet, one fewer file
const zip2 = path.join(work, "jpegs-covers.zip");
const res2 = await composeJpegZip(interior, cover, zip2, { orderNumber: "TK-TEST02", title: "Test", dpi, paper: PAPER, bleedMm: BLEED_MM, coversTogether: true });
const files2 = unzip(zip2);
assert.equal(res2.coversTogether, true);
assert.equal(res2.files, jpegCount(5, 2, true));
assert.equal(res2.files, res.files - 1, "one print saved");
assert.deepEqual(Array.from(files2.keys()), ["00-covers-back-front.jpg", "sheet-01-pages-01-02.jpg", "sheet-02-pages-03-04.jpg", "sheet-03-pages-05.jpg", "readme.txt"]);
const cs = await pixels(files2.get("00-covers-back-front.jpg")!);
assert.equal(cs.info.width, g.width);
assert.equal(cs.info.height, g.height);
const cmid = Math.round(g.height / 2);
assert.ok(near(cs.at(g.fold - 3, cmid), "#475569"), "back cover on the left");
assert.ok(near(cs.at(g.fold + 3, cmid), "#334155"), "front cover on the right");
assert.ok(near(cs.at(1, cmid), "#ff0000") && near(cs.at(g.width - 2, cmid), "#ff0000"), "cover sheet keeps its end margins");
assert.ok(files2.get("readme.txt")!.toString().includes("BACK cover on the left"));

console.log("jpegs: all checks passed");
