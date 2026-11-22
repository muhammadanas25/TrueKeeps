/**
 * Editor v2 — book operations as pure functions.
 *
 * Every edit the v2 editor can make is one of these: (book, args) → book.
 * They never touch React, the DOM, or the network, so the editor's
 * undo/redo is just "keep the previous value", and each rule (what a
 * page becomes when it loses a photo, where a moved page lands) can be
 * reasoned about — and tested — on its own.
 *
 * "Book" here is the slice of BuilderState the editor owns (BookSlice):
 * pages plus the style fields. Photos are read-only input.
 *
 * Shared rules with the classic editor (data.ts):
 *  - reshapePage() decides what a page turns into when its photo set
 *    changes: a "grid" page (the layout engine, arrange.ts) is laid out
 *    again; a named layout grows or shrinks by character (airy stays airy)
 *  - the title page is always page 0 and can't be moved or deleted
 *  - new slots are filled from photos not yet in the book first
 */

import {
  captionable,
  DEFAULT_FRAMING,
  firstMovablePage,
  hasTitlePage,
  LAYOUT_SLOTS,
  generatePages,
  pageCapacity,
  placement,
  prettyCaption,
  reshapePage,
  type BookPage,
  type BuilderPhoto,
  type DensityId,
  type PageFrame,
  type PageLayoutId,
  type Placement,
} from "../data";
import { relayoutPage } from "../arrange";
import { lookDefaults, type EdgeId, type FontId } from "../looks";
import { THEME_COLOUR } from "../palette";
import { slotMaxZoom } from "../print";
import type { BuilderState } from "../state";

export type BookSlice = Pick<
  BuilderState,
  "pages" | "themeId" | "pageColor" | "fontId" | "edge" | "title" | "subtitle" | "captionsHidden" | "density" | "recentColors"
>;

export const sliceOf = (s: BuilderState): BookSlice => ({
  pages: s.pages,
  themeId: s.themeId,
  pageColor: s.pageColor,
  fontId: s.fontId,
  edge: s.edge,
  title: s.title,
  subtitle: s.subtitle,
  captionsHidden: s.captionsHidden,
  density: s.density,
  recentColors: s.recentColors,
});

let seq = 0;
const newPageId = () => "pg-" + Date.now().toString(36) + "-" + (seq++).toString(36);

const mapPage = (b: BookSlice, id: string, fn: (p: BookPage) => BookPage): BookSlice => ({
  ...b,
  pages: b.pages.map((p) => (p.id === id ? fn(p) : p)),
});

/** Photo ids not on any page, in upload order. */
export function unusedPhotoIds(pages: BookPage[], photos: BuilderPhoto[]): string[] {
  const used = new Set(pages.flatMap((p) => p.slots.map((s) => s.photoId)));
  return photos.filter((p) => !used.has(p.id)).map((p) => p.id);
}

/** How many times each photo appears in the book. */
export function photoUsage(pages: BookPage[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of pages) for (const s of p.slots) m.set(s.photoId, (m.get(s.photoId) ?? 0) + 1);
  return m;
}

/* ── per-slot framing ──────────────────────────────────────────── */

export function setFrame(b: BookSlice, pageId: string, slot: number, patch: Partial<Placement>): BookSlice {
  return mapPage(b, pageId, (p) => ({ ...p, slots: p.slots.map((s, j) => (j === slot ? { ...s, ...patch } : s)) }));
}

/** Quarter turn; zoom re-clamped because the ceiling moves with the turn. */
export function rotateSlot(b: BookSlice, pageId: string, slot: number, photos: BuilderPhoto[]): BookSlice {
  const page = b.pages.find((p) => p.id === pageId);
  const s = page?.slots[slot];
  if (!page || !s) return b;
  const turn = ((s.turn + 90) % 360) as Placement["turn"];
  const photo = photos.find((p) => p.id === s.photoId);
  const lim = slotMaxZoom(photo, page, slot, turn, undefined, s.tilt ?? 0);
  return setFrame(b, pageId, slot, { turn, zoom: Math.min(s.zoom, lim) });
}

export const resetFrame = (b: BookSlice, pageId: string, slot: number) =>
  setFrame(b, pageId, slot, { fx: 0.5, fy: 0.5, zoom: 1, tilt: 0 });

/** Same page, new photo set: a grid page is laid out again, a named one changes shape. */
function reshape(b: BookSlice, pageId: string, slots: Placement[], photos: BuilderPhoto[]): BookPage | null {
  const idx = b.pages.findIndex((p) => p.id === pageId);
  return idx < 0 ? null : reshapePage(b.pages[idx], slots, photos, idx);
}

/**
 * Put a different photo in a slot (framing starts fresh for the new photo).
 * On a grid page the page is laid out again, because the new photo may be
 * the other way round and the slot was cut to fit the old one.
 */
export function replacePhoto(b: BookSlice, pageId: string, slot: number, photoId: string, photos: BuilderPhoto[]): BookSlice {
  const page = b.pages.find((p) => p.id === pageId);
  if (!page) return b;
  const slots = page.slots.map((s, j) => (j === slot ? placement(photoId) : s));
  if (page.layout !== "grid") return mapPage(b, pageId, (p) => ({ ...p, slots }));
  const next = reshape(b, pageId, slots, photos);
  return next ? mapPage(b, pageId, () => next) : b;
}

/* ── page shape ────────────────────────────────────────────────── */

/** What a layout change did, so the editor can say it in a line. */
export interface LayoutChange {
  book: BookSlice;
  /** photos moved onto this page from later pages (or from photos on no page) */
  pulled: number;
  /** photos moved off this page onto later pages */
  pushed: number;
  /** photos that found no room on a later page and are now "Not in book" */
  out: number;
  /** >0 when the change was refused: this many more photos would be needed */
  short: number;
}

/**
 * Switch a page's layout, moving photos between pages instead of copying
 * them or dropping them (owner, 2026-11-22: "layout should add or delete
 * accordingly; currently it duplicates or doesn't take images from the next
 * page").
 *
 * Approach:
 *  1. A layout with MORE slots takes the first photo of each following page
 *     that has more than one, in reading order, so no page is emptied. Those
 *     pages lay themselves out again. If that isn't enough, it takes photos
 *     that are in the book but on no page yet. If still short, nothing
 *     changes and `short` says how many photos are missing: a photo is never
 *     repeated.
 *  2. A layout with FEWER slots keeps the first photos and moves the rest to
 *     the front of the following pages that have room (up to each page's
 *     capacity). Whatever finds no room leaves the book and shows under "Not
 *     in book" in the Photos panel (trackRemovals in state.ts records it).
 *  3. Slots that stay keep their framing; moved photos keep theirs too.
 *
 * `photos` must be the book's photos (bookPhotos(state)): photos the customer
 * took out stay out. Passing every photo is what used to bring a deleted
 * page's photos back.
 *
 * `target` is a named layout, or an engine template (`template` + its photo
 * count `n`) from PICKER_TEMPLATES.
 */
export function changeLayout(
  b: BookSlice,
  pageId: string,
  target: { layout: PageLayoutId } | { template: string; n: number },
  photos: BuilderPhoto[],
): LayoutChange {
  const i = b.pages.findIndex((p) => p.id === pageId);
  const none: LayoutChange = { book: b, pulled: 0, pushed: 0, out: 0, short: 0 };
  if (i < 0 || b.pages[i].layout === "title") return none;
  const page = b.pages[i];
  const want = "template" in target ? target.n : LAYOUT_SLOTS[target.layout];
  const pages = b.pages.slice();
  let slots = page.slots.slice();
  let pulled = 0;
  let pushed = 0;
  let out = 0;

  if (slots.length < want) {
    // 1a. borrow from later pages, never leaving one empty
    for (let j = i + 1; j < pages.length && slots.length < want; j++) {
      const pj = pages[j];
      if (pj.layout === "title" || pj.slots.length < 2) continue;
      let rest = pj.slots;
      while (rest.length > 1 && slots.length < want) {
        slots.push(rest[0]);
        rest = rest.slice(1);
        pulled++;
      }
      pages[j] = reshapePage(pj, rest, photos, j) ?? pj;
    }
    // 1b. then photos in the book that are on no page
    const onPages = new Set(pages.flatMap((p) => p.slots.map((s) => s.photoId)));
    for (const ph of photos) {
      if (slots.length >= want) break;
      if (onPages.has(ph.id) || slots.some((s) => s.photoId === ph.id)) continue;
      slots.push(placement(ph.id));
      pulled++;
    }
    if (slots.length < want) return { ...none, short: want - slots.length };
  } else if (slots.length > want) {
    // 2. move the extra photos forward
    const extra = slots.slice(want);
    slots = slots.slice(0, want);
    for (let j = i + 1; j < pages.length && extra.length; j++) {
      const pj = pages[j];
      if (pj.layout === "title") continue;
      const room = pageCapacity(pj) - pj.slots.length;
      if (room <= 0) continue;
      const take = extra.splice(0, room);
      pages[j] = reshapePage(pj, [...take, ...pj.slots], photos, j) ?? pj;
      pushed += take.length;
    }
    out = extra.length;
  }

  const next =
    "template" in target
      ? relayoutPage(page, slots, photos, i, target.template)
      : { ...page, layout: target.layout, slots, frames: undefined, mirror: target.layout === "collage" ? page.mirror : undefined };
  pages[i] = next ?? page;
  return { book: { ...b, pages }, pulled, pushed, out, short: 0 };
}

/** The line the editor shows after a layout change (null: nothing worth saying). */
export function layoutChangeNote(r: LayoutChange): string | null {
  if (r.short) return `This layout needs ${r.short} more ${r.short === 1 ? "photo" : "photos"}. Add photos, or pick a smaller layout.`;
  const parts: string[] = [];
  if (r.pulled) parts.push(`${r.pulled} ${r.pulled === 1 ? "photo" : "photos"} moved here from the next pages`);
  if (r.pushed) parts.push(`${r.pushed} moved to the next pages`);
  if (r.out) parts.push(`${r.out} moved to "Not in book"`);
  return parts.length ? parts.join(", ") : null;
}

/**
 * Hand a page back to the layout engine ("Auto" in the layout picker): the
 * same photos, laid out with the engine's templates and rules.
 */
export function autoLayout(b: BookSlice, pageId: string, photos: BuilderPhoto[]): BookSlice {
  const page = b.pages.find((p) => p.id === pageId);
  if (!page || page.layout === "title" || !page.slots.length) return b;
  // as a grid page, so the engine lays it out whatever layout it has now
  const idx = b.pages.indexOf(page);
  const next = reshapePage({ ...page, layout: "grid" }, page.slots, photos, idx);
  // relayoutPage keeps the framing of photos already on the page
  return next ? mapPage(b, pageId, () => next) : b;
}

/**
 * Add a photo to a page, growing its layout by one slot.
 * Returns null when the page can't take another (title page, or full) —
 * the caller tells the user why rather than silently doing nothing.
 */
export function addPhotoToPage(b: BookSlice, pageId: string, photoId: string, photos: BuilderPhoto[]): BookSlice | null {
  const page = b.pages.find((p) => p.id === pageId);
  if (!page || page.layout === "title" || page.slots.length >= pageCapacity(page)) return null;
  const next = reshape(b, pageId, [...page.slots, placement(photoId)], photos);
  return next ? mapPage(b, pageId, () => next) : null;
}

/**
 * Remove one photo from a page. The page re-shapes to the remaining
 * count; removing the last photo removes the page.
 */
export function removeSlot(b: BookSlice, pageId: string, slot: number, photos: BuilderPhoto[]): { book: BookSlice; pageRemoved: boolean } {
  const page = b.pages.find((p) => p.id === pageId);
  if (!page) return { book: b, pageRemoved: false };
  const left = page.slots.filter((_, j) => j !== slot);
  const next = left.length ? reshape(b, pageId, left, photos) : null;
  if (!next) return { book: { ...b, pages: b.pages.filter((p) => p.id !== pageId) }, pageRemoved: true };
  return { book: mapPage(b, pageId, () => next), pageRemoved: false };
}

/* ── pages ─────────────────────────────────────────────────────── */

/** Move page `from` so it lands before index `to` (an old book's title page stays first). */
export function movePage(b: BookSlice, from: number, to: number): BookSlice {
  const first = firstMovablePage(b.pages);
  if (from < first || from >= b.pages.length) return b;
  const pages = b.pages.slice();
  const [it] = pages.splice(from, 1);
  const at = Math.max(first, Math.min(pages.length, to > from ? to - 1 : to));
  pages.splice(at, 0, it);
  return { ...b, pages };
}

export function deletePage(b: BookSlice, idx: number): BookSlice {
  if (idx < firstMovablePage(b.pages)) return b;
  return { ...b, pages: b.pages.filter((_, i) => i !== idx) };
}

/**
 * Insert a framed page after `afterIdx`.
 *
 * Its photo is one on no page yet; failing that, the last photo of the
 * fullest page moves onto it (that page lays itself out again). Step 5 no
 * longer has a pages control (owner, 2026-11-22), so this is how a customer
 * makes the book longer, and a photo is never repeated to fill a page. Null
 * only when every page has a single photo and none is spare. Pass the book's
 * photos (bookPhotos), so photos taken out stay out.
 */
export function addPage(b: BookSlice, afterIdx: number, photos: BuilderPhoto[]): { book: BookSlice; index: number; id: string } | null {
  const pages = b.pages.slice();
  let photo: Placement | null = null;
  const spare = unusedPhotoIds(b.pages, photos)[0];
  if (spare) photo = placement(spare);
  else {
    let donor = -1;
    pages.forEach((p, j) => {
      if (p.layout !== "title" && p.slots.length > 1 && (donor < 0 || p.slots.length > pages[donor].slots.length)) donor = j;
    });
    if (donor < 0) return null;
    const d = pages[donor];
    photo = { ...DEFAULT_FRAMING, photoId: d.slots[d.slots.length - 1].photoId };
    pages[donor] = reshapePage(d, d.slots.slice(0, -1), photos, donor) ?? d;
  }
  const id = newPageId();
  const at = Math.max(firstMovablePage(pages), Math.min(pages.length, afterIdx + 1));
  pages.splice(at, 0, { id, layout: "single", slots: [photo], caption: "" });
  return { book: { ...b, pages }, index: at, id };
}

/**
 * Re-arrange the whole book in a new arrangement (Story, Classic, Family
 * Album), keeping the photos in their current reading order and each
 * photo's framing. `photos` is the book's photos (bookPhotos: the ones taken
 * out are not in it); any not on a page yet are added at the end. The book
 * takes the fewest sheets that hold every photo.
 */
export function reflow(b: BookSlice, density: DensityId, photos: BuilderPhoto[]): BookSlice {
  const seen = new Set<string>();
  const framing = new Map<string, Placement>();
  const order: BuilderPhoto[] = [];
  for (const p of b.pages)
    for (const s of p.slots) {
      if (seen.has(s.photoId)) continue;
      const ph = photos.find((x) => x.id === s.photoId);
      if (!ph) continue;
      seen.add(s.photoId);
      framing.set(s.photoId, s);
      order.push(ph);
    }
  // Photos not on any page yet (added since the book was laid out) go in after,
  // in the order they were added. `photos` leaves out the ones taken out.
  for (const ph of photos) if (!seen.has(ph.id)) order.push(ph);
  const fresh = generatePages(order, density);
  // an older book keeps its title page (it may carry their own colour);
  // generatePages no longer makes one
  const pages = (hasTitlePage(b.pages) ? [b.pages[0], ...fresh] : fresh).map((p) => ({
    ...p,
    slots: p.slots.map((s) => ({ ...(framing.get(s.photoId) ?? s), photoId: s.photoId })),
  }));
  return { ...b, pages, density };
}

/* ── style ─────────────────────────────────────────────────────── */

/** Apply a look: theme + its default typeface and edges; clears custom colours. */
export function applyLook(b: BookSlice, themeId: string): BookSlice {
  const d = lookDefaults(themeId);
  return {
    ...b,
    themeId,
    fontId: d.font,
    edge: d.edge,
    pageColor: THEME_COLOUR,
    pages: b.pages.map((p) => (p.bg ? { ...p, bg: null } : p)),
  };
}

const remember = (recent: string[], c: string) => [c, ...recent.filter((x) => x !== c)].slice(0, 8);

/** Page colour for the whole book, or just the given pages (a spread). */
export function setPageColour(b: BookSlice, colour: string | null, pageIds?: string[]): BookSlice {
  if (pageIds) {
    const ids = new Set(pageIds);
    return {
      ...b,
      pages: b.pages.map((p) => (ids.has(p.id) ? { ...p, bg: colour } : p)),
      recentColors: colour ? remember(b.recentColors, colour) : b.recentColors,
    };
  }
  return { ...b, pageColor: colour ?? THEME_COLOUR, recentColors: colour ? remember(b.recentColors, colour) : b.recentColors };
}

export const setFont = (b: BookSlice, fontId: FontId): BookSlice => ({ ...b, fontId });
export const setEdge = (b: BookSlice, edge: EdgeId): BookSlice => ({ ...b, edge });
/* ── captions ──────────────────────────────────────────────────── */

/** Where the photos of a captioned engine page must end: the band below holds the words. */
export const CAPTION_TOP = 0.86;

/**
 * An engine page's slot rectangles, shrunk to leave a caption band at the
 * foot of the page.
 *
 * The engine fills the page edge to edge (0.5 in margins), so a caption would
 * sit on a photo. Instead every rectangle is scaled by the same factor about
 * the top of the content and the page's centre line: shapes are kept, so each
 * photo's crop is exactly what it was, and the gaps between photos shrink in
 * proportion. Rectangles already above CAPTION_TOP are left alone. Edge-to-
 * edge ("bleed") slots stop being bleeds, which is right: a bleed under a
 * caption is a caption on a photo.
 */
export function captionFrames(frames: PageFrame[]): PageFrame[] {
  if (!frames.length) return frames;
  const top = Math.min(...frames.map((f) => f.y));
  const bottom = Math.max(...frames.map((f) => f.y + f.h));
  if (bottom <= CAPTION_TOP) return frames;
  const s = (CAPTION_TOP - Math.max(top, 0.0417)) / (bottom - top);
  const y0 = Math.max(top, 0.0417);
  return frames.map((f) => ({
    x: 0.5 + (f.x - 0.5) * s,
    y: y0 + (f.y - top) * s,
    w: f.w * s,
    h: f.h * s,
  }));
}

/**
 * Set a page's caption. On an engine page, the first words make room for the
 * caption (captionFrames) and clearing it lays the page out again full size,
 * keeping the customer's framing (relayoutPage keeps it). Pass the book's
 * photos so that relayout can measure them; without them an emptied caption
 * just leaves the room.
 */
export function setCaption(b: BookSlice, pageId: string, caption: string, photos?: BuilderPhoto[]): BookSlice {
  const i = b.pages.findIndex((p) => p.id === pageId);
  if (i < 0) return b;
  const p = b.pages[i];
  const had = Boolean(p.caption.trim());
  const has = Boolean(caption.trim());
  let next: BookPage = { ...p, caption };
  if (p.layout === "grid" && p.frames) {
    if (!had && has) next = { ...next, frames: captionFrames(p.frames) };
    else if (had && !has && photos) next = { ...(relayoutPage(p, p.slots, photos, i) ?? p), caption };
  }
  const pages = b.pages.slice();
  pages[i] = next;
  return { ...b, pages };
}

/**
 * "Fill them in for me" (owner, 2026-11-22: simple suggestions by occasion).
 * Every captionable page without a caption gets one: the occasion label of
 * its first photo (labels are dealt out on upload, data.ts OCCASIONS), never
 * the same words twice in a row. Pages with the customer's own words are left
 * alone. Undoable like any edit.
 */
export function fillCaptions(b: BookSlice, photos: BuilderPhoto[], fallback: string[]): BookSlice {
  const label = new Map(photos.map((p) => [p.id, p.label]));
  let last = "";
  let k = 0;
  let out = b;
  for (const page of b.pages) {
    if (!captionable(page) || page.caption.trim() || !page.slots.length) continue;
    let words = label.get(page.slots[0].photoId) || fallback[k++ % Math.max(1, fallback.length)] || "";
    if (words === last) words = fallback[k++ % Math.max(1, fallback.length)] || words;
    if (!words) continue;
    last = words;
    out = setCaption(out, page.id, prettyCaption(words), photos);
  }
  return out;
}

/** Take every caption out of the book (pages that made room for one get it back). */
export function clearCaptions(b: BookSlice, photos: BuilderPhoto[]): BookSlice {
  let out = b;
  for (const page of b.pages) if (page.caption.trim()) out = setCaption(out, page.id, "", photos);
  return out;
}
