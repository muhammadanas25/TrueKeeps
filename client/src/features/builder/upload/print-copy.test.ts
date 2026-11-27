/**
 * Checks for the print-copy rules (print-copy.ts) and the JPEG header reader
 * they depend on (jpeg-info.ts).
 *
 * What: makes real JPEGs with sharp, at known qualities, sizes, colour
 * profiles and dates, and fails if:
 *   - a quality is misread by more than 1 (50 to 100)
 *   - size, channels, colour profile or date taken are misread
 *   - any photo that must go up untouched would be re-saved: WhatsApp-style
 *     copies, anything below quality 97, wide colour, greyscale, PNG, small
 *     files, WhatsApp and screenshot file names
 *   - a quality-99 phone photo would NOT be re-saved, or a 50 MP one not capped
 *
 * Run: npx tsx client/src/features/builder/upload/print-copy.test.ts
 * (No test runner in this repo; this exits non-zero on any failure.)
 */

import sharp from "sharp";
import { readJpegInfo, HEADER_BYTES } from "./jpeg-info";
import { PRINT_SHORT_EDGE, printPlan } from "./print-copy";

let failures = 0;
function check(ok: boolean, what: string) {
  if (!ok) {
    failures++;
    console.error("FAIL", what);
  }
}

/** A photo-like test image: noise over a gradient, so it doesn't compress to nothing. */
async function photo(w: number, h: number) {
  const noise = await sharp({ create: { width: w, height: h, channels: 3, noise: { type: "gaussian", mean: 128, sigma: 40 } } })
    .png()
    .toBuffer();
  return sharp(noise).blur(0.6);
}

const head = (buf: Buffer) => readJpegInfo(buf.buffer.slice(buf.byteOffset, buf.byteOffset + Math.min(buf.length, HEADER_BYTES)) as ArrayBuffer);
const asFile = (buf: Buffer, name: string, type = "image/jpeg") => new File([new Uint8Array(buf)], name, { type });

async function main() {
  // 1. quality estimates, across the range
  const small = await (await photo(256, 192)).toBuffer();
  for (const q of [50, 60, 70, 75, 80, 85, 90, 92, 95, 96, 97, 98, 99, 100]) {
    const jpg = await sharp(small).jpeg({ quality: q }).toBuffer();
    const info = head(jpg);
    check(info !== null && info.quality !== undefined && Math.abs(info.quality - q) <= 1, `quality ${q} read as ${info?.quality}`);
  }

  // 2. size, channels, colour profile, date taken
  const dated = await sharp(small)
    .withExif({ IFD0: { DateTime: "2026:07:14 18:42:05" }, IFD2: { DateTimeOriginal: "2026:07:14 18:42:05" } })
    .jpeg({ quality: 99 })
    .toBuffer();
  const di = head(dated)!;
  check(di.width === 256 && di.height === 192, `size read as ${di.width}x${di.height}`);
  check(di.components === 3 && di.precision === 8, "channels / precision");
  check(di.takenAt === new Date(2026, 6, 14, 18, 42, 5).getTime(), `taken read as ${di.takenAt && new Date(di.takenAt).toString()}`);
  const srgb = head(await sharp(small).withIccProfile("srgb").jpeg({ quality: 99 }).toBuffer())!;
  check(srgb.icc === "srgb", `sRGB profile read as ${srgb.icc}`);
  const p3 = head(await sharp(small).withIccProfile("p3").jpeg({ quality: 99 }).toBuffer())!;
  check(p3.icc === "other", `Display P3 profile read as ${p3.icc}`);
  check(head(await sharp(small).png().toBuffer()) === null, "a PNG is not a JPEG");

  // 3. the rules, on full-size photos
  const phone = await photo(4032, 3024);
  const q99 = await phone.clone().withIccProfile("srgb").jpeg({ quality: 99 }).toBuffer();
  const plan99 = printPlan(asFile(q99, "IMG_4821.jpg"), head(q99));
  check(plan99.reencode && plan99.maxShortEdge === null, `quality 99 phone photo: ${JSON.stringify(plan99)}`);

  for (const q of [96, 95, 92, 85]) {
    const jpg = await phone.clone().jpeg({ quality: q }).toBuffer();
    const plan = printPlan(asFile(jpg, "IMG_4821.jpg"), head(jpg));
    check(!plan.reencode && plan.reason === "already-compressed", `quality ${q} must go up untouched: ${JSON.stringify(plan)}`);
  }

  const wa = await sharp(await phone.clone().resize(1600).toBuffer()).jpeg({ quality: 78 }).toBuffer();
  check(!printPlan(asFile(wa, "IMG-20260714-WA0012.jpg"), head(wa)).reencode, "WhatsApp copy must go up untouched");
  check(!printPlan(asFile(q99, "IMG-20260714-WA0012.jpg"), head(q99)).reencode, "a WhatsApp file name is never re-saved, whatever its tables say");
  check(!printPlan(asFile(q99, "Screenshot_20260714-184205.jpg"), head(q99)).reencode, "a screenshot file name is never re-saved");

  const wide = await phone.clone().withIccProfile("p3").jpeg({ quality: 99 }).toBuffer();
  check(printPlan(asFile(wide, "IMG_1.jpg"), head(wide)).reason === "wide-colour", "Display P3 must go up untouched");

  const grey = await phone.clone().toColourspace("b-w").jpeg({ quality: 99 }).toBuffer();
  check(printPlan(asFile(grey, "IMG_2.jpg"), head(grey)).reason === "unusual", "greyscale must go up untouched");

  const tiny = await sharp(small).jpeg({ quality: 99 }).toBuffer();
  check(printPlan(asFile(tiny, "IMG_3.jpg"), head(tiny)).reason === "small", "a small file must go up untouched");

  const png = await phone.clone().png().toBuffer();
  check(printPlan(asFile(png, "IMG_4.png", "image/png"), head(png)).reason === "not-jpeg", "PNG must go up untouched");

  const huge = await (await photo(8160, 6120)).jpeg({ quality: 99 }).toBuffer();
  const planHuge = printPlan(asFile(huge, "IMG_5.jpg"), head(huge));
  check(planHuge.reencode && planHuge.maxShortEdge === PRINT_SHORT_EDGE, `50 MP photo is capped: ${JSON.stringify(planHuge)}`);

  if (failures) {
    console.error(`${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("print-copy: all checks passed");
}

void main();
