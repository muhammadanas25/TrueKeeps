# ADR 010 — Adopt Truekeeps Brand Kit v1

**Status:** accepted · 2026-11-05

## Context

The banners showed the new brand, but the interface still used the older design
system (Cobalt, Razzmatazz, Royal Gold, Beige, Gunmetal; Clash Display and
Archivo). Blue and pink competed as main button colours, yellow details and
charcoal bands were outside the new palette, and the footer logo was pink, which
the kit forbids.

`Truekeeps-Brand-Kit/` is now the source of truth: `colours/tokens.css`, the logo
SVGs, and the rules in `README-Brand-Guidelines.md`.

## Decision

**Colour by role.** `client/src/index.css` holds the kit's tokens unchanged, then
role tokens such as `--action`, `--selected`, `--heading`, `--error-fg`. Components
use roles. The old Cobalt token meant both "main action" and "selected", so no
find-and-replace could have migrated it: main actions became Rose 600 and selection
became Indigo. The old tokens are deleted so that a missed use fails visibly.

**Interface colour and book colour are different things.** Colour that prints in a
customer's book (`BOOK_THEMES`, page swatches, page edges, collage shadows) is the
customer's product, not our brand. Brand changes must never alter a saved book. So
`cobalt` stays renderable, and `pickableThemes()` hides it from new books in favour
of Bold Indigo while keeping it listed for a book already using it.

**Heading font.** The kit leaves this undecided and suggests Figtree 800 as a
stand-in. The owner chose to keep the current wide face. It stays behind one token,
`--font-display`, and is limited to H1 and H2 at the kit's sizes, with opened
tracking and word spacing because its word spaces are narrow. Everything else is
Figtree. Clash Display is what customers see today; `SFC Woster Sans` sits first in
the stack but its licensed files are not in the repo, and adding them would change
every heading.

**Warnings.** The kit has no error or warning colour. We use Rose 50 with Rose 800
text (8.15:1), always with an icon and words.

**Product spec follows the marketing.** The owner confirmed 12×12 inches on every
binding and a glossy or matte finish at the same price. `PAGE_INCHES` is 12×12, so
print-quality checks are stricter than before. The finish is a printing instruction
stored on the order (migration 0003), not a price input.

## Consequences

- A 1600px photo, the size WhatsApp commonly sends, prints near 133 DPI across a
  full 12-inch page. That is below the 150 DPI floor, so these photos now show a
  "may look soft" note on full-page layouts, where at 8×8 they passed. The note is
  accurate and orders can still proceed.
- Old books' ivory and blush themes still print accents in the previous Cobalt and
  Razzmatazz. Changing them would alter saved books, so it needs a deliberate choice.
- `.bb-shell` resets now use `:where()`. Previously their specificity stripped every
  builder button and card of its background and border.
- `/templates` redirects to `/photo-books`; the gallery had dead controls and stock
  photos, and nothing linked to it.

## Alternatives rejected

- **Remapping old token values to new colours:** quick, but would make every builder
  button Indigo and leave misleading names like `--tk-cobalt` in the code.
- **Recolouring `cobalt` in place:** simpler, but changes saved and possibly
  already-ordered books without their owners asking.
- **Restyling `/templates`:** would only give broken controls a better colour.
