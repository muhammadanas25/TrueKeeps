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
 *  - layoutForCount() decides what a page turns into when its photo count
 *    changes (airy stays airy, busy stays busy)
 *  - the title page is always page 0 and can't be moved or deleted
 *  - new slots are filled from photos not yet in the book first
 */

import {
  LAYOUT_SLOTS,
  MAX_SLOTS_PER_PAGE,
  generatePages,
  layoutForCount,
  placement,
  type BookPage,
  type BuilderPhoto,
  type DensityId,
  type PageLayoutId,
  type Placement,
} from "../data";
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
  const lim = slotMaxZoom(photo, page.layout, slot, turn, undefined, s.tilt ?? 0);
  return setFrame(b, pageId, slot, { turn, zoom: Math.min(s.zoom, lim) });
}

export const resetFrame = (b: BookSlice, pageId: string, slot: number) =>
  setFrame(b, pageId, slot, { fx: 0.5, fy: 0.5, zoom: 1, tilt: 0 });

/** Put a different photo in a slot (framing starts fresh for the new photo). */
export const replacePhoto = (b: BookSlice, pageId: string, slot: number, photoId: string) =>
  mapPage(b, pageId, (p) => ({ ...p, slots: p.slots.map((s, j) => (j === slot ? placement(photoId) : s)) }));

/* ── page shape ────────────────────────────────────────────────── */

/**
 * Switch a page's layout. Slots that survive keep their framing (the
 * expensive thing to redo); new slots come from unused photos first,
 * then reuse, so a page never has a hole.
 */
export function changeLayout(b: BookSlice, pageId: string, layout: PageLayoutId, photos: BuilderPhoto[]): BookSlice {
  const want = LAYOUT_SLOTS[layout];
  const pool = unusedPhotoIds(b.pages, photos);
  return mapPage(b, pageId, (p) => {
    const slots = p.slots.slice(0, want);
    let k = 0;
    while (slots.length < want && photos.length) {
      slots.push(placement(pool.shift() ?? photos[(slots.length * 5 + 3 + k++) % photos.length].id));
    }
    return { ...p, layout, slots, mirror: layout === "collage" ? p.mirror : undefined };
  });
}

/**
 * Add a photo to a page, growing its layout by one slot.
 * Returns null when the page can't take another (title page, or full) —
 * the caller tells the user why rather than silently doing nothing.
 */
export function addPhotoToPage(b: BookSlice, pageId: string, photoId: string): BookSlice | null {
  const page = b.pages.find((p) => p.id === pageId);
  if (!page || page.layout === "title" || page.slots.length >= MAX_SLOTS_PER_PAGE) return null;
  const layout = layoutForCount(page.layout, page.slots.length + 1);
  if (!layout) return null;
  return mapPage(b, pageId, (p) => ({ ...p, layout, slots: [...p.slots, placement(photoId)] }));
}

/**
 * Remove one photo from a page. The page re-shapes to the remaining
 * count; removing the last photo removes the page.
 */
export function removeSlot(b: BookSlice, pageId: string, slot: number): { book: BookSlice; pageRemoved: boolean } {
  const page = b.pages.find((p) => p.id === pageId);
  if (!page) return { book: b, pageRemoved: false };
  const left = page.slots.filter((_, j) => j !== slot);
  const layout = layoutForCount(page.layout, left.length);
  if (!layout) return { book: { ...b, pages: b.pages.filter((p) => p.id !== pageId) }, pageRemoved: true };
  return { book: mapPage(b, pageId, (p) => ({ ...p, layout, slots: left })), pageRemoved: false };
}

/* ── pages ─────────────────────────────────────────────────────── */

/** Move page `from` so it lands before index `to` (0 is the title, fixed). */
export function movePage(b: BookSlice, from: number, to: number): BookSlice {
  if (from <= 0 || from >= b.pages.length) return b;
  const pages = b.pages.slice();
  const [it] = pages.splice(from, 1);
  const at = Math.max(1, Math.min(pages.length, to > from ? to - 1 : to));
  pages.splice(at, 0, it);
  return { ...b, pages };
}

export function deletePage(b: BookSlice, idx: number): BookSlice {
  if (idx <= 0) return b;
  return { ...b, pages: b.pages.filter((_, i) => i !== idx) };
}

/** Insert a framed page after `afterIdx`, using an unused photo if any. */
export function addPage(b: BookSlice, afterIdx: number, photos: BuilderPhoto[]): { book: BookSlice; index: number; id: string } | null {
  const photoId = unusedPhotoIds(b.pages, photos)[0] ?? photos[0]?.id;
  if (!photoId) return null;
  const id = newPageId();
  const at = Math.max(1, Math.min(b.pages.length, afterIdx + 1));
  const pages = b.pages.slice();
  pages.splice(at, 0, { id, layout: "single", slots: [placement(photoId)], caption: "" });
  return { book: { ...b, pages }, index: at, id };
}

/**
 * Re-arrange the whole book at a new density, keeping the photos in
 * their current reading order and each photo's framing.
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
  const fresh = generatePages(order, density);
  // keep the user's title page (it may carry their own caption/colour)
  const title = b.pages[0]?.layout === "title" ? b.pages[0] : fresh[0];
  const pages = [title, ...fresh.slice(1)].map((p) => ({
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
export const setCaption = (b: BookSlice, pageId: string, caption: string) => mapPage(b, pageId, (p) => ({ ...p, caption }));
