# ADR 020: The eight font pairs, on Fontshare's free licence for now

Date: 2026-11-24 · Status: accepted

## Context

The owner chose eight heading + body pairs (Website Assets_v3, "[01]
Guidelines Names and Pairings.png"), all Fontshare fonts by Indian Type
Foundry. ADR 019 left them out: the ITF Free Font License 2.0 does not allow
offering a font as a selectable choice for customers' own content, or
redistributing the files, and this repository is public. On 2026-11-24 the
owner decided to use them on the free licence while the product is a
prototype, and to get ITF's commercial licence before launch.

## Decisions

**One list for preview and print.** `shared/fonts.ts` holds the pairs (family,
Fontshare slug, weight, fallback), the occasion defaults and the ids a saved
book may carry. The client and the print pipeline both read it.

**No font file in the repository.** The browser loads one Fontshare
stylesheet per face, only in the builder (`client/src/features/builder/fonts.ts`;
Fontshare's CSS service answers one family per request). The print pipeline
finds each face's TrueType file through the same stylesheet, downloads it once
and caches it in the temp dir (`server/print/fonts.ts`). If a face can't be
fetched the print job throws and the queue retries: a book is never printed in
a font the customer didn't see.

**Variables, not per-pair font rules.** Each pair class (`.bb-font-warm` and so
on) only sets `--bk-head`, `--bk-head-w`, `--bk-body`, `--bk-body-w`;
builder.css reads them with fallbacks. Nothing competes on specificity or CSS
load order, and pages without a pair look as before.

**The font follows the occasion, not the colour.** wedding → Elegant, baby →
Soft, birthday → Playful (most of these books are children's), travel →
Adventure, anything else → Warm Classic. Picking a different occasion moves the
font only if the customer hadn't chosen one. Choosing a look (page colour) no
longer changes the font.

**Older books keep their typeface.** "classic" (Clash Display), "editorial",
"modern" and "script" stay valid in saved books and orders, show in the
pickers only for a book that uses one, and print in the standard PDF fonts as
before.

## Before launch

- Get ITF's commercial licence covering selectable fonts in the designer,
  self-hosting and embedding in print files (Clash Display included), or
  replace the faces. Then switch the two loaders to licensed files kept out of
  the public repository (private storage, or make the repository private).
