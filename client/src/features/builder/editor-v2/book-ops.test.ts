/**
 * Checks for the editor's page rules (owner feedback, 2026-11-22):
 *  - changeLayout moves photos between pages: a bigger layout pulls from the
 *    following pages, a smaller one pushes forward, nothing is repeated, and
 *    photos taken out of the book never come back through it
 *  - addPage never repeats a photo: it uses a spare one or moves one off the
 *    fullest page
 *
 * Run: npx tsx client/src/features/builder/editor-v2/book-ops.test.ts
 */

import { placement, type BookPage, type BuilderPhoto } from "../data";
import { DEFAULT_LOOK } from "../looks";
import { addPage, changeLayout, type BookSlice } from "./book-ops";

let fails = 0;
const expect = (ok: boolean, msg: string) => {
  if (!ok) fails++;
  console.log((ok ? "  ok   " : "  FAIL ") + msg);
};

const photos: BuilderPhoto[] = Array.from({ length: 12 }, (_, i) => ({ id: "p" + i, label: "", shade: 0, w: 3000, h: 2000 }));
const page = (id: string, ...ids: number[]): BookPage => ({ id, layout: "grid", slots: ids.map((n) => placement("p" + n)), caption: "" });
const book = (pages: BookPage[]): BookSlice => ({
  pages,
  themeId: "gallery",
  pageColor: null,
  fontId: DEFAULT_LOOK.fontId,
  edge: DEFAULT_LOOK.edge,
  title: "",
  subtitle: null,
  captionsHidden: false,
  density: "balanced",
  recentColors: [],
});
const ids = (b: BookSlice) => b.pages.map((p) => p.slots.map((s) => s.photoId).join(","));
const all = (b: BookSlice) => b.pages.flatMap((p) => p.slots.map((s) => s.photoId));
const noRepeats = (b: BookSlice) => new Set(all(b)).size === all(b).length;

/* growing: pull from the next pages, never empty a page */
{
  const b = book([page("a", 0), page("b", 1, 2, 3), page("c", 4, 5)]);
  const r = changeLayout(b, "a", { layout: "collage" }, photos.slice(0, 6));
  expect(r.short === 0 && r.book.pages[0].slots.length === 3, "a 3-photo layout on a 1-photo page fills all three slots");
  expect(ids(r.book)[0] === "p0,p1,p2", "it takes the next page's first photos, in reading order");
  expect(ids(r.book)[1] === "p3" && ids(r.book)[2] === "p4,p5", "the next page keeps at least one photo");
  expect(noRepeats(r.book) && r.pulled === 2, "no photo is repeated");
}
{
  const b = book([page("a", 0), page("b", 1), page("c", 2)]);
  const r = changeLayout(b, "a", { template: "S4", n: 4 }, photos.slice(0, 3));
  expect(r.short === 3 && r.book === b, "with no photo to spare the change is refused, not padded with repeats");
}
{
  // p6 to p8 are in the book but on no page (added later): it is used once the pages can't give more
  const b = book([page("a", 0), page("b", 1)]);
  const r = changeLayout(b, "a", { template: "S4", n: 4 }, [...photos.slice(0, 2), photos[6], photos[7], photos[8]]);
  expect(r.short === 0 && ids(r.book)[0].split(",").length === 4 && noRepeats(r.book), "spare photos in the book fill the rest");
}
{
  // the deleted-page bug: p9 was on a page the customer deleted, so it is not in bookPhotos
  const b = book([page("a", 0), page("b", 1)]);
  const r = changeLayout(b, "a", { layout: "duo" }, photos.slice(0, 2));
  expect(r.short === 1 && !all(r.book).includes("p9"), "a photo taken out of the book never comes back through a layout change");
}

/* shrinking: push forward, then "Not in book" */
{
  const b = book([page("a", 0, 1, 2), page("b", 3)]);
  const r = changeLayout(b, "a", { layout: "full" }, photos.slice(0, 4));
  expect(ids(r.book)[0] === "p0" && ids(r.book)[1] === "p1,p2,p3", "the extra photos move to the front of the next page");
  expect(r.pushed === 2 && r.out === 0 && noRepeats(r.book), "and none are lost");
}
{
  const b = book([page("a", 0, 1, 2, 3, 4, 5), page("b", 6, 7, 8, 9, 10, 11)]);
  const r = changeLayout(b, "a", { layout: "full" }, photos);
  expect(r.out === 5 && ids(r.book)[1].split(",").length === 6, "photos with nowhere to go leave the book (they show under Not in book)");
}

/* addPage */
{
  const b = book([page("a", 0, 1, 2), page("b", 3)]);
  const r = addPage(b, 1, photos.slice(0, 4));
  expect(!!r && noRepeats(r.book) && r.book.pages.length === 3, "with every photo placed, a new page takes one off the fullest page");
  expect(!!r && ids(r.book)[0] === "p0,p1", "from the end of that page");
}
{
  const b = book([page("a", 0), page("b", 1)]);
  expect(addPage(b, 1, photos.slice(0, 2)) === null, "every page has one photo and none is spare: no page is added");
  const r = addPage(b, 1, photos.slice(0, 3));
  expect(!!r && ids(r.book)[2] === "p2", "a spare photo goes on the new page");
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
