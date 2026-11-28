/**
 * The original album: the book as it was before the editor changed it.
 *
 * What: "Start again from the original" in the editor and "Back to original"
 * on step 6 (owner, 2026-11-28, canvas "Truekeeps: Undo edits and step 5 on
 * phones"). The owner's test showed what "original" must mean: the book
 * that was made before the editor, exactly. Laying the pages out again was
 * not enough, because the editor can also change the layout style, the
 * title, the cover and the look.
 *
 * Approach:
 *  1. snapshotBook(): when the editor opens on a book nobody has
 *     edited by hand (pagesEdited false), every field the editor can change
 *     (ENTRY_KEYS) is copied into state.original. A later visit to the
 *     editor, after edits, leaves that copy alone, so it stays the
 *     pre-editor book. Step 5 laying the book out again clears pagesEdited,
 *     so the next editor visit takes a fresh copy of the new book.
 *  2. restoreOriginal(): puts that copy back. If it can't be trusted, because
 *     a photo in it has since been deleted or there is no copy (a book made
 *     on another device, or before this existed), it falls back to
 *     relaidBook(): the engine's layout with every photo in, the same choice
 *     step 5 and jumpTo() (steps.ts) make.
 *
 * `pagesEdited: false` travels with the restored pages, so the reducer
 * (state.ts) doesn't count them as one more hand edit.
 */

import { arrangeBook, arrangementOf, densityOf } from "./arrange";
import { bookPhotos } from "./data";
import { visibleArrangements } from "./screens/BookScreen";
import type { BuilderState } from "./state";

/** Every field the editor can change: what a snapshot keeps and a restore puts back. */
export const ENTRY_KEYS = [
  "pages",
  "pagesEdited",
  "removedPhotoIds",
  "sheets",
  "density",
  "themeId",
  "pageColor",
  "fontId",
  "edge",
  "title",
  "subtitle",
  "captionsHidden",
  "coverStyle",
  "coverPhotoId",
  "coverPattern",
  "coverFrame",
] as const satisfies ReadonlyArray<keyof BuilderState>;

/** Those fields of `s`, as a patch. */
export function pickEntry(s: BuilderState): Partial<BuilderState> {
  const out: Record<string, unknown> = {};
  ENTRY_KEYS.forEach((k) => {
    out[k] = s[k];
  });
  return out as Partial<BuilderState>;
}

/**
 * The patch that records the current book as the original, or null when the
 * saved one still holds (see 1 above). A copy is replaced only when the pages
 * were laid out again since (step 5, or new photos): a visit that changed
 * only the title or the look keeps the copy from before that visit.
 */
export function snapshotBook(s: BuilderState): Partial<BuilderState> | null {
  if (s.pagesEdited) return null;
  if (s.original && JSON.stringify(s.original.pages) === JSON.stringify(s.pages)) return null;
  return { original: { ...pickEntry(s), pagesEdited: false } };
}

/** The engine's layout with every photo back in (the fallback, see 2 above). */
export function relaidBook(state: BuilderState): Partial<BuilderState> {
  const photos = bookPhotos({ ...state, removedPhotoIds: [] });
  const vis = visibleArrangements(photos.length);
  const asked = arrangementOf(state.density);
  const style = vis.shown.includes(asked) ? asked : vis.shown[vis.shown.length - 1];
  const plan = arrangeBook(photos, style, null);
  return { pages: plan.pages, sheets: plan.sheets, density: densityOf(style), removedPhotoIds: [], pagesEdited: false };
}

/** The book before the editor, or the fallback when that copy can't be used. */
export function restoreOriginal(state: BuilderState): Partial<BuilderState> {
  const o = state.original;
  const have = new Set(state.photos.map((p) => p.id));
  const usable = Boolean(o && o.pages && o.pages.length && o.pages.every((pg) => pg.slots.every((x) => have.has(x.photoId))));
  if (!usable) return relaidBook(state);
  const cover = o!.coverPhotoId;
  return { ...o!, pagesEdited: false, ...(cover && !have.has(cover) ? { coverPhotoId: null } : null) };
}
