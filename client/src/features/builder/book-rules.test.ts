/**
 * Checks for the book rules added on 2026-11-21:
 *  - trackRemovals (state.ts): photos taken off pages by hand join the
 *    taken-out list; photos put back leave it; a photo moved between pages
 *    is never counted as taken out
 *  - bookPhotos (data.ts): every re-arrangement starts without them
 *  - the cover photo: our pick, the customer's choice, and the fallback
 *    when the chosen photo is gone; the server's coverPhotoIdOf agrees
 *
 * Run: npx tsx client/src/features/builder/book-rules.test.ts
 */

import { coverPhotoIdOf } from "@shared/document";
import { arrangeBook } from "./arrange";
import { autoCoverPhotoId, bookPhotos, coverPhotoIdFor, placement, type BookPage, type BuilderPhoto } from "./data";
import { trackRemovals } from "./state";

let fails = 0;
const expect = (ok: boolean, msg: string) => {
  if (!ok) fails++;
  console.log((ok ? "  ok   " : "  FAIL ") + msg);
};
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

const page = (id: string, ...photoIds: string[]): BookPage => ({ id, layout: "grid", slots: photoIds.map((p) => placement(p)), caption: "" });

/* trackRemovals */
const before = [page("a", "p1", "p2", "p3"), page("b", "p4", "p5")];
expect(same(trackRemovals(before, [page("a", "p1", "p3"), page("b", "p4", "p5")], []), ["p2"]), "a photo taken off a page joins the list");
expect(same(trackRemovals(before, [page("a", "p1", "p2", "p3")], []), ["p4", "p5"]), "deleting a page takes out its photos");
expect(same(trackRemovals(before, [page("a", "p1", "p3", "p2"), page("b", "p4", "p5")], []), []), "moving a photo within the book takes nothing out");
expect(same(trackRemovals(before, [page("a", "p1", "p3"), page("b", "p4", "p5", "p2")], []), []), "moving a photo to another page takes nothing out");
expect(same(trackRemovals(before, [...before, page("c", "p9")], ["p9", "p7"]), ["p7"]), "putting a photo back takes it off the list");

/* bookPhotos + arrangement */
const photos: BuilderPhoto[] = Array.from({ length: 30 }, (_, i) => ({ id: "p" + (i + 1), label: "", shade: 0, w: i % 3 ? 4000 : 3000, h: 3000 }));
const removed = ["p2", "p7"];
const kept = bookPhotos({ photos, removedPhotoIds: removed });
expect(kept.length === 28 && !kept.some((p) => removed.includes(p.id)), "bookPhotos leaves out the taken-out photos");
const book = arrangeBook(kept, "classic", null);
const placed = new Set(book.pages.flatMap((p) => p.slots.map((s) => s.photoId)));
expect(!removed.some((id) => placed.has(id)) && placed.size === 28, "a re-arranged book has none of them, and all the others");
expect(bookPhotos({ photos }) === photos, "no list: every photo");

/* cover photo */
const squareSecond: BuilderPhoto[] = [
  { id: "wide", label: "", shade: 0, w: 4000, h: 2250 },
  { id: "sq", label: "", shade: 0, w: 3000, h: 3000 },
  { id: "tall", label: "", shade: 0, w: 3000, h: 4000 },
];
expect(autoCoverPhotoId(squareSecond) === "sq", "our pick is the photo that loses least on a square cover");
expect(autoCoverPhotoId([{ id: "x", label: "", shade: 0 }]) === "x", "unknown sizes still give a cover");
expect(autoCoverPhotoId([]) === null, "no photos, no cover");
expect(coverPhotoIdFor({ photos: squareSecond, coverPhotoId: "tall" }) === "tall", "the customer's choice wins");
expect(coverPhotoIdFor({ photos: squareSecond, coverPhotoId: "gone" }) === "sq", "a chosen photo that was deleted falls back to our pick");
expect(coverPhotoIdFor({ photos: squareSecond, coverPhotoId: null, removedPhotoIds: ["sq"] }) === "tall", "our pick skips taken-out photos");
const doc = { photos: squareSecond.map((p) => ({ ...p })), coverPhotoId: "tall" };
expect(coverPhotoIdOf(doc) === "tall", "server: the saved cover photo prints");
expect(coverPhotoIdOf({ photos: doc.photos }) === "wide", "server: a book saved before the choice prints its first photo");
expect(coverPhotoIdOf({ photos: doc.photos, coverPhotoId: "gone" }) === "wide", "server: a missing photo falls back to the first");

console.log(fails ? `${fails} FAILURES` : "ALL CHECKS PASSED");
process.exit(fails ? 1 : 0);
