# ADR 021: Website copy v1 (delivery by city, the 6-hour cancel window)

Date: 2026-11-26 · Status: accepted

## Context

The owner's "The Truekeeps: Website Copy (Final)" (22 Nov 2026, Aamir) gives
the words for the landing page, footer, builder steps 1 to 7 and the Prices
page. Beyond wording, it changes two rules the site enforces, and it asks for
features that weren't built. On 2026-11-26 the owner decided: delivery by city
as the doc says; the 6-support-hour cancel window as the doc says; price lines
stay as they are until layout prices are set (no "Rs xxx" on the site); none
of these four features yet: hardcover only, a 15-photo minimum, the 8
occasions in the builder, an empty required title field.

## Decisions

**Delivery by city** (`shared/pricing.ts` `deliveryFor`): Karachi free, the
rest of Pakistan Rs 200, Gilgit-Baltistan, Azad Kashmir and Balochistan
outside Quetta Rs 500. Karachi is the city field matched as a word. Until a
city is typed the checkout says "Add your city to see" and the total leaves
delivery out (`Quote.deliveryKnown`). The server re-quotes with the full
address, as before. Price list version `pkr-2026-11-26`.

**Cancelling**: by phone within 6 support hours of paying (Mon to Fri, 10am
to 6pm), restoring the owner's original cancellation policy wording. Staff
cancel and refund from Admin as before; the print file still builds at once,
so it is not sent to the printer inside the window.

**Words**: the doc's copy, with the word table (book → album, Lettering → Font
style, Paper → Finish, Family Album → Gallery, Full Picture → Photo cover).
Copy the doc marks "not final" (editor, occasion pages' text, account pages,
emails, Google titles) is left alone, except where a fact changed (delivery,
cancelling) and the global button names.

**Kept true, so left out or reworded**: "Customers' favourite" (no data yet;
"Our pick" stays), "Extra copies are cheaper" (they cost the same), "Photos
deleted 30 days after printing" (not built), "Upload your receipt" (not built;
WhatsApp it), different prices per layout, "Rs xxx". "12x12 inch hardcover"
appears in the landing copy as written, though checkout still offers
softcover and layflat.

**Small fixes**: pinch-zoom allowed (no `maximum-scale`), with iOS fields kept
at 16px so focusing one doesn't zoom the page; alt text on the closing banner;
Instagram in the footer; the "HD 4/13" counter left the builder top bar
(progress shows in step 3).

## Not done

Numbered clickable progress bar, gift tick box, receipt upload, "Your own mix"
card with its own image and page, About us / Contact us / Privacy pages, the
open items in the doc's section 1 (prices, WhatsApp number, "Saved" wording,
brand spelling, 3-day vs 24-hour hold).

## Follow-up the same day (owner, 2026-11-26)

- **Rs 6,490 an album, hardcover only.** `quote()` prices every order as
  hardcover (`PRICE_LIST.offeredBinding`); the checkout's binding choice is
  gone. Softcover and layflat stay in the list so older orders still read.
  Price list version `pkr-2026-11-26b`.
- **Delivery: Karachi free, Rs 200 flat everywhere else.** The Rs 500
  remote-area charge and `isRemoteArea` are gone.
- **Four looks in the editor**: Gallery White, Soft Blush, Sage Garden, Golden
  Hour. Timeless Ivory, Bold Indigo, Midnight and Kraft Journal are retired
  like Bold Cobalt: a book that uses one still shows and prints it.
- **No Shadow photo edge** in the editor (listed only for a book that has it,
  like Bordered); Golden Hour now starts with clean edges.
- **"Know your album"** (the owner's design export) replaces the "What you
  get" banner on the landing page, with its styles and banner images removed.
  Facts are read from the price list and layout engine: the page range shows
  10 to 32 (the design said 11 to 29), and the button says "Start my album"
  (the design said "Make my book", which the word table retired).

## Follow-up, 2026-11-26 (evening): ground colour, dividers, step 1, layout pictures

- **Page ground is now #F7F5FF** (`--surface-page`, index.css), headers and
  sticky bars too (`--surface-page-glass`). Paper (#FBF6F0) stays as
  `--surface-warm` in the two places the owner kept beige: the landing's
  occasions band (`.lp-warm`) and builder step 3, "Pick a cover style"
  (`.ck-compose.ck-warm` re-points the page token, so the phone's sticky
  action bar follows). Know your album keeps its own beige.
- **The Rose dash before section labels is gone**; it read as a generic
  template. Chapters are marked by `BookDivider` (sections.tsx), the owner's
  pick of three options: a hairline with a tiny album that opens, draws its
  line out and turns a page as it scrolls in, and turns a page again on
  hover. Open and still without motion (prerender, headless, reduced motion).
- **Step 1's small "live preview" book is gone**, with its caption, which
  described that book. The real album photo and the price remain.
- **Layout pictures keep one colour set** (book.tsx `WIRE_STYLE`): they had
  been mixed from the album's look, so the same layout looked different from
  album to album (step 5 cards, both editors' layout pickers).

**Revised 2026-11-27:** the owner found the opening book and the beige band
too strong on the landing. The divider is now a single hairline that draws
out from the centre on scroll, and Know your album plus the occasions sit on
#F4F4F4 (landing.css `--lp-band`). Builder step 3 keeps beige.

**Corrected 2026-11-27:** "the current beige on the pick a cover section"
meant the stage behind the book. The tan board (#E8DCCD) on steps 3 to 6 is
now Paper beige (`--surface-stage`), and step 3's question side is lavender
like every other step; the `ck-warm` exception was removed.
