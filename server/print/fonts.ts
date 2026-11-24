/**
 * Print fonts: the book's font pair as embeddable TrueType files for pdfkit.
 *
 * What: `printFonts(pdf, fontId)` registers the pair's heading and body faces
 * on a PDF document and returns the names to draw with. Books made before the
 * pairs (classic / editorial / modern / script) get the standard PDF fonts
 * they always printed with, so their reprints don't change.
 *
 * Where the files come from: the pairs are Fontshare fonts, used under ITF's
 * free licence while the product is a prototype (ADR 020), and the repository
 * is public, so no font file is committed. On first use each face's TrueType
 * file is found through Fontshare's CSS service (the same stylesheet the
 * preview loads, shared/fonts.ts fontshareCssUrl), downloaded, checked, and
 * kept in memory and in a temp-dir cache for the life of the machine.
 *
 * Failure is loud on purpose: if a face can't be fetched, this throws, the
 * print job fails this attempt and the queue retries (pipeline.ts). Printing
 * a book in a fallback font the customer never saw would be worse than a
 * late print file.
 */

import { mkdir, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type PDFDocument from "pdfkit";
import { fontshareCssUrl, pairById, type FontFace } from "@shared/fonts";

type Pdf = InstanceType<typeof PDFDocument>;

/** What to draw each kind of text with. */
export interface PrintFonts {
  /** titles: cover and title page */
  head: string;
  /** the line under the title, and captions */
  body: string;
  /** the small upper-case line on the title page */
  label: string;
}

/** The standard-font mapping books printed with before the pairs (unchanged). */
function legacyFonts(fontId: string | undefined): PrintFonts {
  const regular = fontId === "modern" ? "Helvetica" : fontId === "script" ? "Times-Italic" : "Times-Roman";
  const bold = fontId === "modern" ? "Helvetica-Bold" : fontId === "script" ? "Times-Italic" : "Times-Bold";
  return { head: bold, body: regular, label: "Helvetica" };
}

const CACHE_DIR = join(tmpdir(), "truekeeps-fonts");
const memory = new Map<string, Promise<Buffer>>();

/** A TrueType / OpenType file starts with one of these four tags. */
function looksLikeFont(buf: Buffer): boolean {
  if (buf.length < 1024) return false;
  const tag = buf.subarray(0, 4);
  return tag.equals(Buffer.from([0, 1, 0, 0])) || ["true", "OTTO", "typ1"].includes(tag.toString("latin1"));
}

/**
 * Find the face's .ttf URL in Fontshare's stylesheet. The sheet holds one
 * @font-face block per face (sometimes for other families too), each with
 * woff2, woff and ttf sources; the block must match family and weight.
 */
export function ttfUrlFromCss(css: string, f: FontFace): string | null {
  for (const block of css.split("@font-face").slice(1)) {
    const family = /font-family:\s*'([^']+)'/.exec(block)?.[1];
    const weight = Number(/font-weight:\s*(\d+)/.exec(block)?.[1]);
    const style = /font-style:\s*(\w+)/.exec(block)?.[1] ?? "normal";
    const ttf = /url\('([^']+\.ttf)'\)/.exec(block)?.[1];
    if (family === f.family && weight === f.weight && style === "normal" && ttf) return ttf.startsWith("//") ? `https:${ttf}` : ttf;
  }
  return null;
}

async function download(f: FontFace): Promise<Buffer> {
  const file = join(CACHE_DIR, `${f.slug}-${f.weight}.ttf`);
  try {
    const cached = await readFile(file);
    if (looksLikeFont(cached)) return cached;
  } catch {
    /* not cached yet */
  }
  const cssRes = await fetch(fontshareCssUrl(f), { signal: AbortSignal.timeout(20_000) });
  if (!cssRes.ok) throw new Error(`font ${f.family} ${f.weight}: stylesheet HTTP ${cssRes.status}`);
  const url = ttfUrlFromCss(await cssRes.text(), f);
  if (!url) throw new Error(`font ${f.family} ${f.weight}: no TrueType file in Fontshare's stylesheet`);
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`font ${f.family} ${f.weight}: file HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!looksLikeFont(buf)) throw new Error(`font ${f.family} ${f.weight}: downloaded file is not a font`);
  await mkdir(CACHE_DIR, { recursive: true }).catch(() => undefined);
  await writeFile(file, buf).catch(() => undefined); // the memory copy still serves this process
  return buf;
}

/** The face's file, fetched once per process (a failed fetch is forgotten so the retry tries again). */
export function fontFile(f: FontFace): Promise<Buffer> {
  const key = `${f.slug}@${f.weight}`;
  let p = memory.get(key);
  if (!p) {
    p = download(f);
    memory.set(key, p);
    p.catch(() => memory.delete(key));
  }
  return p;
}

/**
 * Register the book's lettering on this PDF and say which names to draw with.
 * pdfkit embeds only the glyphs used, so a book carries a few kilobytes of each face.
 */
export async function printFonts(pdf: Pdf, fontId: string | undefined): Promise<PrintFonts> {
  const pair = pairById(fontId);
  if (!pair) return legacyFonts(fontId);
  const [head, body] = await Promise.all([fontFile(pair.head), fontFile(pair.body)]);
  pdf.registerFont("tk-head", head);
  pdf.registerFont("tk-body", body);
  return { head: "tk-head", body: "tk-body", label: "tk-body" };
}
