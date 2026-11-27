/**
 * Photo preparation — turn one huge file into the copies the editor needs.
 *
 * What: decode a photo once, then produce a ~1600px display copy, a ~400px
 * thumbnail, the true dimensions and a rough brightness. Runs in a Web Worker
 * when it can (see prepare.worker.ts) and on the main thread when it can't.
 *
 * Why these encoders: measured on real photos on 2026-11-05. The browser's
 * built-in encoder matched MozJPEG WASM to within about 6% and was about 20x
 * faster; AVIF took about 11s per large photo. See the benchmark in
 * docs/adr/011.
 *
 * Steps for one photo:
 *   1. Decode with EXIF rotation applied, so a phone portrait is upright and
 *      the measured size is the size it will print at.
 *   2. Draw onto a 1600px canvas and encode. WebP q0.80 scored 75.5 on
 *      SSIMULACRA2 at about 230 KB. Safari can't encode WebP and silently
 *      returns PNG instead, so the result's type is checked and JPEG q0.75
 *      (about 277 KB, score 74.8) is the fallback.
 *   3. Draw the 1600px canvas onto a 400px one, which is much cheaper than
 *      resizing from the original a second time.
 *   4. Average a tiny copy for brightness, to warn about very dark photos.
 *   4b. Measure sharpness on the middle of the display copy (see sharpness()),
 *       to flag the few photos that are far blurrier than the rest.
 *   5. Optionally make a full-size JPEG "master", for the rare files that
 *      cannot go to the printer as they are (HEIC, or over the upload limit).
 *
 * makePrintCopy() is separate: it re-saves a photo at quality 0.95 for
 * printing, and runs later, just before that photo's HD upload, so it never
 * delays the book. Which photos qualify is decided in print-copy.ts.
 *
 * Anything that fails throws: the caller decides what the customer sees.
 */

export const DISPLAY_EDGE = 1600;
export const THUMB_EDGE = 400;

export interface PreparedPhoto {
  display: Blob;
  thumb: Blob;
  /** size of the ORIGINAL as displayed; this is what print-quality checks need */
  w: number;
  h: number;
  /** average brightness, 0 to 255 */
  luma: number;
  /** sharpness of the display copy (see sharpness()); higher is sharper */
  sharp: number;
  /** full-size JPEG to upload instead of the source file, when one was asked for */
  master?: Blob;
}

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
type AnyContext = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function context(canvas: AnyCanvas): AnyContext {
  const ctx = canvas.getContext("2d") as AnyContext | null;
  if (!ctx) throw new Error("canvas unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

async function encode(canvas: AnyCanvas, type: string, quality: number): Promise<Blob> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), type, quality);
  });
}

/** WebP where the browser can really encode it, otherwise JPEG. */
async function encodeDisplay(canvas: AnyCanvas, webpQ: number, jpegQ: number): Promise<Blob> {
  const webp = await encode(canvas, "image/webp", webpQ);
  if (webp.type === "image/webp") return webp;
  return encode(canvas, "image/jpeg", jpegQ);
}

function fit(w: number, h: number, edge: number): { w: number; h: number } {
  const k = Math.min(1, edge / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** Decode with rotation applied. Falls back to <img> where createImageBitmap can't. */
async function decode(source: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(source, { imageOrientation: "from-image" });
    } catch (err) {
      if (typeof document === "undefined") throw err; // no <img> inside a worker
    }
  }
  const url = URL.createObjectURL(source);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("undecodable"));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * How sharp a photo is: the variance of the Laplacian (each pixel's grey
 * level against its four neighbours) over a 400px square from the middle of
 * the display copy, where the subject usually is. A focused photo has strong
 * edges, so a high variance; a shaken or out-of-focus one has soft edges and
 * a low one. It's measured on the display copy so every photo is judged at
 * the same scale, whatever camera took it.
 *
 * The number means little on its own (a plain sky is "blurry"), so it is only
 * ever compared with the customer's other photos: see photoFlag() in
 * ../quality.ts.
 */
function sharpness(canvas: AnyCanvas, w: number, h: number): number {
  const side = Math.min(400, w, h);
  if (side < 8) return 0;
  const x0 = Math.floor((w - side) / 2);
  const y0 = Math.floor((h - side) / 2);
  const px = context(canvas).getImageData(x0, y0, side, side).data;
  const grey = new Float32Array(side * side);
  for (let i = 0, j = 0; j < grey.length; i += 4, j++) grey[j] = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < side - 1; y++)
    for (let x = 1; x < side - 1; x++) {
      const k = y * side + x;
      const lap = grey[k - 1] + grey[k + 1] + grey[k - side] + grey[k + side] - 4 * grey[k];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  const mean = sum / n;
  return Math.round(sumSq / n - mean * mean);
}

/** Prepare one photo. `makeMaster` also re-encodes it at full size as JPEG. */
export async function preparePhoto(source: Blob, makeMaster: boolean): Promise<PreparedPhoto> {
  const image = await decode(source);
  const w = "naturalWidth" in image ? image.naturalWidth : image.width;
  const h = "naturalHeight" in image ? image.naturalHeight : image.height;
  if (!(w > 0 && h > 0)) throw new Error("undecodable");

  try {
    const d = fit(w, h, DISPLAY_EDGE);
    const displayCanvas = makeCanvas(d.w, d.h);
    context(displayCanvas).drawImage(image, 0, 0, d.w, d.h);
    const display = await encodeDisplay(displayCanvas, 0.8, 0.75);

    const t = fit(d.w, d.h, THUMB_EDGE);
    const thumbCanvas = makeCanvas(t.w, t.h);
    context(thumbCanvas).drawImage(displayCanvas, 0, 0, t.w, t.h);
    const thumb = await encodeDisplay(thumbCanvas, 0.72, 0.7);

    const probe = makeCanvas(16, 16);
    const probeCtx = context(probe);
    probeCtx.drawImage(thumbCanvas, 0, 0, 16, 16);
    const px = probeCtx.getImageData(0, 0, 16, 16).data;
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    const luma = sum / (px.length / 4);
    const sharp = sharpness(displayCanvas, d.w, d.h);

    let master: Blob | undefined;
    if (makeMaster) {
      // Best effort: iOS refuses very large canvases, and then the source
      // file simply goes up as it is.
      try {
        const full = makeCanvas(w, h);
        context(full).drawImage(image, 0, 0, w, h);
        master = await encode(full, "image/jpeg", 0.95);
        // Some browsers hand back a blank bitmap rather than an error; a real
        // full-size JPEG is never smaller than the 1600px copy.
        if (master.size < display.size) master = undefined;
      } catch {
        master = undefined;
      }
    }
    return { display, thumb, w, h, luma, sharp, master };
  } finally {
    if ("close" in image) image.close();
  }
}

/**
 * Re-save a photo for printing at JPEG quality 0.95 (print-copy.ts decides
 * which photos qualify). Every pixel is kept unless `maxShortEdge` is given,
 * for the 48 to 50 MP photos that are far bigger than any page.
 *
 * Returns undefined, never a worse file, when the browser can't do it: iOS
 * refuses canvases above about 16.7 MP, and some browsers hand back a blank
 * image instead of an error, which is caught by the size check.
 */
export async function makePrintCopy(source: Blob, maxShortEdge: number | null, quality: number): Promise<Blob | undefined> {
  const image = await decode(source);
  try {
    const w = "naturalWidth" in image ? image.naturalWidth : image.width;
    const h = "naturalHeight" in image ? image.naturalHeight : image.height;
    if (!(w > 0 && h > 0)) return undefined;
    const k = maxShortEdge ? Math.min(1, maxShortEdge / Math.min(w, h)) : 1;
    const cw = Math.round(w * k);
    const ch = Math.round(h * k);
    const canvas = makeCanvas(cw, ch);
    context(canvas).drawImage(image, 0, 0, cw, ch);
    const copy = await encode(canvas, "image/jpeg", quality);
    // a blank canvas encodes to almost nothing; a real photo at 0.95 never does
    if (copy.type !== "image/jpeg" || copy.size < (cw * ch) / 40) return undefined;
    return copy;
  } catch {
    return undefined;
  } finally {
    if ("close" in image) image.close();
  }
}
