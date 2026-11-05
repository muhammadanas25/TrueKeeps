# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two primary audiences, weighted equally; neither is designed around at the other's expense:

- **Memory keepers.** Couples, new parents and travellers in Pakistan turning photos on their own phone into a keepsake of a milestone they just lived. Mostly non-technical and often building on mobile; they want a good book without having to design one.
- **Gift-givers.** Someone making a book for another person: a parents' anniversary, a friend's wedding, a birthday or Eid gift. They care about the delivery date, presentation, and being confident it will look right before they pay.

Both arrive with an occasion in mind (wedding, baby, travel, birthday, or a mix) and a camera roll of photos of mixed quality.

## Product Purpose

TrueKeeps turns phone photos into a printed, bound photo book. A short quiz (occasion → vibe → title) plus an upload produces a complete book automatically: cover, layouts and captions. The user can view it as a book, customize any part of it, and order it printed and delivered.

Success means a first-time user goes from photos to a book they're proud of, and to a paid order, without ever feeling they had to "design" anything. Users who do want control should never hit a wall.

Tagline: "Beautiful quality, for beautiful moments."

## Positioning

What sets TrueKeeps apart from local print shops and photo studios is all four of these together:

1. **Done for you, in a minute.** Autopilot builds a complete, good book from the quiz and the photos. Customization is optional, not a required step.
2. **See it and shape it before you pay.** The user views the actual book (3-D page-flip preview) and can customize the design (themes, layouts, photo swaps, captions, page order, front and back cover) before ordering. Nothing is a leap of faith.
3. **Premium print quality.** Bookstore-grade paper, binding and colour: a keepsake, not a cheap print.
4. **Online, nationwide delivery.** No studio visit; order from anywhere in Pakistan and it arrives at the door.

## Operating Context

- Primary path: the quiz-first builder at `/wizard`: quiz → upload → generating → reveal (pick a feel) → preview → customize (optional branch) → order → confirm. It's mobile-first.
- Power-user path: the canvas editor (`/create`) for page-level control. It's desktop-oriented and accepted as such; review and ordering work on mobile.
- Users can build signed out (anonymous guest session) and are asked to sign in (Google or email magic link) to save or order; their guest draft carries over. Drafts autosave and can be resumed from `/books`.
- Original founder sketches of the intended flow (auto-generated book → continue to customize the front and back cover → choose a cover style → book preview → upload your own cover photos → select a theme → order) are in `tk1.jpeg`–`tk3.jpeg` at the repo root.

## Capabilities and Constraints

- **Market:** Pakistan only, no international shipping. Prices are in PKR, stored as integer paisa.
- **Payments:** prepaid only through Safepay hosted checkout; no cash on delivery, because the product is personalized. Stripe isn't available in Pakistan.
- **Live in production** on thetruekeeps.com: accounts, owned and autosaved books, builder and editor. Orders, checkout, transactional email and order status (Phase 2B) are next; the roadmap is in `roadmap`.
- **Formats:** 12×12 inch books in softcover, hardcover and layflat; glossy or matte finish at the same price (owner confirmed 2026-11-05). Book themes include ivory, indigo, blush and gallery; `cobalt` remains only for books already saved with it. Occasions wedding, baby, travel, birthday and mix.
- **Print pipeline:** print-safe framing exists in the builder; the 300-DPI print PDF and fulfillment are not finished. The plan is a manual PDF handoff to a local printer first, then a print API later.
- **Planned AI capabilities** (roadmap, not built): smart curation (dedup, blur culling), chronological chaptering, aspect-aware layout, AI-written captions and titles. Copy must not describe these as working until they ship.
- **Open decisions:**
  - Shipping window and delivery promise.
  - Written wording for the Love-it guarantee, and how it fits with no refunds once printing starts.
  - Whether the product is English-only or also in Urdu. It's currently English, `lang="en"`.

## Brand Commitments

- **Name:** TrueKeeps. The logo files are in `Truekeeps-Brand-Kit/logos`; never retype the logo.
- **Tagline:** "Beautiful quality, for beautiful moments."
- **No emoji anywhere in the product UI.** Icons are Lucide only.
- **Brand identity** is `Truekeeps-Brand-Kit/` (v1, Nov 2026), implemented as tokens in `client/src/index.css` (see `docs/adr/010-brand-kit-v1.md`):
  - colours: Indigo, Rose, Paper, with Teal for success only and Mist for lines; one Rose main action and at most one Rose highlight per screen
  - fonts: Figtree for everything except H1 and H2, which keep the wide display face behind `--font-display`
- **Voice:** a warm friend who's good at this: simple words, short sentences, no pressure, no jargon or hype.

## Evidence on Hand

- **Real:** the working product itself (builder, 3-D preview, customization), the occasion presets and per-photo caption sets in `client/src/features/builder/data.ts`, and the logo.
- **None yet:**
  - customer reviews or ratings
  - testimonials
  - order volume or customer counts
  - shipping-time data
  - press
  - any paper certification such as FSC; the printer can't prove one today

  Owner-confirmed on 2026-11-05: free shipping from Rs 10,000 (checkout applies it), the Love-it guarantee (wording pending) and WhatsApp help from 10am to 6pm. Automatic removal of blurry or duplicate photos does not exist; the product warns about photos that may print soft. Future work must not fabricate reviews, testimonials, counts, delivery promises or guarantees.
- **No real product photography** of printed TrueKeep books exists yet.

## Product Principles

1. **Autopilot first, control on demand.** Every step produces a good result with zero decisions. Customization is a branch the user chooses, never a gate.
2. **Show the real book before asking for money.** The preview is the promise; what users see is what gets printed. Print-quality problems (blurry photos, faces in the gutter) are surfaced before ordering, not after.
3. **Truth over persuasion.** No invented proof, no dead controls, no claims for features that haven't shipped. Trust is the product for a prepaid, personalized purchase.
4. **Serve both the keeper and the giver.** Flows, copy and timing work for someone preserving their own memories and for someone racing a gift deadline.
5. **A keepsake, not a print job.** Every touchpoint, from builder to order confirmation, should feel as considered as the physical book.
