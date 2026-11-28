# ADR 027: Undo edits, and the book first on phone steps 5 and 6

- Status: accepted. The owner approved the canvas on 2026-11-28, with
  board A1 as drawn, A2 kept as today's sheet, step 6 included and B5
  dropped.
- Design: claude.ai Design canvas "Truekeeps: Undo edits and step 5 on phones"
  (https://claude.ai/artifact/HqsHgD9sQ7MDrMSpxQZqvj)
- No migration, no API change.

## Context

The owner found two problems on a phone.

1. **Edits could not be undone.** A customer who opened the editor and did
   "something bad" had no way back. Edits save as they happen, and step 5
   only said "you changed some pages by hand".
2. **The sheet shrank the book.** On step 5, the white sheet of choices
   took most of the screen, so the book, which is the product, shrank to a
   band at the top.

The owner added two rules: these options appear only after an edit, never in
the normal flow, and the change must not cause regressions.

## Decision

1. **The original album** (`builder/original.ts`) is the book exactly as it
   was before the editor changed it. The owner tested a first version that
   re-ran the layout engine, and it did not bring back their book, because
   the editor also changes the layout style, the title, the cover and the
   look.
   - The first time the editor opens on a book without hand edits, every
     field the editor can change (`ENTRY_KEYS`) is saved in
     `state.original`.
   - A new copy is taken only when the pages were laid out again since
     (step 5, or new photos). A visit that changed only the title keeps the
     copy from before it.
   - `restoreOriginal()` puts that copy back with `pagesEdited: false`. If a
     photo in it was deleted since, or there is no copy (another device, or
     a book from before this change), it falls back to the engine's layout
     with every photo in.
   - The copy is kept on this device only; it is not part of the saved
     document.
2. **In the editor** (EditorV2):
   - The book as it was when the editor opened is kept (`entry`, the
     fields in `ENTRY_KEYS`).
   - Leaving by Back, Preview or Order after any change asks "Keep the
     changes you made?". The answers are Keep my changes, Undo these
     changes (puts `entry` back) or Keep editing. With no change, nothing
     is asked.
   - After a hand edit to the pages (`pagesEdited`), an "Edited" tag sits by
     "Saved", and the More menu offers "Start again from the original". It
     asks first, records one undo step, and shows a toast with Undo.
3. **On step 6**, only after a hand edit: "You changed some pages yourself"
   with "Back to original". It asks first, and approval must be given again.
   This shows on phone and desktop.
4. **The sheets** (`RevertSheets.tsx`, `revert.css`) are bottom sheets on a
   phone and a centred dialog from 760px up. Escape or a tap on the veil
   takes the safe answer.
5. **Step 5 on a phone, book first.**
   - Picking a layout tucks the sheet into a short bar after 650 ms. The bar
     shows the choice, its price, the finish and Continue.
   - "Change layout" or the handle (`SheetGrip.tsx`) brings back today's
     sheet unchanged.
   - It never tucks while photos would be left out, or while the
     customer's own edited pages are showing. B5 was dropped, so that case
     works as before.
6. **Step 6 on a phone.** The first page turn tucks the sheet. The bar has
   "Details" and, until the box is ticked, "Review and approve", which opens
   the sheet at the tick box.
7. **Only the handle listens to drags** (`touch-action: none`). A swipe that
   scrolls the sheet can never tuck it.

Also fixed: on a 390px phone the editor's top bar ran 4px past the edge.
That was already live and is not part of this change. The title side now
gives way.

## Consequences

- The classic editor (CustomizeScreen) is unchanged. It is the fallback
  behind "Switch to classic editor".
- `entry` is per visit to the editor. "Undo these changes" goes back to the
  start of this visit, not the first one.
- Desktop step 5 and step 6 layouts are unchanged apart from the step 6
  note after an edit.
