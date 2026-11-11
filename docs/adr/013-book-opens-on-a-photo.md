# ADR 013 — The book opens on a photo; the editor starts at the cover

**Status:** accepted · 2026-11-11

## Context

Every generated book started with a words-only title page on the left of the
first spread, and the editor opened on that spread. The owner wanted the left
page to begin with a photo, and found that the front cover, the first thing a
customer sees on the printed book, wasn't visible anywhere in the editor.

## Decision

- **No title page in new books.** `generatePages()` (data.ts) starts with photo
  pages; the title and the line underneath live on the cover. Page numbers
  count from 1.
- **The editor opens on the front cover.** It is the first thumb in the page
  strip; → leaves it, ← from the first spread returns to it. On the cover the
  Text panel edits the title and line (also editable on the cover itself),
  Layout picks the cover style, and picking a photo in Photos makes it the cover
  photo (the cover shows the book's first photo).
- **Text panel by page.** The title fields appear only on the cover (or an
  older book's title page). Other pages show only that page's caption, the
  captions switch, and the font pair. There is no text colour choice: ink
  follows the page colour by contrast (palette.ts `deriveTheme`).
- **Font pair moved from Style to Text**, shown as title face over caption face.
- **"Bordered" edge replaced by "Shadow".** Bordered was a 1% white ring that
  disappeared on light pages. Shadow sets photos on the page like loose prints.
  `border` stays valid (shared/document.ts) and keeps rendering, and appears in
  the picker only for a book that already uses it.
- **Editor canvas is neutral Mist 200**, not Paper, which read as pink behind
  the book.

## Saved books

Saved books never change. A book made before this keeps its title page at
index 0: `hasTitlePage()` / `firstMovablePage()` keep it first, unmovable,
undeletable, unnumbered ("Title") and uncharged, and a re-arrange keeps it.

## Consequences

- The first spread of a new book is two photo pages.
- Choosing a cover photo reorders the photo library; it is not part of the
  editor's undo history.
- The classic editor (CustomizeScreen) is unchanged; it already finds a title
  page by its layout, not its position.
