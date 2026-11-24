/**
 * Loads the book font pairs (shared/fonts.ts) into the page, once.
 *
 * What: one Fontshare stylesheet per face, plus a small generated stylesheet
 * that gives each pair's class (`.bb-font-<id>`, set by lookClasses) four CSS
 * variables: --bk-head / --bk-head-w for titles and --bk-body / --bk-body-w
 * for the line under the title and captions. builder.css reads them with
 * fallbacks, so a page without a pair class looks exactly as before.
 *
 * Why variables rather than font-family rules per pair: the generated rules
 * only define variables, so they never compete with builder.css on
 * specificity or load order (the prod build orders CSS differently from dev,
 * see the CSS load-order note in the project memory).
 *
 * Why per-face links, and only in the builder: Fontshare's CSS service answers
 * one family per request, and the landing page shouldn't pay for twelve
 * stylesheets it never uses. A stylesheet costs a few hundred bytes; a font
 * file downloads only when a page actually shows that face.
 *
 * Licence: Fontshare's free licence for now (ADR 020); with a commercial
 * licence the links become self-hosted files and nothing else changes.
 */

import { FONT_PAIRS, allPairFaces, fontshareCssUrl, type FontFace } from "@shared/fonts";

/** A CSS font-family value for a face: the family, then its fallbacks. */
export const cssFamily = (f: FontFace) => `'${f.family}', ${f.fallback}`;

let loaded = false;

/** Add the pair stylesheets to <head>. Safe to call many times, and on the server (no-op). */
export function ensureBookFonts(): void {
  if (loaded || typeof document === "undefined") return;
  loaded = true;
  for (const f of allPairFaces()) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = fontshareCssUrl(f);
    link.dataset.bookFont = f.slug;
    document.head.appendChild(link);
  }
  const vars = document.createElement("style");
  vars.id = "tk-book-fonts";
  vars.textContent = FONT_PAIRS.map(
    (p) => `.bb-font-${p.id}{--bk-head:${cssFamily(p.head)};--bk-head-w:${p.head.weight};--bk-body:${cssFamily(p.body)};--bk-body-w:${p.body.weight}}`,
  ).join("\n");
  document.head.appendChild(vars);
}
