# ADR 008 — Editor v2 for the customize step (phone-first), classic kept as a switch

**Status:** accepted · 2026-10-18

## Context

Customers mostly arrive on phones. The classic customize screen had
grown controls faster than room: the page strip sat below a long scroll,
on phones the strip couldn't be scrolled past the first pages (it grabbed
every touch for reordering), turning pages got harder once photos could
be dragged to reposition, and the right-hand toolbox (two rows of
colours, every control visible) felt cluttered. A redesign was
prototyped in `editor_v2/` (Claude Design), inspired by onceupon.photo:
more choice, shown progressively.

## Decision

- New editor in `client/src/features/builder/editor-v2/`, used for the
  customize step by default. The classic editor stays: "⋯ → Switch to
  classic editor" in v2, "Try the new editor" in classic, or
  `?editor=classic|v2`. Per-device preference (`editor-v2/pref.ts`);
  both editors edit the same book.
- **One renderer.** v2 draws pages with the existing `PageFace`
  (book.tsx) — the same component as the 3-D preview, the order screen
  and the print snapshot — via a new `renderSlotOverlay` hook, rather
  than porting the prototype's own page renderer. Editing therefore
  can't drift from what prints.
- **Phone-first layout.** One page at a time on phones (≈360 px instead
  of a 180 px half-spread), spreads on desktop; everything fits one
  screen (no page scroll); panels open one at a time (desktop drawer,
  phone bottom sheet); a selected photo swaps the phone tabs for its
  actions.
- **Gestures** (`SlotLayer.tsx`): one finger swipes pages; a one-finger
  drag only moves a photo while adjusting it; a two-finger pinch on any
  photo zooms it and starts adjusting on its own; two fingers move it.
  The stage counts fingers in the capture phase so a pinch is never
  read as a page swipe. Zoom/pan reuse `panFrame`/`slotMaxZoom`, so the
  print-quality ceiling still holds. The strip and the All-pages grid
  reorder on press-and-hold (touch) or drag (mouse), leaving normal
  swipes to scroll.
- **Style moves into the book model** so every renderer and the server
  see it: 4 new looks (Sage, Midnight, Golden Hour, Kraft) in
  `BOOK_THEMES`; `fontId`, `edge`, `subtitle`, `captionsHidden` on
  builder state and the saved document; any `#RRGGBB` page colour and a
  per-page `bg` ("This spread"). Ink is still picked by contrast
  (palette.ts). These reach `PageFace`/`CoverFace` through
  `PageLookContext` (looks.ts), which also carries the editor-only
  inline text-editing callbacks. All fields are optional in the
  document schema; older books render exactly as before.
- Edits are pure functions (`editor-v2/book-ops.ts`) with a local undo
  history; gestures record one undo step each.

## Consequences

- `PageFace` gained a hook and a context read; classic-editor behaviour
  is unchanged (it still uses `onSlotClick`/`SlotHit`).
- The print pipeline (Phase 3) must honour `fontId`, `edge`,
  `captionsHidden`, `subtitle` and per-page `bg` from the snapshot.
- Instrument Serif and Caveat are loaded from Google Fonts (index.html)
  for the Editorial and Handwritten typefaces.
- Not ported from the prototype: its procedural sample photos and the
  design-review tweaks panel. "Preview" opens the existing 3-D preview
  instead of a separate reading mode.
