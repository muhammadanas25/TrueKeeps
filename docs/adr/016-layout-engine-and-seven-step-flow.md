# ADR 016 — Layout engine and the seven-step "Make My Book" flow

**Status:** accepted · 2026-11-17

## Context

The owner's brief "Make My Book flow (v2)" (2026-11-15) set out seven steps:
occasion, photos, the feel, name and lettering, pick your book, check and
approve, pay. It also raised two problems with the books we made:

- **Too many sheets.** `generatePages()` dealt photos into a fixed rhythm of at
  most three slots a page. A 36-photo phone mix needed 14 sheets (Rs 10,640),
  and one sheet is expensive.
- **Photos treated badly.** Every slot was filled edge to edge in upload order,
  so a portrait could land in a wide slot and lose up to 65% of itself, and a
  small file could be blown up past what prints sharp.

The flow was designed first on a claude.ai design canvas, with the owner's
choices on 2026-11-16 and 2026-11-17: one choice on step 5 (Story, Classic or
Family Album), no options that can't be chosen, at least 10 photos, books up to
16 sheets, and on phones "Option C": the book on a dark stage one page at a
time, the choices in a white sheet below.

## Decision

**Layout engine (`client/src/features/builder/arrange.ts`).** Pure functions,
ported from the canvas prototype (`flow_v2/layout-engine.cjs`) and tested by
`arrange.test.ts` (`npx tsx client/src/features/builder/arrange.test.ts`).
26 page templates of one to six slots in 3:2, 2:3 and 1:1, inside a 0.5 in
margin with 0.25 in gaps. A bitmask DP pairs photos with slots on a page; a
second DP cuts the photo list, in order, into exactly the pages asked. Three
promises: a photo goes to a slot of its own shape when the page can offer one;
no slot trims more than 18% of a photo (the slot is reshaped instead); no photo
prints under 150 dpi (it prints smaller instead). The panorama spread of the
prototype is off: it needs layflat binding, which the order does not require.
Same 36 photos: Classic 5 sheets (Rs 5,690), Story 9, Family Album 5; at most
18% trimmed, nothing the wrong way round.

**"grid" pages.** The engine's pages use a new layout id, `grid`, and carry
their slot rectangles (`BookPage.frames`, fractions of the page). The preview
(`PageFace`), the print-size maths (`slotInches` takes the page, `SlotSource`),
the saved document (`shared/document.ts`, optional `frames`), autosave
(`sync.ts`), local drafts (`state.ts`) and the print renderer (which now writes
each grid slot's `rect` in inches to the manifest) all read the same
rectangles. Placements keep the existing focal-point model; the engine's crop
is `fx 0.5, fy 0.4, zoom 1`.

**Arrangement stored in `density`.** `minimal` = Story, `balanced` = Classic,
`collage` = Family Album. No schema change, and every saved book reads as one
of the three. The chosen sheet count (`sheets`) is client state only: the pages
are the book and the price counts them.

**Editors.** Both editors keep working on grid pages. Adding, removing or
swapping a photo lays a grid page out again (`reshapePage`), and a grid page
holds up to six photos (`pageCapacity`). The layout pickers gain "Auto", which
hands any page back to the engine; picking a named layout turns a page into
that layout as before. Grid pages have no caption.

**Flow.** `quiz → upload → compose → book → preview ↔ (customize | order)`:
- step 1 shows "Starting from Rs 5,690"
- step 2 locks under 10 photos, suggests 30 to 50 under 30, ticks from 30
- steps 3 and 4 are the compose questions: the feel (Minimal, Full Picture,
  Truekeeps Design, the owner's names for the classic, moment and signature
  covers) and name, a line under it, and lettering; the colours question went
  (colours stay on the preview and in the editor)
- step 5 is the new BookScreen; the "generating" and "reveal" screens are gone
  (a draft saved on either resumes at step 5)
- step 6 adds the cover switch and the required approval box
- step 7 shows the paper chosen on step 5 instead of asking again

A page laid out by hand is never thrown away silently: the reducer marks
`pagesEdited` when pages change outside step 5, and step 5 keeps those pages,
with a note, until the customer changes a choice there.

**Phones.** `PageRibbon` shows the book one page at a time on an Indigo 700
stage, with native scroll-snap and a measured page size; steps 5 and 6 put
their choices in a white sheet below it.

## Saved books

Saved books never change. Books with named layouts render, edit and print as
before. "Auto" in an editor is the only way an old page becomes a grid page.

## Consequences

- Fewer sheets for the same photos, so most books cost less.
- The print manifest gains `rect` for grid slots; whoever assembles pages from
  the manifest must place grid slots by it.
- The screen entrance animation now fills `backwards` only: the old `both`
  left an identity transform behind, which unpinned fixed action bars.
- Open owner decisions (not blocking): "Our pick" on Classic is a
  recommendation, not a sales claim; binding stays on the order step; the PDF
  asks for 4 to 6 letterings and there are 4.

## Revision 2026-11-21 (owner-approved designs, canvas "Round 2")

- **Cover photo is its own choice.** `BuilderState.coverPhotoId` (null = "let
  us pick": of the first twelve photos, the one that loses least on a square
  cover). Picking never reorders photos, which are the book's reading order.
  Every cover reads it through the page look; the saved document stores the
  resolved id plus `coverAuto`, and the server's `coverPhotoIdOf` (orders,
  print files) falls back to the first photo for books saved before.
- **Taken-out photos stay out.** The reducer keeps `removedPhotoIds` from hand
  edits (`trackRemovals`); every re-arrangement uses `bookPhotos()`, so step 5
  and the editors' arrangement controls no longer bring them back, and photos
  added later go in. Step 5 says so, with "Put them back".
- **"Just text" replaces "Truekeeps Design"** as the third cover (the existing
  `minimal` style). `signature` still draws for saved books and is offered
  only to a book that uses it.
- **Flow fixes:** the question is the heading on steps 3 and 4; the line under
  the title starts empty with a grey example; no sign-in pop-up on step 5
  (a quiet link instead); step 6 puts the book left and everything to check
  and approve right, all on one screen (page colours move to the editor);
  phones get a seven-part step bar; step 2 states the 10-photo minimum up
  front; an odd page count warns that the last page prints blank, with
  "Add a page"; step 5 cards show a small drawing of each arrangement.
- Tests: `npx tsx client/src/features/builder/book-rules.test.ts`.
