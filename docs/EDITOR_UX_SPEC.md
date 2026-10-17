# Editor UX Spec — reframe, layouts, colour, auto-arrange

Status: proposal, 2026-09-13. Scope: the `/wizard` builder only
(`client/src/features/builder/*`). Companion to `PRODUCT_SPEC.md` and
`roadmap`; where those two already say something, this document gives the
interaction detail and the data model rather than repeating the intent.

---

## 0. The one-paragraph version

The editor's real quality problem is not that photos stretch — they can't,
because every tile is `object-fit: cover` (`builder.css:208`). It is that
every photo is **silently centre-cropped with no way to fix it**, and that
the upload pipeline throws away the resolution needed to print a full-bleed
page. This spec fixes both with a single small addition to the data model: a
*placement* (focal point + zoom) per photo slot, where zoom is capped by the
photo's own pixel count so the user physically cannot zoom into blur. Layout
picking, background colour and smarter auto-arrangement then hang off the
same model without adding a canvas, a crop rectangle, or a rotation slider.

---

## 1. What the code does today

The autopilot flow is good and should not change. `generatePages()`
(`data.ts:285`) walks a density pattern (`data.ts:263`), deals photos into
slots in upload order, and produces a `BookPage[]`. `CustomizeScreen` renders
one spread plus a side panel and lets the user change a page's layout, swap a
photo, edit a caption, drag pages to reorder, and switch the whole-book theme
and density. State lives in one reducer with a debounced localStorage
snapshot (`state.ts`). It is clean and extensible — none of what follows
requires restructuring it.

Four concrete gaps, in the order they hurt:

**Resolution is destroyed before upload.** `client/src/lib/uploads.ts:32` caps
every file at `maxWidthOrHeight: 2400` and 2.5 MB *before* the bytes leave the
browser, so the server never sees the original. A typical 3:2 phone photo
becomes 2400×1600. On an 8×8 full-bleed page (8.25″ with bleed) that prints at
**194 DPI**; on a 12×12 it prints at **131 DPI**, below any printer's floor.
This is the blurry-print risk, and no amount of editor polish fixes it.

**Every crop is a centre crop, forever.** A 3:2 landscape dropped into the
square `full` layout loses 33% of its width, always from the same two edges. If
a face sits near an edge, it is cut, and there is nothing the user can do. This
is exactly the hole that onceupon fills with its crop dialog.

**One duo variant, and it's the wrong one for portraits.** `.bb-page` is
`flex-direction: column`, so `.bb-page-duo` (`builder.css:291`) stacks its two
slots vertically. With 7.5% page padding each slot is roughly 0.85 × 0.40 of a
square page — a **2.1:1 letterbox**. Two landscape photos look great there. Two
portraits get destroyed. There is no side-by-side variant.

**Captions are confidently wrong on real photos.** `UploadScreen` assigns
occasion labels round-robin by index (`UploadScreen.tsx`, `occ.photoLabels[n %
…]`), and `generatePages` commits that label as the page caption for every
`single` page. With the striped placeholders this reads as charming design
copy. With real uploads it prints "the vows" under a photo of the cake.

Also worth noting for the record: three editor surfaces are reachable
(`/create`, `/wizard`, `/wizard-classic`) and only `/wizard` is the product.
The roadmap's old complaint that `create.tsx`'s position/size/rotation sliders
were `defaultValue`-only is now out of date — they are wired to
`updatePlacedPhoto()` and PATCH the server (`create.tsx:815–865`). That makes
the problem worse, not better: it means a second, *working*, free-canvas
editor exists on a different data model (`pagePhotos` x/y/width/height/
rotation) with no shared code. Retiring `/create` and `/wizard-classic` is the
single cheapest UX improvement available and a prerequisite for everything
below, because otherwise each feature has to be built twice against two
incompatible models.

---

## 2. Placements — the core model change

Add one type. Everything else in this document is a consumer of it.

```ts
/** How one photo sits inside one slot. Aspect-safe by construction. */
export interface Placement {
  photoId: string;
  /** CSS object-position, 0–1 on each axis. 0.5/0.5 = centre (default). */
  fx: number;
  fy: number;
  /** ≥ 1. 1 = exactly cover-fit. Upper bound is resolution-derived. */
  zoom: number;
  /** Quarter turns only — EXIF fix or a deliberate turn. No free rotation. */
  turn: 0 | 90 | 180 | 270;
}

export interface BookPage {
  id: string;
  layout: PageLayoutId;
  slots: Placement[];      // replaces photoIds
  caption: string;
  bg?: string;             // §5
}

export interface BuilderPhoto {
  id: string;
  label: string;
  shade: number;
  url?: string;
  w?: number;              // natural pixels, captured at upload
  h?: number;
}
```

### Why a focal point and not a crop rectangle

A crop rectangle is expressed in the frame's aspect ratio. The moment the user
changes the layout, mirrors the spread, or the auto-arranger reflows the page,
that rectangle is meaningless and has to be re-derived — which in practice
means silently discarding the user's edit. A normalised focal point plus a
scalar zoom is **aspect-independent**: it survives a layout change, a mirror,
a density regeneration, and a switch from an 8×8 to a 12×12 book. It is also
two numbers instead of four, and it maps one-to-one onto CSS the browser
already implements correctly.

### Why this makes stretching structurally impossible

`object-fit: cover` with `object-position: fx% fy%` places the photo's `(fx,
fy)` point at the box's `(fx, fy)` point and guarantees the box is fully
covered for any `fx, fy ∈ [0,1]`. Adding `transform: scale(zoom)` with
`transform-origin: fx% fy%` scales about that same physical point, so the
focal point stays pinned and coverage is preserved for any `zoom ≥ 1`. There
is no code path that sets `object-fit: fill`, no width/height override, and no
pan clamp to get wrong. Aspect ratio is preserved by the browser, not by our
arithmetic.

Rendering is a three-line change inside `Ph` (`book.tsx`):

```tsx
<img
  src={photo.url}
  alt={photo.label}
  draggable={false}
  style={{
    objectPosition: `${p.fx * 100}% ${p.fy * 100}%`,
    transform: `${p.turn ? `rotate(${p.turn}deg) ` : ""}scale(${p.zoom})`,
    transformOrigin: `${p.fx * 100}% ${p.fy * 100}%`,
  }}
/>
```

`builder.css:208` stays exactly as it is. For the collage layout the ±2.5°
tilt lives on `.bb-ph` and the scale lives on the inner `img`, so the two do
not collide.

### Why zoom is capped by resolution

Given a slot whose printed size is `W × H` inches and a photo of `Pw × Ph`
pixels, the effective print resolution at cover-fit is `min(Pw/W, Ph/H)`, and
at zoom `z` it is that divided by `z`. So:

```ts
export const DPI_IDEAL = 300;
export const DPI_MIN = 150;      // hard floor — the slider stops here

export const effectiveDpi = (px: {w:number;h:number}, inch: {w:number;h:number}, zoom = 1) =>
  Math.min(px.w / inch.w, px.h / inch.h) / zoom;

export const maxZoom = (px: {w:number;h:number}, inch: {w:number;h:number}) =>
  Math.max(1, Math.min(px.w / inch.w, px.h / inch.h) / DPI_MIN);
```

The zoom slider's maximum is `maxZoom(...)`, recomputed whenever the photo or
the slot changes. **The slider physically stops where print quality stops.**
The user never has to understand DPI, and cannot produce a blurry book by
zooming. As far as I can tell no competitor does this — onceupon lets you zoom
freely and warns afterwards, which puts the burden on the user.

This also gives an honest read on the compression problem. With today's
2400px cap, a 3:2 photo on a full-bleed 8×8 page has a max zoom of **1.29×** —
the slider would barely move, which is the feature telling you the pipeline is
starving it. Raise the cap to 4096px and the same photo gets **2.21×** of
headroom and prints at 331 DPI.

### Slot geometry, single source of truth

The DPI maths needs each slot's printed size, which today only exists as
percentages in `builder.css`. Put it in `data.ts` as fractions of the page and
have the CSS read the same numbers via custom properties, so the two cannot
drift:

| layout | slot | w × h (fraction of page) | notes |
|---|---|---|---|
| `full` | 0 | 1.00 × 1.00 | full bleed |
| `single` | 0 | 0.85 × 0.76 | 7.5% padding, caption band below |
| `duo` | 0, 1 | 0.85 × 0.40 | stacked, 2.1:1 letterbox |
| `duo-side` *(new)* | 0, 1 | 0.40 × 0.85 | side by side, for portraits |
| `collage` | 0 / 1 / 2 | 0.56×0.56 / 0.38×0.38 / 0.48×0.34 | from `builder.css:295–297` |

Multiply by the book's physical page size to get inches. `BookSize` already
exists in the settings model but nothing consumes it, and all the layout CSS
assumes a square page (`--pw` for both dimensions). Introducing a `--page-ar`
variable now is cheap; discovering the assumption later, when a landscape book
is a paid SKU, is not.

### Migration

`STORAGE_KEY` is `tk_builder_v1` (`state.ts`). Bump to `tk_builder_v2` and
migrate inside `loadState()`: map each `photoIds[i]` to `{ photoId, fx: 0.5,
fy: 0.5, zoom: 1, turn: 0 }`. Existing drafts keep working and render
identically, because the defaults *are* today's behaviour.

Server-side, `pagePhotos` already has `x/y/width/height/rotation` columns —
but those mean free-canvas positioning, which is a different concept, and
reusing them will cause confusion later. Add `fx`, `fy`, `zoom`, `turn`
columns when builder pages are finally persisted (they aren't today; the
builder is localStorage-only past `POST /api/projects`).

---

## 3. Reframe — the interaction

Onceupon opens a full-screen modal with aspect presets and a rotation dial.
That is a context switch: you lose sight of the spread you are composing, and
the aspect buttons are meaningless in a book where the frame is decided by the
layout. **Do it inline instead.** This is both simpler and better, and it is
the one place I'd deliberately diverge from the reference rather than copy it.

Today a hover on any slot puts a full-cover "Swap photo" button over the tile
(`bb-slot-hit`, `builder.css:354`). Replace that single target with:

*Click a slot* → it selects (the existing 2.5px cobalt ring) and a small pill
toolbar fades in at the bottom of the tile with three icon buttons: **Reframe**
(`Move`), **Swap** (`Repeat`, the existing behaviour), **Turn** (`RotateCw`,
90° per click). Three targets, no labels, no menu.

*Reframe active* → the cursor becomes `grab`, dragging anywhere on the photo
moves `fx/fy`, the scroll wheel and pinch adjust `zoom`, and a thin zoom
slider appears in the side panel where the layout controls already live. The
rest of the spread stays visible the whole time, so the user is judging the
composition in context rather than in a black modal. Double-click resets to
`fx: 0.5, fy: 0.5, zoom: 1`.

*Guard rails, visible only when they matter.* Under the zoom slider, a single
line: "Prints sharp" (≥ 300 DPI), "Good for print" (150–300), or, when the
photo can't fill the frame at 150 DPI even at zoom 1, an amber "This photo is
small for a page this size — try it in a smaller frame" with a one-tap
shortcut to a layout that fits. Never a modal, never blocking.

*Discovery.* Users will not find reframe unless something points at it. When a
placement discards more than ~40% of the source photo — computable the moment
`w/h` are known, no AI required — draw a small dot in the slot corner. It is
the app saying "I had to guess here." Clicking the dot opens reframe directly.
That single affordance does more for perceived quality than a face detector
would, at a fraction of the cost.

Mobile: tap selects, drag pans, pinch zooms, and the toolbar pill sits above
the thumb. No hover dependency anywhere.

---

## 4. Layout picker

Keep the picker where it is — the side panel section that currently renders
`LAYOUTS` as text buttons in a `bb-seg`. Change three things.

**Make it visual.** Replace the text with a two-column grid of ~44px wireframe
thumbnails: grey rounded rectangles on the theme's page colour, in the actual
slot geometry. Nobody reads "Framed"; everybody recognises the shape. Group
them under quiet count headers (1 photo / 2 photos / 3 photos) so changing the
number of photos on a page is a deliberate act rather than a side effect.

**Add the missing variants.** The set is currently four. Go to seven, no more:
`full`, `single`, `duo` (stacked), **`duo-side`** (new, ~6 lines of CSS —
`flex-direction: row` on the page and the slot fractions above), `collage`,
**`trio-strip`** (new, three equal slots in a row — the natural home for three
portraits), and `title`. That covers every orientation combination up to three
photos without a template gallery.

**Add Mirror.** One icon button beside the picker that flips the slot order and
horizontal positions within the page. Onceupon has this and it is genuinely
useful across a gutter — you mirror the right page so the two pages breathe
outward instead of both crowding the spine. It is a `slots.reverse()` plus a
CSS class, and because placements are aspect-independent, nothing needs
re-cropping.

Layout change must never blank a slot. `changeLayout()` already fills from
unused photos first, then reuses (`CustomizeScreen.tsx`); keep that exactly,
but carry the `Placement` across rather than just the id, so a reframe the
user made survives switching from `duo` to `duo-side`.

---

## 5. Background colour

Today the page background is `theme.page`, one of four hardcoded hexes
(`data.ts:39`), applied inline in `PageFace` and `CoverFace`.

Add `pageBg?: string` to `BuilderState` for a whole-book override and `bg?:
string` to `BookPage` for a per-spread one. In the panel's existing "Whole
book — theme" section, add a single row beneath the four theme cards: eight
curated swatches drawn from the brand palette (warm neutrals, two deep tones,
two soft tints) plus one "custom" chip that opens a native `<input
type="color">`. One row, no picker panel, no gradients.

**The colour must not be free.** If a user picks a dark background, the ink
colour, caption scrim and empty-state fill all have to follow or their
captions vanish. Derive them rather than storing them:

```ts
/** WCAG relative luminance → pick ink, scrim and soft fill from one hex. */
export function deriveTheme(base: BookTheme, bg: string): BookTheme {
  const L = relativeLuminance(bg);            // 0–1
  const dark = L < 0.42;
  return {
    ...base,
    page: bg,
    ink: dark ? "#FFFFFF" : "#3C3C3B",
    soft: mix(bg, dark ? "#FFFFFF" : "#000000", 0.06),
    scrim: dark ? "rgba(0,0,0,0.62)" : withAlpha(bg, 0.88),
    stripeA: mix(bg, dark ? "#FFFFFF" : "#000000", 0.04),
    stripeB: mix(bg, dark ? "#FFFFFF" : "#000000", 0.09),
  };
}
```

Then `themeById(state.themeId)` becomes `deriveTheme(themeById(state.themeId),
page.bg ?? state.pageBg ?? theme.page)` at the two call sites that build the
`base` style object. Contrast is guaranteed, the four presets keep working
unchanged, and a user cannot produce an unreadable page.

Default the control to whole-book. Per-spread override belongs in the page
section of the panel, not next to the swatches — the friction is deliberate,
because a book with eleven background colours is not a book anyone wants.

---

## 6. Smarter auto-arrange, and honest captions

Four changes, in value order. The first is the one that matters.

**Orientation-aware layout choice.** `generatePages` currently takes
`pattern[step % pattern.length]` regardless of what the photos look like. Once
`BuilderPhoto` carries `w/h`, replace that with a one-line scoring step: for
the next run of photos, consider the layouts the density pattern allows at
this step, and pick the one minimising `Σ |ln(slotAR) − ln(photoAR)|` across
its slots. Log-space so a 2× mismatch costs the same whichever way it points.
This is maybe fifteen lines, needs no model, and removes most bad crops before
the user ever sees them — two portraits go to `duo-side`, two landscapes to
`duo`, a wide panorama to `full`. It is also the reason `duo-side` and
`trio-strip` (§4) have to exist first.

**Hero selection for full-bleed pages.** The `full` layout is the one that
punishes a low-resolution photo hardest. Prefer, for those slots, the photos
with the most pixels and an aspect ratio nearest the page's. Pure arithmetic
on `w/h`, no scoring model.

**Stop committing captions that aren't true.** Change `generatePages` to leave
`caption: ""` and have the caption input show the occasion label as
*placeholder* text instead. The user gets the same prompt and the same charm,
but the book doesn't print "the first look" under a photo of a chair. When the
Haiku vision captioner lands (roadmap Phase 4) it fills the real value and
this change is what makes room for it.

**EXIF chronology.** Ordering pages by capture time rather than file-picker
order is the single biggest perceived-intelligence win, and the roadmap
already scopes it. It needs EXIF parsing in the upload pipeline — `sharp` is
already a dependency and `server/jobs.ts:86` already calls `.metadata()`, so
the date is one field away. Sequence it after the three above; it changes
ordering, not layout, so it composes cleanly.

---

## 7. Occasion templates (wedding / baby / umrah)

Not in scope to build now, but the shape decided today determines whether
adding "umrah" later is a data entry or a refactor. `Occasion` (`data.ts`)
already carries `photoLabels`, `suggestedTitle` and `subtitle`. Extend it with
`themeId`, `coverStyle`, `densityBias` and a weighted `layoutPool`, and a new
occasion becomes exactly one object with zero component changes.

Two things specific to an Umrah book are worth knowing before you design it,
because both are cheap now and expensive later. Arabic and Urdu captions need
a font fallback — Clash Display has no Arabic glyphs, so a Naskh face must be
in the stack or captions render as boxes. And Arabic/Urdu books bind on the
right and turn the other way, which means `Book3D`'s `pos` invariant and the
left/right page assignment in `toSpreads()` would need mirroring behind a
per-book `direction: "ltr" | "rtl"` flag. Neither needs building today; both
need a note in the type.

---

## 8. What to deliberately not build

Being explicit about this is half the point of the spec, because each of these
is a plausible-sounding feature that would make the editor worse.

A **free rotation dial** (onceupon has one) forces the app to auto-zoom to
cover the corners, which silently eats resolution and fights the DPI cap.
Quarter turns handle every real case — a sideways phone photo. **Arbitrary
crop rectangles** break on every layout change, as covered in §2.
**Free-form drag and resize of photos on the page** is what `create.tsx`
already does; it turns a photobook into a weaker version of Canva, guarantees
ugly spreads, and is the surface to retire rather than invest in — the fact
that it works is not an argument for keeping it. **Filters, stickers and per-word text
styling** are v3 in `PRODUCT_SPEC.md` and should stay there. **Z-index and
multiple text boxes** belong to a canvas product, not this one.

The governing rule, which is already the roadmap's: autopilot produces
something good with zero decisions, and every control added must earn its
place by fixing something the autopilot cannot know — which face matters, what
colour the room was, which photo is the hero. Reframe, layout, colour and
caption all pass that test. Nothing above does.

---

## 9. Sequencing

**A — print integrity (do first, nothing else matters without it).** Raise
`uploads.ts` compression to ~4096px / 8 MB and only compress files above that;
capture natural `w/h` client-side at upload into `BuilderPhoto`; add the
`Placement` type with the v1→v2 localStorage migration; render `fx/fy/zoom` in
`Ph`; add `effectiveDpi`/`maxZoom` and the preflight badge on the thumbnail
rail and in the order summary.

**B — reframe.** The slot toolbar, inline drag-to-pan, capped zoom slider, the
40%-discarded nudge dot, quarter-turn button.

**C — layouts.** `duo-side` and `trio-strip`, wireframe thumbnail picker,
mirror, placement-preserving `changeLayout`.

**D — colour.** Swatch row, custom picker, `deriveTheme` contrast derivation,
per-spread override.

**E — intelligence.** Orientation-aware layout scoring, hero selection,
caption honesty fix, then EXIF chronology.

Throughout: delete `/create` and `/wizard-classic`. A and B are the two that
change what the user receives in the post; C and D are what make them feel it
is theirs.

---

## 10. Phase A — as built

Phase A is complete and on disk. It changes no visible UI except one amber dot
and one line in the order summary; everything else it does is underneath, so
that Phase B has something correct to build the reframe gesture on top of.

**The resolution bug is fixed.** `client/src/lib/uploads.ts` compressed every
photo to 2400px *before* upload, so the server never saw the original. A 3:2
phone photo printed full-bleed on an 8×8 page at **225 DPI**, with only 1.5× of
zoom headroom before it fell under the 150 DPI floor — the reframe UI would
have had almost nowhere to go. The ceiling is now 4096px / 8 MB, and the same
photo prints at **378 DPI** with 2.52× of headroom. Two related changes matter
as much: uploads are now *measured first and compressed only if oversized*, so
a photo that was already print-safe is uploaded byte-for-byte untouched instead
of being needlessly re-encoded; and `readImageSize()` decodes with EXIF applied,
so a portrait phone photo is recorded as portrait rather than landscape.

**Photos carry their pixel size.** `BuilderPhoto` gained optional `w`/`h`,
captured at upload on both the server path and the offline data-URL fallback.
Optional because HEIC cannot be decoded outside Safari — absent means *unknown*,
never zero, and every consumer degrades rather than assuming the worst.

**`BookPage.photoIds: string[]` became `slots: Placement[]`.** A `Placement` is
`{ photoId, fx, fy, zoom, turn }` — a normalised focal point, not a crop
rectangle. That distinction is the whole reason the model works: a crop rect is
expressed in the aspect ratio of the frame it was cut for, so changing layout,
mirroring a spread, or reflowing the book silently invalidates it; a focal point
is aspect-independent and survives all three. `changeLayout()` now preserves the
placements of surviving slots, and `swapPhoto()` moves framing *with the photo*
rather than leaving it with the slot, because a crop the user tuned for a face
should follow that face.

**Reframing renders in exactly one place.** `Ph` in `book.tsx` maps `fx`/`fy` to
`object-position` and `zoom` to `scale()` about that same origin. Per the CSS
spec, percentage `object-position` aligns the image's (fx,fy) point with the
box's (fx,fy) point, which guarantees coverage for any fx,fy in [0,1]; scaling
about the same origin preserves that for any zoom ≥ 1. Verified across 1440
combinations of photo aspect, slot aspect, focal point and zoom: the slot is
always fully covered and the aspect ratio is never altered. There is no
`width`/`height` override and no non-uniform scale in the path — **stretching is
not guarded against at runtime, it is unexpressible**. Because it lives in `Ph`,
every surface (3-D book, customize spread, mini book, cover, upload grid)
reframes identically and for free.

**Zoom cannot reach blur.** `print.ts` derives `maxZoom = min(Pw/W, Ph/H) /
DPI_MIN`, clamped to [1, 4]. Solving the DPI equation for zoom means the slider
simply *stops* where quality stops: the user never sees the number 150, never
learns what DPI means, and cannot ship a soft page. Verified that no
photo/slot/zoom combination lands below the floor. Slot geometry is transcribed
from `builder.css` with the derivation in comments so the two cannot drift.

**Old drafts survive.** `tk_builder_v1` → `tk_builder_v2` migrates in place on
read, then retires the old key. Every v1 photo was implicitly centred and
unzoomed, which is exactly `DEFAULT_FRAMING`, so v1 drafts upgrade losslessly.
The parser is defensive against hand-edited or truncated storage — a bad page
degrades to blank rather than throwing, because a blank page is recoverable and
a builder that crashes on boot is not. Verified: real v1 drafts, idempotency,
preservation of user framing across reloads, and hostile input.

**Preflight is quiet.** An amber dot on affected rail thumbnails and one line in
the order summary, both shown *only* when a page would print under 150 DPI. No
green ticks, no DPI numbers, no blocking — the order still goes through.

### Convergence with the Phase 2A server work

`shared/document.ts` (written by the concurrent auth/persistence work) landed on
a `placementSchema` that is field-for-field identical to the client `Placement`:
`photoId`, `fx`, `fy`, `zoom`, `turn ∈ {0,90,180,270}`, plus `w`/`h` on the photo
schema. No reconciliation was needed. One deliberate asymmetry to keep: the
server accepts `zoom` in [0.1, 10] while the client constrains it to
[1, maxZoom ≤ 4]. Server-permissive / client-constrained is the right direction
— nothing the client produces can be rejected — but the server should not be
*relied* on to enforce print quality.

Phase A touched only `client/src/features/builder/**` and `client/src/lib/uploads.ts`.
No file under `server/` or `shared/` was modified.

### Verification

`tsc --noEmit` exits 0 across the whole tree; `vite build` succeeds. The DPI
math, the cover/aspect invariant, and the draft migration were each checked
numerically rather than by inspection.

### Carried into Phase B

- Persist `w`/`h` server-side on `/api/uploads/complete`. The route currently
  discards them and the async sharp pass is the only writer, so dimensions are
  unknown until that job lands. Client-side backfill covers the builder today,
  but the print pipeline should not depend on it.
- `PAGE_INCHES` is a single 8×8 constant matching the hardcoded "8×8 in" in the
  order summary. Every `print.ts` function already takes page size as an
  argument, so per-product sizing is a call-site edit, not a refactor.
- `/create` and `/wizard-classic` still run a second, incompatible editor on
  `pagePhotos` (x/y/width/height/rotation). Retiring them stays on the list.

---

## 11. Phase B — as built

Phase A made the framing model exist. Phase B makes it something the user can
touch. Files: `client/src/features/builder/reframe.tsx` (new), plus edits to
`print.ts`, `book.tsx`, `builder.css`, and `screens/CustomizeScreen.tsx`.

### The interaction

One gesture and one bar.

Dragging a photo in the customize spread moves it inside its slot. There is no
mode to enter and no handle to find — the photo is the control. The layer that
used to be the "Swap photo" hover button is now the drag surface, so the page
markup gained nothing; swap moved into the bar with the rest of the controls.

Tapping a photo opens the reframe bar under the spread: the photo's name, a
zoom slider, Turn, Swap, Reset. Under the spread rather than in the side panel,
because reframing is done by eye and the eye is on the page. Tapping the same
photo again, clicking empty page, or moving to another page puts it away.

Keyboard: the slot is a real button, so Tab reaches it, Enter opens the bar, and
the arrow keys nudge the photo by the same 8px a drag would. Without this the
feature would have been pointer-only, which for a crop tool is a real exclusion
rather than a checkbox.

The 3-D preview and the reveal cards stay read-only. Reframing belongs in the
one screen that is explicitly about editing.

### Why the zoom slider needs no validation

`slotMaxZoom(photo, layout, slotIndex, turn)` returns the largest zoom that
still clears 150 DPI for that photo in that slot at that turn, clamped to
[1, 4]. It is the slider's `max`. The track therefore *ends* where quality
ends: there is no error state, no warning to dismiss, and no way to drag past
the floor. Verified numerically — at the end of the track every case lands
exactly on 150 DPI, or on the 4× cap, or is pinned at 1×.

Turning re-derives that limit and re-clamps the current zoom, which is what
stops a rotate from quietly carrying an old zoom over the floor.

### Quarter turns, and a bug that was already there

`Ph` applied `rotate(turn) scale(zoom)` with `transform-origin` at the focal
point. Nothing set a non-zero turn yet, so it was dormant, but it was wrong two
ways: rotating about a point other than the centre translates the photo off its
own slot, and a 90° turn of a box fitted to a w×h slot occupies h×w, which does
not cover that slot unless it is square.

The fix is a wrapper element, rendered only when `turn !== 0`. It is pre-sized
to the *transposed* slot — `100/a`% wide by `100·a`% tall, centred — and
rotated about its centre, so it maps exactly back onto the slot. The photo
inside is cover-fitted to the box it actually fills, so the turn costs nothing.

The alternative was to keep one transform and scale up by `k = max(a, 1/a)`
until the rotated box covered. That works, but it throws away resolution: on the
`duo` slot (aspect 2.125) a 4032×3024 photo prints at 445 DPI turned under the
transposed approach and 279 DPI under the boost. The transpose is also the
honest one — `placedInches()` swaps the slot for a quarter turn, so every DPI
question is asked of the box the photo really meets.

`slotAspect` is passed down from `PageFace` rather than measured, because `Ph`
returns early on a missing photo and so cannot hold hooks. It comes from
`print.ts`, which transcribes `builder.css`, so the 72px rail thumbnail and the
press agree.

### The pan arithmetic

Kept as pure functions in `reframe.tsx` rather than inside the pointer handler,
because it is the part that can be wrong in a way you only notice in print.

- `localDelta(dx, dy, turn)` — a screen drag in the photo's own axes; the four
  inverses of the CSS rotation.
- `panOverflow(rect, photo, turn, zoom)` — how much photo hangs outside the
  slot per axis, from the cover scale. At zoom 1 exactly one axis has slack,
  which is why a fresh photo pans in one direction only, and why zoom sits next
  to the drag.
- `panFrame(start, dx, dy, turn, overflow)` — the new focal point. The sign is
  inverted because `fx` is a viewport position, not an image position: `fx = 1`
  shows the right edge, so dragging the photo right decreases it. Dividing by
  the overflow makes the photo track the pointer exactly, and an axis with no
  slack does not move rather than snapping to a clamp.

Overflow is measured once at grab time; re-measuring per move would fight the
transform being set.

### Performance

A drag commits new framing on every pointer move, and the customize screen
re-renders the whole thumbnail rail. `PageFace` is now `memo`-wrapped and
`setFrame` copies only the page and slot list it touches, so every other page
keeps its object identity and the rail re-renders exactly the thumb that moved.

### Verification

`tsc --noEmit` exits 0 across the tree; `vite build` succeeds. Beyond that, four
sweeps against the real source:

1. The turn wrapper lands on its slot exactly and centred, for every slot of
   every layout at three render scales.
2. `localDelta` composed with the CSS rotation reproduces the original drag, at
   all four turns.
3. Across every layout × slot × 5 photo shapes × 4 turns × 3 zooms × 3 start
   points × 5 drags: `fx`/`fy` never leave [0,1]; 1:1 pointer tracking confirmed
   1708 times; 1050 no-slack axes correctly refused to move.
4. Every reachable slider end sits exactly on the 150 DPI floor or the 4× cap,
   and one nudge past it is always below the floor.

Not verified here: the visual result in a browser. Browser automation was
unavailable this session, so the render is reasoned from the CSS rather than
seen. Worth a human look at a turned photo in a `duo` slot specifically.

### Carried into Phase C

Everything still open from Phase A, plus:

- Collage tiles carry a small CSS tilt (−2.5°, 2°, 1.2°), so the drag surface's
  bounding rect is ~4% larger than the true tile and panning tracks that much
  slow there. Imperceptible, deliberately not corrected.
- Pinch-to-zoom on touch is not wired; the slider is the only zoom.

---

## 12. Phase C — as built

### What shipped

Seven page shapes instead of four, chosen from a grid of pictures
instead of a row of words, plus a flip for the one layout that leans.

`duo-side` (two portraits side by side) and `trio-strip` (three in a
row) fill the two obvious holes in the old set: there was no way to put
two upright photos next to each other, and no calm way to show three —
`collage` was the only three-photo option and it is deliberately
informal, which is wrong for a page of portraits.

Seven is the ceiling on purpose. The pairing is what makes the grid
readable at a glance: each photo count offers one quiet arrangement and
one livelier one.

| photos | quiet | livelier |
|---|---|---|
| 1 | Full page (bleed) | Framed (inset, captionable) |
| 2 | Stacked | Side by side |
| 3 | Row of three | Collage |

The names dropped their counts — "Two photos" became "Stacked" —
because the count is now the group header above the pair, so spending
the label on it was waste.

### The picker is made of real pages

`LayoutWire` renders the actual `.bb-page` / `.bb-page-duo` / `c0 c1 c2`
classes with `--pw` turned down to 52px and the tiles flattened to grey.
It is not an icon set. A hand-drawn SVG would have been slightly less
markup and would have started lying the first time anybody nudged a
collage tile by a percent. This cannot drift, because it *is* the
layout — including the page colour, which comes from the current theme,
so the wireframes look like the book being made rather than like a
generic diagram.

### Mirror is scoped to collage, and is not a scaleX

Only `collage` is asymmetric, so `isMirrorable()` returns true for it
and nothing else, and the "Flip this layout" button only appears when
it applies. Mirroring the symmetric layouts would reverse slot indices
for no visible change — and the user can already reorder those by
swapping photos.

The flip is implemented as three CSS rules that move each tile to the
other side and negate its tilt. It is emphatically **not**
`transform: scaleX(-1)` on the page, which would have been one line and
would have printed every face, every sign and every date backwards.

Why it exists at all: two collage pages facing each other across the
gutter lean the same way twice, which reads as a mistake rather than as
a style. Flipping one makes the spread sit level.

### Where the constraint work went

`SLOT_FRACTIONS` gained the two new layouts, and — the actual bug found
while doing it — `single` was corrected from `h: 0.76` to `h: 0.85`.
The old comment claimed the with-caption height was the conservative
choice. It is exactly backwards: `effectiveDpi` divides pixels by
inches, so quoting a *smaller* slot reports a *higher* DPI, and we were
therefore under-warning by 1.12× on every framed page since Phase A.
The conservative bound is the largest size the slot can reach, which is
the caption-absent height (the caption element is not rendered at all
when empty, so 0.85 is genuinely reachable). `duo` was already correct.
`duo-side` takes the same treatment; `trio-strip` carries a fixed 3:4
aspect ratio in CSS, so its slot is caption-independent and can be
quoted exactly.

`changeLayout()` needed one addition: it now clears the reframe focus.
Slot 1 of a collage and slot 1 of a stacked pair are different places
on the page, so a bar left pointing at "slot 1" would have been aimed
somewhere the user never chose.

### Three places a new layout id has to land

This is the part that silently breaks. Adding `duo-side` to
`PageLayoutId` alone would have produced a book that renders correctly,
looks correct, and never saves again:

1. `shared/document.ts` — the zod enum is live in the save path as of
   the accounts commit. An id the client can emit but the enum omits
   makes the *whole document* fail validation, so one collage page kills
   every autosave for that draft. The enum now carries a comment saying
   so, and the verification script diffs it against `PageLayoutId`.
2. `sync.ts`, **both directions** — the document schema is non-strict,
   so any field not explicitly named in `toDocument` is stripped without
   error. `mirror` is now listed in both maps.
3. `state.ts` — `migratePages` used to trust `page.layout` verbatim, so
   an id from a *future* build (two tabs on two versions, or a rollback)
   fell through every branch in `PageFace` to the `single` renderer
   while `slotAspect` looked up an undefined slot. `safeLayout()` now
   rewrites an unknown id to a real layout with the same slot count, so
   the photos and their framing survive and only the arrangement is
   approximated.

### Verification

`tsc --noEmit` clean, `vite build` clean, and a six-part sweep against
the real source (`/tmp/tkverify/phaseC.ts`):

- **Declaration completeness** — every `PageLayoutId` has a
  `SLOT_FRACTIONS` entry of exactly `LAYOUT_SLOTS[id]` slots, every
  renderable layout appears in the picker, and the picker's slot counts
  match.
- **Measured CSS geometry** — 84 real page renders in headless Chrome
  (6 layouts × 3 scales × plain/interactive × with/without caption ×
  mirrored), measured with `offset*` rather than bounding rects so the
  collage tilt doesn't inflate the numbers. Every quoted fraction is
  confirmed to be an upper bound on what the slot actually reaches
  (never under-quoted, so never warns late) and within 6% of it (so
  never nags early). Nothing overflows the page; nothing collapses.
- **Mirror is a reflection** — each tile satisfies `x' = 1 − x − w`
  with unchanged size and unchanged `y`, at 3 scales × 2 render modes.
- **Print quality** — 192 reachable slider ends across every layout,
  slot, turn and four photo shapes: each lands exactly on 150 DPI or on
  the 4× cap, and one step past the end is always below the floor.
- **Server round-trip** — a book containing every layout, with `mirror`
  set and non-default framing, survives state → `toDocument` → JSON →
  zod → `fromDocument` with layout, mirror and all four framing values
  intact. Plus a textual diff of the zod enum against `PageLayoutId`.
- **Draft migration** — ten odd drafts (future layout ids at each slot
  count, missing layout, non-string layout, non-boolean mirror) are
  repaired without losing a photo, and ten junk inputs don't throw.

Also looked at, this time: the customize screen was driven in headless
Chrome via CDP with a seeded draft, and the picker, both new layouts,
and the mirrored collage were screenshotted and inspected. The test
photos carry circles that become ellipses under any stretch; they are
still circles in every new slot.

### Deliberately not done

- **Auto-selecting the new layouts.** `DENSITY_PATTERNS` is untouched,
  so generated books still use the original four. Choosing `duo-side`
  for two portraits is an orientation decision and belongs to Phase E's
  layout scoring, not here. Phase C is only "the user can choose".
- **Mirroring the symmetric layouts.** No visible change, confusing
  slot indices, and swap already covers the intent.
- **More than seven.** Anything more expressive belongs in the
  per-occasion templates (§7), where it comes with a reason.

### Carried forward

- `PAGE_INCHES` is still one 8×8 constant.
- `/create` and `/wizard-classic` still run the second, incompatible
  editor and know nothing about any of this.
- Collage panning still tracks ~4% slow because the tilt inflates the
  drag surface's bounding rect (Phase B, accepted).

## 13. Phase C.5 — as built

### What shipped

Four things, all answering the same complaint: a photo on a page was
something you could only nudge, never manage.

1. **Remove**, with the page re-shaping itself around what is left.
2. **Straighten** — a ±10° dial for a crooked horizon.
3. **A photo tray** below the spread showing every photo in the book and
   which ones are not on a page yet.
4. **Drag and drop** — tray onto a photo to replace it, tray onto a
   page's margin to add it, photo onto photo to swap the two.

Plus one repair that was not asked for and should have been there all
along: a tile whose image is missing now says so.

### Straightening, and why it costs zoom

`turn` (quarter turns) is free — a turned photo is cover-fitted to the
transposed slot, so it loses no resolution. An arbitrary angle is not
free, and `data.ts` had said so from the start: rotating a photo inside
its slot exposes the corners, and covering them again takes extra
magnification.

Phase C.5 does not argue with that. It prices it exactly.

Rotate a W×H rectangle by θ inside a W×H hole; the smallest scale that
re-covers the hole is

```
s = cos θ + sin θ · max(a, 1/a)      where a = W/H
```

(Derivation: rotate the *hole* by −θ instead, and require the
axis-aligned `s·W × s·H` photo to contain the hole's bounding box,
`(W·cos θ + H·sin θ) × (W·sin θ + H·cos θ)`.)

That `s` is `tiltCover()`. The important observation is what kind of
number it is: **a pure multiplier on magnification, indistinguishable
from zoom** as far as pixels-per-inch is concerned. So it needed no new
place in the print model. It multiplies zoom, and every guarantee the
DPI cap already made carries over unchanged:

- `framedZoom()` = `zoom × tiltCover(...)`, and `pageQuality` uses it,
  so a straightened page reports the DPI it will actually print at.
- `slotMaxZoom()` divides its ceiling by the same factor, so **the zoom
  track physically shortens as the dial moves**. The two controls
  cannot be combined into a state neither would have allowed alone.

The cost is real and the UI says so. A square slot at 10° needs 1.16×;
the 2.1:1 stacked slot needs 1.35×, and the bar reads *"Straightening
crops about 26% off the edges."* once it passes 10%.

±10 is the limit because straightening is a *correction*. Past ten
degrees you are composing, not fixing, and the crop stops being worth
it.

### Where tilt lives in the DOM

Its own wrapper, **outside** the turn wrapper, for the same reason the
turn has one: only a rotation about the centre maps a box back onto
itself, and `scale(zoom)` is anchored to the focal point, so the two
cannot share a transform.

Because that wrapper is `inset: 0` on the slot, its aspect *is* the
slot's aspect — which is the number `tiltCover` was given. So nothing
inside it changes: `turnBox` transposes against the same value it
always did, and the photo still meets its box with plain
`object-fit: cover`. Aspect ratio is preserved by construction, at
every angle.

Tilt is then priced in exactly two places, once each:

- **Panning** — `localDelta()` divides the drag by `cover`, because the
  photo under the cursor is magnified. Applying it twice would halve
  drag speed; `panOverflow` deliberately does not know about tilt.
- **Resolution** — `framedZoom()` multiplies. Nowhere else.

### Remove is a move, not a delete

The photo stays in `state.photos` and reappears in the tray marked "not
used yet". Nothing is destroyed, so there is no confirm dialog — that is
the whole reason it can be a single click.

The page then re-shapes, because a layout is a promise about how many
photos are on the page and leaving a collage holding two would leave a
visible hole. `LAYOUT_LADDER` maps *character*, not index: a page that
was airy stays airy, a page that was busy stays busy. So `duo` → one
photo becomes `single`, not `full`; `trio-strip` → two becomes
`duo-side`, keeping the portraits side by side.

A page down to zero photos is deleted, and the selection clamps rather
than resetting — landing back on the cover after deleting page 9 of 12
loses the user their place.

### Drag and drop, and why it is the native API

The slot's pointer events are already owned by panning. Rather than
build a mode switch, moves use the native HTML5 drag API, which is a
separate event stream entirely: a pan cannot start a drag and a drag
cannot start a pan.

Two gestures, two targets:

- **A tray photo onto a slot** replaces that photo. Onto the page's
  *margin* — the part of the face that is not a slot — appends it, and
  the page grows a slot. "Replace this photo" and "add to this page"
  are different intentions and get different targets.
- **A slot onto another slot** swaps the two, framing included, because
  a crop tuned around a face should follow that face. Zoom is
  re-clamped on arrival in case the destination slot is smaller.

Slot-to-slot starts from a small corner grab handle, visible on hover,
so it cannot be confused with a pan. `preventDefault()` on `dragover`
is what makes an element a drop target at all.

The drop rings are drawn on `.bb-slot-hit`, not on the wrapper. An
outline on the wrapper is painted *under* the photo, because the photo
is a positioned child — the hit layer already sits above the image,
which is why its hover ring works, so the drop states borrow it.

### The missing-photo repair

`Ph()` fell back to the striped placeholder whenever `photo.url` was
falsy, but kept the label and the theme shade — so a lost photo looked
like a deliberate design element. Users reasonably asked why "the
default" kept coming back.

It now reads *"photo-3.jpg — image missing"*, and an `onError` handler
routes a 404 to the same fallback (previously a broken image icon).
This needed `Ph` split in two: it returns early on a missing photo and
so cannot hold hooks, so the loaded path became `LoadedTile`, which
can. A new `src` clears the broken flag, so replacing a lost photo
works.

The tray flags the same photos with an `ImageOff` badge and an amber
border, which is the actionable view: you can see at a glance which
ones need re-uploading.

Also fixed in passing: the layout panel said "Page 0" for the page the
rail labels "p.1".

### Verified

- **Tilt never exposes a corner** — 3,132 checks across every layout ×
  slot × 0.1° step over the full range, comparing `tiltCover` against
  an independent containment test (rotate the slot's four corners into
  the photo's frame). Zero failures, and the scale is *tight*: 0.5%
  smaller would already expose a corner, so it wastes no resolution.
  Worst case is 1.354× on the 2.125:1 stacked slot at 10°.
- **The print budget holds** — at every tilt from 0 to 10°, the zoom
  ceiling lands exactly on 150 DPI and never grows as the dial moves.
- **Persistence** — `tilt: -7.5` survives state → `toDocument` → JSON →
  zod → `fromDocument` with nothing else drifting; a level slot is
  omitted from the wire (a 200-page book would otherwise carry 600
  copies of `"tilt":0`) and reads back as 0; 42° is rejected by the
  schema rather than silently stored.
- **Driven in headless Chrome** — the reframe bar renders
  `photo-1.jpg | 1.0× | 0.0° | Turn | Replace | Remove | Reset`; the
  dial is −10…10 step 0.5; at +10° the rendered transform matrix
  measures 1.3538×, matching the formula, and the tilt wrapper's box
  covers its slot; the crop note appears; the zoom ceiling drops to
  1.159×; Remove takes `duo` to `single` and the tray goes to "1 not
  used yet"; a tray drag lights 2 slots and 2 pages, exactly one hover
  target, drops correctly and clears every class; a grab-handle drag
  swaps two slots. No console errors.
- **The three drop states are visually distinct** — sampled from the
  screenshots rather than eyeballed: the ring band reads (214,123,122)
  idle, (143,103,136) while a drag is in flight, and exactly
  (29,70,160) — `--tk-cobalt` — under the cursor, with the interior
  measurably tinted.

### Deliberately not done

- **Aspect-ratio crop presets** (onceupon offers Portrait / Landscape /
  Square). Onceupon crops free-form, so its crop can disagree with the
  slot. TrueKeeps slots already define their own aspect and cover-fit
  guarantees no stretch; an aspect picker *inside* a fixed slot forces
  either letterboxing or a double crop — which is precisely the
  stretch-and-blur problem this whole spec exists to prevent.
- **Per-photo captions.** A page caption already exists; a second
  caption layer is a text-placement feature, not a photo feature.
- **A full-screen crop editor.** The inline bar does the same work
  without losing sight of the page the photo lives on.

### Carried forward

- Native drag and drop has no touch equivalent. The Replace button's
  tray remains the path on a phone.
- Pinch-to-zoom is still not wired.
- `/api/uploads/complete` still discards `w`/`h`, so the DPI cap falls
  back to permissive when a draft is resumed from the server.
- Everything carried forward from Phase C still is.

---

## 14. Phase D — as built (page colour)

Closes the original ask: *"we can maybe add option for solid color and
have user change it like currently we have fixed colors."*

### What shipped

A **Whole book — page colour** section in the customize panel, directly
under the theme cards: eleven chips in two wrapping rows. The first is a
"back to the theme's own paper" chip; the other ten are curated page
colours, ordered light → dark so the row reads as one gradient. Picking
one repaints every page, both spreads, the rail thumbnails, the cover
mini and the layout wireframes, and the text on those pages flips
between near-black and white by itself.

### What changed from the §5 plan, and why

Four deliberate departures.

**No custom colour chip.** §5 proposed eight swatches plus an
`<input type="color">`. That chip is one drag away from `#00FF00` — a
colour no four-colour press can hit, so the printed book would not
match the screen — and one drag away from a mid-grey that leaves either
choice of ink marginal. The user would be authoring a defect and only
discovering it on paper. Ten curated colours plus the theme is a wide
enough range for a photo book; the picker was the part that could only
lose.

**No per-spread override.** §5 wanted `bg?: string` on `BookPage` too.
It costs a schema field, a second control, and a whole class of "why is
page 7 different" support mail, in exchange for a book that, as §5
itself says, "is not a book anyone wants". Whole-book only. The field
can be added later without a migration; removing it later could not.

**Ink is chosen by measurement, not by a threshold.** §5 branched on
`L < 0.42`. `deriveTheme` instead computes the WCAG contrast ratio of
the page against *both* candidate inks and takes the winner. It needs
no magic number, it cannot be wrong at the boundary, and it degrades
sensibly if the palette ever grows a mid-tone. The measured worst case
across all forty-four (theme × colour) pairs is **7.04:1**, at
ivory-on-Slate — above AA (4.5:1) and, as it happens, above AAA (7:1).

**The scrim stays a tint of the page.** §5 wanted `rgba(0,0,0,0.62)` on
dark pages. But the scrim's job is to make a caption legible *over a
photograph*, and a black pill on a dark page is a black pill on a
photo — the same problem, moved. The page colour at 88% works on both
ends because it always contrasts with the photo underneath, which is
the thing it actually sits on.

### The swatches

| id | name | hex | luminance | naive TAC | ink |
|---|---|---|---|---|---|
| `warmwhite` | Warm White | `#FBFAF7` | 0.956 | 4% | dark |
| `ivory` | Ivory | `#F7F1E3` | 0.882 | 14% | dark |
| `oat` | Oat | `#EDE4D5` | 0.783 | 21% | dark |
| `blush` | Blush | `#F2DFE0` | 0.770 | 20% | dark |
| `mist` | Mist | `#DCE4EB` | 0.767 | 17% | dark |
| `sage` | Sage | `#D9E1D3` | 0.733 | 22% | dark |
| `sand` | Sand | `#E3D6C0` | 0.682 | 32% | dark |
| `stone` | Stone | `#C6C3BC` | 0.547 | 29% | dark |
| `slate` | Slate | `#4F5A65` | 0.099 | 93% | light |
| `ink` | Ink | `#2B2F33` | 0.028 | 104% | light |

TAC is total area coverage under a naive RGB→CMYK separation — a sanity
check that no swatch is a 350%-ink monster that would scuff and offset
on a matte stock. The highest is 104%. Chroma tops out at 0.218 on
Slate, so nothing here is near the edge of CMYK gamut either.

### Where it lives

- `palette.ts` (new) — `PAGE_COLOURS`, `THEME_COLOUR`, the colour maths
  (`parseHex`, `relativeLuminance`, `contrastRatio`, `mix`), `deriveTheme`,
  and `bookTheme(themeId, pageColor)`.
- `BookTheme` gains `dark: boolean`. This replaces two literal
  `theme.id === "cobalt"` checks in `book.tsx`. Those were correct while
  four themes were the only page colours in existence; an ivory book on
  the Ink swatch is dark and is not cobalt, so the fact now travels on
  the theme instead of being re-derived from its id.
- `BuilderState.pageColor` (default `"theme"`), `pageColor` in
  `shared/document.ts` and both directions of `sync.ts`. **Optional** in
  the schema, and a plain `z.string()` rather than an enum: every
  document written before this field existed still validates, and a
  server that 400s on a colour id it has not heard of would lock users
  out of saving for the length of a deploy.
- Four screens moved from `themeById(state.themeId)` to
  `bookTheme(state.themeId, state.pageColor)`. The two screens that are
  *choosing* a theme (quiz, reveal) still use `themeById`, because they
  preview the theme, not the book.

### Two things the swatch row must not do

**The theme cards keep showing their own paper.** If they previewed the
override, all four would render identically and the theme picker would
stop working as a picker. The theme owns the typography and the accent;
the colour owns the paper; the two controls show the two different
things.

**The layout wireframes had to be taught the page colour.** They were
`rgba(60,60,59,0.24)` tiles with an `rgba(60,60,59,0.1)` hairline — fine
while every page was near-white, invisible on Ink, which would have
silently blanked the entire layout picker the moment someone chose the
darkest swatch. They are now opaque mixes off the page toward the
theme's ink and accent, set inline by `LayoutWire`. On the default
paper the composite is byte-identical to the old constant, so this
change does nothing at all on light themes and only does work on dark
ones. Measured on Ink: tiles 2.16:1, selected tile 2.82:1.

### Verified

Contrast and print-safety sweep, all 4 themes × all 11 colours (44
pairs):

- worst ink contrast anywhere **7.04:1** (ivory / Slate)
- accent never drops below 1.6:1 against its page; it falls back to a
  72% ink tint when the theme's own accent would disappear (cobalt on
  Ink becomes `#c4c5c6`)
- stripe pair, and stripe-vs-page, always separated
- `dark` always agrees with the ink actually chosen
- theme identity (`id`, `name`) preserved through derivation
- `THEME_COLOUR`, `""`, `null`, `undefined` and an unknown id all return
  the theme object *untouched* (identity-equal, not a copy)
- `parseHex("#nope")` → `null`

Persistence round-trip: `pageColor` survives `toDocument` → JSON →
non-strict zod → `fromDocument`; a pre-Phase-D document still validates
and reads back as `"theme"`; an unknown future id is accepted; a 50-char
id is rejected.

Headless Chrome, on a real inner page (the customize screen boots on the
*cover*, whose background is a full-bleed photograph — measuring paper
there measures a photograph):

- 11 chips, exactly one selected, starting on the theme colour
- all ten swatches: computed page background, page text colour and
  caption colour correct, and a sampled screen pixel matching the hex
- Ink: persisted to localStorage as `"ink"`, rail cover chip and its
  text follow, the four theme cards stay visually distinct
- survives a full reload, and the row remembers the choice
- back to the theme chip restores `#FAF7EE` and stores `"theme"`
- no console errors

`tsc --noEmit` and `vite build` clean.

### Deliberately not done

- **A custom colour picker**, **per-spread colours**, and **gradients or
  patterns** — see above.
- **Cover colour separate from page colour.** The cover is currently a
  full-bleed photo; a separate control for it is a cover feature, and
  belongs with the occasion templates in §7.
- **Per-colour paper stock pricing.** A dark page costs more ink in
  reality. That is an order-screen concern, not an editor one.

### Carried forward

- The preview screen's theme dots still show each theme's own page
  colour while an override is active. Same reasoning as the theme
  cards, but the dots have no label to explain it. If it confuses
  anyone, the fix is a caption on that row, not a behaviour change.
- Everything carried forward from Phase C.5 still is.
