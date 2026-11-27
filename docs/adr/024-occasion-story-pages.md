# ADR 024: Occasion story pages, starting with the wedding page

- Status: accepted (owner approved the design on 2026-11-28)
- Copy: "The Truekeeps: Wedding Page Copy" (PDF, 28 Nov 2026)
- Design: claude.ai Design canvas "Truekeeps: Wedding page"
  (https://claude.ai/artifact/Xw7JhwVKYzAytydGxubjRy), now beside proposed
- No migration, no API change.

## Context

Each occasion had the same short page: an intro, four ideas, three plain
steps, a three-box price block and the other books. The owner wrote a full
page for weddings, in a fixed order:

Hero → Why print your wedding photos → What to put in it → Cover styles →
How it works → Price line → Other occasions → Questions → Closing button

The document says to use its words exactly, to drop the old price block, and
that "Rs xxx" means the real price.

## Decision

1. **Copy is data.** `shared/occasion-stories.ts` holds the page copy per
   occasion slug. Only wedding has one, so the other occasions keep the
   short page until their copy arrives. `BookTypePage` (landing/pages.tsx)
   renders `OccasionStoryPage` (landing/occasion-story.tsx) when a story
   exists.
2. **Questions are FAQPage data too.** `shared/site.ts` adds
   FAQPage JSON-LD built from the same array, so the visible questions and
   the structured data can't disagree.
3. **The price is read, never typed.** The price line uses
   `STARTING_PRICE_MINOR` (today Rs 6,490) and links to /photo-books.
4. **Same parts as the homepage.**
   - Shared components:
     - the three step cards are now an exported `HowSteps`, used by the
       homepage and the story page;
     - `FinalCTA` gained `minimal` (heading and button only) and `href`;
     - `StickyCTA` gained `href`, so every "Start my album" on the wedding
       page opens the builder with Weddings chosen. The builder's
       `seedFromUrl` then skips step 1, as the copy asks.
   - The light sections alternate lavender and #F4F4F4 (`.lp-warm`), as on
     the homepage (ADR 021).
5. **Covers drawn in CSS.** The three cover cards (Minimal, Photo cover,
   Just text, with the builder's names and lines) are CSS in landing.css
   (`.os-cv-*`), using one crop of the owner's wedding album photo
   (`assets/cover-wedding.webp`). Rendering the builder's real `CoverFace`
   would pull the builder chunk into a prerendered public page. The
   proportions follow builder.css: the 38.2% text line and the 4.17% photo
   border.
6. **Truth rule holds over "use the words exactly".** Checkout has no gift
   tick box yet. It is in the Checkout Copy doc, marked "missing in current
   build". So the question "Can I send it as a gift to the couple?" is held
   back, and the exact text sits in a comment in occasion-stories.ts. It
   goes back in when the gift option ships. Restored 2026-11-28, when the gift
   box shipped (ADR 025).

## Consequences

- A new occasion page is a data entry plus, if needed, a hero image. No new
  component is needed.
- The story page calls `useScrollReveal`. Reason: in-app navigation from
  the homepage leaves `html.motion-ok` set, which would otherwise keep the
  step cards hidden.
- All new CSS is scoped `.os-*` and appended to landing.css, so the build
  doesn't reorder it (see the CSS load-order pitfall).
