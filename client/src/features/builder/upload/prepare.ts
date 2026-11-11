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
 *   5. Optionally make a full-size JPEG "master", for the rare files that
 *      cannot go to the printer as they are (HEIC, or over the upload limit).
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
    return { display, thumb, w, h, luma, master };
  } finally {
    if ("close" in image) image.close();
  }
}
