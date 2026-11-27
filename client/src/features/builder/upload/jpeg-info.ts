/**
 * JPEG header reader: what a photo's file says about itself, without
 * decoding a single pixel.
 *
 * What: the size, the quality it was saved at, its colour profile and when it
 * was taken, all read from the first part of the file.
 *
 * Why: the print-copy rules (print-copy.ts) re-save a photo only when that
 * can't cost any quality. That needs the quality it was saved at, and the
 * only place that's recorded is the file's quantization tables. "Taken"
 * feeds the re-add list (RepickSheet), so a customer can find the exact
 * photos again in their gallery.
 *
 * Approach: walk the JPEG markers up to the start of the image data:
 *   - DQT (0xDB): quantization tables. The quality is estimated by finding
 *     which standard (IJG) quality, 1 to 100, gives the closest luminance
 *     table. That is exact for the common encoders and close for phone
 *     makers' own tables; see estimateQuality().
 *   - SOFn: width, height, bits per sample and colour channels.
 *   - APP1 "Exif": DateTimeOriginal, the moment the photo was taken.
 *   - APP2 "ICC_PROFILE": whether the colours are plain sRGB or a wider
 *     space such as Display P3, which a browser canvas would squash.
 * Anything that can't be read is left undefined, and the print-copy rules
 * treat "unknown" as "leave the photo alone".
 */

/** How much of the file to read. EXIF thumbnails and ICC profiles sit before the tables, so be generous. */
export const HEADER_BYTES = 512 * 1024;

export interface JpegInfo {
  width?: number;
  height?: number;
  /** bits per sample; 8 for almost every photo */
  precision?: number;
  /** 3 for colour photos, 1 for greyscale, 4 for CMYK */
  components?: number;
  /** estimated IJG quality, 1 to 100 */
  quality?: number;
  /** "none" when no profile is embedded (browsers then assume sRGB) */
  icc: "none" | "srgb" | "other";
  /** when the photo was taken, from EXIF, as local time in ms */
  takenAt?: number;
}

/** The standard luminance table (JPEG spec, Annex K). Order doesn't matter for the comparison below. */
const STD_LUMA = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24,
  35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
];

/**
 * Which IJG quality is this luminance table closest to?
 *
 * Step by step:
 *   1. For each quality 1 to 100, build the table the IJG library would make:
 *      scale = q < 50 ? 5000 / q : 200 - 2q, then each entry is
 *      (std * scale + 50) / 100, rounded down and at least 1.
 *   2. Score it by the summed difference from the file's table, sorted, so
 *      the zigzag storage order can't matter.
 *   3. Keep the closest. Ties go to the lower quality, which is the safe way
 *      to be wrong: a lower estimate only ever means "don't touch it".
 */
export function estimateQuality(table: number[]): number {
  const actual = table.slice().sort((a, b) => a - b);
  let best = 1;
  let bestErr = Infinity;
  for (let q = 1; q <= 100; q++) {
    const scale = q < 50 ? 5000 / q : 200 - 2 * q;
    const made = STD_LUMA.map((v) => Math.max(1, Math.floor((v * scale + 50) / 100))).sort((a, b) => a - b);
    let err = 0;
    for (let i = 0; i < 64; i++) err += Math.abs(made[i] - actual[i]);
    if (err < bestErr) {
      bestErr = err;
      best = q;
    }
  }
  return best;
}

/** Does this ICC profile describe sRGB? Its description is stored as ASCII (v2) or UTF-16 (v4). */
function profileIsSrgb(bytes: Uint8Array): boolean {
  const ascii = String.fromCharCode(...Array.from(bytes.subarray(0, Math.min(bytes.length, 4096))));
  if (/sRGB/.test(ascii)) return true;
  // UTF-16BE "sRGB": every other byte is zero
  return /s\0R\0G\0B/.test(ascii);
}

/** "2026:07:14 18:42:05" → local time in ms. */
function parseExifDate(s: string): number | undefined {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (!m) return undefined;
  const [y, mo, d, h, mi, se] = m.slice(1).map(Number);
  if (y < 1900 || mo < 1 || mo > 12) return undefined;
  const t = new Date(y, mo - 1, d, h, mi, se).getTime();
  return Number.isFinite(t) ? t : undefined;
}

/** DateTimeOriginal (or DateTime) out of an APP1 Exif segment that starts at `tiff`. */
function exifTakenAt(view: DataView, tiff: number, end: number): number | undefined {
  if (tiff + 8 > end) return undefined;
  const little = view.getUint16(tiff) === 0x4949;
  const u16 = (o: number) => view.getUint16(o, little);
  const u32 = (o: number) => view.getUint32(o, little);
  const readAscii = (entry: number) => {
    const count = u32(entry + 4);
    const at = count <= 4 ? entry + 8 : tiff + u32(entry + 8);
    if (at + count > end) return "";
    let s = "";
    for (let i = 0; i < count - 1; i++) s += String.fromCharCode(view.getUint8(at + i));
    return s;
  };
  /** Look up tags in one IFD; returns tag → entry offset. */
  const ifd = (offset: number) => {
    const found = new Map<number, number>();
    const at = tiff + offset;
    if (at + 2 > end) return found;
    const n = u16(at);
    for (let i = 0; i < n; i++) {
      const entry = at + 2 + i * 12;
      if (entry + 12 > end) break;
      found.set(u16(entry), entry);
    }
    return found;
  };
  const ifd0 = ifd(u32(tiff + 4));
  const exifPtr = ifd0.get(0x8769);
  if (exifPtr !== undefined) {
    const original = ifd(u32(exifPtr + 8)).get(0x9003);
    if (original !== undefined) {
      const t = parseExifDate(readAscii(original));
      if (t !== undefined) return t;
    }
  }
  const plain = ifd0.get(0x0132);
  return plain !== undefined ? parseExifDate(readAscii(plain)) : undefined;
}

/** Read what a JPEG header says. Returns null for anything that isn't a JPEG. */
export function readJpegInfo(head: ArrayBuffer): JpegInfo | null {
  const view = new DataView(head);
  const len = head.byteLength;
  if (len < 4 || view.getUint16(0) !== 0xffd8) return null;
  const info: JpegInfo = { icc: "none" };
  const iccChunks: Uint8Array[] = [];
  let pos = 2;
  try {
    while (pos + 4 <= len) {
      if (view.getUint8(pos) !== 0xff) break; // lost sync: stop rather than guess
      const marker = view.getUint8(pos + 1);
      if (marker === 0xff) {
        pos++; // fill byte
        continue;
      }
      if (marker === 0xd9 || marker === 0xda) break; // end, or start of the image data
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        pos += 2; // markers with no length
        continue;
      }
      const segLen = view.getUint16(pos + 2);
      const start = pos + 4;
      const end = Math.min(len, pos + 2 + segLen);

      if (marker === 0xdb) {
        // one or more tables: a byte of precision/id, then 64 values of 8 or 16 bits
        let p = start;
        while (p < end) {
          const pq = view.getUint8(p) >> 4;
          const id = view.getUint8(p) & 15;
          p++;
          const values: number[] = [];
          for (let i = 0; i < 64 && p < end; i++) {
            values.push(pq ? view.getUint16(p) : view.getUint8(p));
            p += pq ? 2 : 1;
          }
          if (id === 0 && values.length === 64 && info.quality === undefined) info.quality = estimateQuality(values);
        }
      } else if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        info.precision = view.getUint8(start);
        info.height = view.getUint16(start + 1);
        info.width = view.getUint16(start + 3);
        info.components = view.getUint8(start + 5);
      } else if (marker === 0xe1 && info.takenAt === undefined) {
        // "Exif\0\0" then a TIFF structure
        if (view.getUint32(start) === 0x45786966 && view.getUint16(start + 4) === 0) info.takenAt = exifTakenAt(view, start + 6, end);
      } else if (marker === 0xe2) {
        // "ICC_PROFILE\0", chunk number, chunk count, then profile bytes
        const tag = String.fromCharCode(...Array.from(new Uint8Array(head, start, Math.min(11, end - start))));
        if (tag === "ICC_PROFILE") iccChunks.push(new Uint8Array(head, start + 14, Math.max(0, end - start - 14)));
      }
      pos += 2 + segLen;
    }
  } catch {
    // a truncated or odd header: keep what was read, the rest stays unknown
  }
  if (iccChunks.length) info.icc = profileIsSrgb(iccChunks[0]) ? "srgb" : "other";
  return info;
}
