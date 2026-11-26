/**
 * The seven steps, and jumping between them.
 *
 * What: the step list the step bar shows (StepsBar.tsx), which step a screen
 * is, and `jumpTo`, which works out where a tap on a step really lands.
 *
 * Why a jump needs rules (owner, 2026-11-26, canvas Round 7 "Direction A,
 * jumpable"): everything a customer chose is saved on the album as they go,
 * so going back never loses anything. Going *forward* past steps is the
 * risky direction, because a later step may now be out of date:
 *  1. Photos added or taken out since the pages were laid out: the pages
 *     are laid out again with the album's arrangement, as step 5 would, so
 *     Check never shows a book missing the new photos. Pages changed by hand
 *     in the editor aren't overwritten: the jump stops at Layout instead.
 *  2. A step that must be answered before the next (fewer than the minimum
 *     photos, no cover style, no title) stops the jump there.
 *  3. Checkout (step 7) follows the approval tick on step 6. A jump to it
 *     lands on checkout only while the album is exactly as approved
 *     (albumKey vs state.approvedKey); after any change it lands on step 6
 *     to be approved again, because what is approved is what prints.
 */

import { arrangeBook, arrangementOf, densityOf } from "./arrange";
import { bookPhotos, isFeelChoice } from "./data";
import type { BuilderState } from "./state";
import { MIN_PHOTOS, visibleArrangements } from "./screens/BookScreen";

export interface StepDef {
  n: number;
  /** short name on the step bar */
  name: string;
}

export const STEPS: StepDef[] = [
  { n: 1, name: "Occasion" },
  { n: 2, name: "Photos" },
  { n: 3, name: "Cover" },
  { n: 4, name: "Name" },
  { n: 5, name: "Layout" },
  { n: 6, name: "Check" },
  { n: 7, name: "Checkout" },
];

/** The step a screen is (0 for screens outside the seven, like the editor). */
export function stepOf(state: Pick<BuilderState, "screen" | "qstep">): number {
  switch (state.screen) {
    case "quiz":
      return 1;
    case "upload":
      return 2;
    case "compose":
      return 3 + (state.qstep ?? 0);
    case "book":
      return 5;
    case "preview":
      return 6;
    case "order":
      return 7;
    default:
      return 0;
  }
}

/** The furthest step a tap or "Back to checkout" may aim for (where it lands: jumpTo). */
export const furthestJump = (reached: number) => Math.min(Math.max(reached, 1), 7);

/**
 * A short fingerprint of everything that prints: pages (photos, layout,
 * framing, captions), cover, words, look and finish. Equal fingerprints mean
 * the album is exactly as it was approved.
 */
export function albumKey(s: BuilderState): string {
  const printed = JSON.stringify([
    s.pages,
    s.title,
    s.subtitle,
    s.fontId,
    s.edge,
    s.themeId,
    s.pageColor,
    s.coverStyle,
    s.coverPhotoId,
    s.coverPattern,
    s.captionsHidden,
    s.finish,
  ]);
  // djb2: plenty for "has anything changed", and short enough to keep in the draft
  let h = 5381;
  for (let i = 0; i < printed.length; i++) h = ((h << 5) + h + printed.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + ":" + printed.length;
}

/** The screen (and question) for a step. */
function screenFor(n: number): Partial<BuilderState> {
  if (n <= 1) return { screen: "quiz" };
  if (n === 2) return { screen: "upload" };
  if (n === 3) return { screen: "compose", qstep: 0 };
  if (n === 4) return { screen: "compose", qstep: 1 };
  if (n === 5) return { screen: "book" };
  return { screen: "preview", pos: 0 };
}

/** True when the pages no longer hold exactly the album's photos. */
export function pagesOutOfDate(state: BuilderState): boolean {
  if (!state.pages.length) return true;
  const want = new Set(bookPhotos(state).map((p) => p.id));
  const placed = new Set(state.pages.flatMap((p) => p.slots.map((s) => s.photoId)));
  if (want.size !== placed.size) return true;
  for (const id of Array.from(want)) if (!placed.has(id)) return true;
  return false;
}

/**
 * Where a jump to step `target` lands, as a state patch. Backwards always
 * lands where asked. Forwards stops at the first step that still needs an
 * answer, and lays the pages out again when the photos changed (see above).
 */
export function jumpTo(state: BuilderState, target: number): Partial<BuilderState> {
  const to = Math.min(target, furthestJump(state.reached));
  if (to <= stepOf(state)) return screenFor(to);
  const photos = bookPhotos(state);
  if (to >= 3 && photos.length < MIN_PHOTOS) return screenFor(2);
  if (to >= 4 && !isFeelChoice(state.coverStyle) && state.coverStyle !== "pattern") return screenFor(3);
  if (to >= 5 && !state.title.trim()) return screenFor(4);
  if (to >= 6 && pagesOutOfDate(state)) {
    if (state.pagesEdited) return screenFor(5); // hand-made pages: let the customer choose on Layout
    const vis = visibleArrangements(photos.length);
    const asked = arrangementOf(state.density);
    const style = vis.shown.includes(asked) ? asked : vis.shown[vis.shown.length - 1];
    const plan = arrangeBook(photos, style, null);
    // new pages mean a new album: it is checked and approved again on step 6
    return { ...screenFor(6), pages: plan.pages, sheets: plan.sheets, density: densityOf(style), pagesEdited: false };
  }
  if (to === 7) return state.approvedKey === albumKey(state) ? { screen: "order" } : screenFor(6);
  return screenFor(to);
}
