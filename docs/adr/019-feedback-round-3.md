# ADR 019: Feedback round 3 (the team's 30-item list)

Date: 2026-11-23 · Status: accepted, live

## Context

On 2026-11-22 the owner sent a 30-item list from the team (desktop, phone and
editor feedback, plus the FAQ, three policies and eight font pairs in
`Website Assets_v3`). It was designed as "Round 5" on the design canvas and
approved with these decisions: the golden ratio for words and photos
everywhere; Classic from 21 photos and Family Album from 41; step 5 keeps
today's desktop cards, adds them to phones and loses the pages control; books
start at 10 pages; delivery as checkout charges it; paid orders go straight to
print (no cancel window); bank transfer only for now; promo codes set up in
Admin; captions never over a photo; occasion-based caption suggestions; logo
only on the back cover.

## Decisions

**Golden ratio.** Photo 61.8% / words 38.2% on covers; type steps title →
title ÷ φ (line under it) → title ÷ φ² (captions, `CAPTION_SIZE`). The title
sits in a box at most 6 in wide (half the 12 in cover), two lines at most,
`TITLE_MAX` 32 characters; 0.75 in cover margin, 0.5 in clear at the spine's
ends. Sizes are fractions of the cover, so a phone preview is the printed
cover made smaller.

**Layout changes move photos; they never copy or drop them.**
`changeLayout` (editor-v2/book-ops.ts) pulls from following pages (never
emptying one) or spare photos in the book, and pushes extras forward, else to
"Not in book". It takes `bookPhotos(state)`, which is what stops a deleted
page's photos from coming back. `addPage` and spread presets follow the same
rule. The picker offers the engine's own 4–6 photo templates
(`PICKER_TEMPLATES`).

**Captions.** Allowed on framed, two-photo, row and engine pages; not on
full-page photos or collages. An engine page makes room by scaling its slot
rectangles uniformly toward the top (`captionFrames`), so crops don't change
and preview and print agree.

**Step 5.** An arrangement shows only when it makes a different book from the
one before (`visibleArrangements`, derived from the engine, not hard-coded).

**One standing order per book.** `createOrder` refuses a second order for a
project with a live order unless `again` ("Order another copy"). Steps 6 and 7
show the order for an ordered book (`useOrdered`).

**Print files match the preview.** `cover.pdf` draws each cover style with the
preview's geometry and adds the back cover (logo paths from the brand kit,
indigo or white by WCAG contrast). `jpegs.zip` is rendered *from* the checked
PDFs with pdf.js on @napi-rs/canvas (no system packages), so the JPEGs can't
differ from the PDFs. Names follow sheets: `sheet-NN-front/back`.

**Patterns** are data in `shared/patterns.ts`, drawn by both the preview (SVG)
and the print (pdfkit).

**Promo codes** come off the book price, never delivery; the server re-checks
and prices them when the order is placed; uses are counted from standing
orders (migration 0009).

**Quality flags.** Small (short side < 800 px) or far blurrier than the
book's own median (variance of the Laplacian, measured while uploading). Only
outliers. The book saves the flagged photos on its pages, so the order records
that the warning was shown.

## Not done, and why

- **The eight font pairs.** They are Fontshare fonts under the ITF Free Font
  License 2.0, which forbids "making the Font Software available as a
  selectable font for third-party users to create… their own content" and
  redistribution (the repo is public). The live "Classic" lettering uses Clash
  Display from Fontshare and has the same problem. Needs the owner's call: a
  commercial licence from ITF, or open-licence (OFL) look-alikes. (Built 2026-11-24 on the free licence for the prototype: ADR 020.)
- **Deleting photos 30 days after printing, and unfinished books after 30
  days.** Irreversible; needs its own careful build. The FAQ and policies don't
  promise it until it exists.
- **The From address.** Code sends as "TrueKeeps" whatever `EMAIL_FROM` holds;
  switching to orders@thetruekeeps.com needs the domain verified in Resend
  (DNS) and the Railway setting changed.
- **Privacy and Terms pages.** Drafting waits for the owner's review.
