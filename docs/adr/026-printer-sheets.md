# ADR 026: Print JPEGs as sheets for the Noritsu (two pages per print)

- Status: accepted (owner, 2026-11-28)
- Printer: Noritsu QSS-3901G / 3904G (owner's "Printer Details.pdf"): silver-halide
  photo paper, laser exposure at 640 × 640 dpi, roll widths up to 12 in (305 mm),
  advance up to 36 in (914.4 mm)

## Context

The print ZIP (ADR 018 follow-up, eb54d29) held one JPEG per page side,
named as leaves (`sheet-01-front.jpg`, `sheet-01-back.jpg`). The owner: the
printer "directly prints sheet not page separately". A photo-paper album is
made of single-sided prints, each an open spread folded in the middle, so one
print must carry two pages side by side.

The paper limits the size: the widest roll is 12 in, exactly the album's
page height, so the 3 mm cutting margin cannot also fit above and below.

## Decision

- **One JPEG per sheet:** `sheet-NN-pages-AA-BB.jpg`, page AA on the left,
  BB on the right. That is the builder's own pairing (`toSpreads`: pages
  1|2, 3|4, …), so a sheet is exactly what the customer saw open on screen. A
  last sheet with one page keeps the right half in the book's paper colour.
- **Covers on one sheet (owner, 2026-11-28, "to save sheet on print"):**
  by default both covers share one print, `00-covers-back-front.jpg`: the
  back cover on the left and the front on the right, as a cover reads laid
  out flat, the same size as a page sheet (the shop can also cut it in the
  middle). "Separate" in Print settings gives the earlier two pictures,
  `00-cover-front.jpg` and `99-cover-back.jpg`, with bleed on every side.
- **Size (owner's choice):** 12 in tall, the full paper width, edge to edge,
  and 24 in plus the 3 mm margin at each outer end long (24.24 × 12 in).
  The book stays 12 × 12. The binder trims a hair off the top and bottom,
  which only touches full-bleed photos; every other layout keeps a 0.9 in
  margin.
- **Resolution:** 300 dpi by default, switchable to 640 dpi (the printer's
  native) in Admin › Print queue › Print settings (`app_settings.print`,
  audited, next to the Covers switch). A change applies to files built afterwards; versions are
  immutable, so "Rebuild as a new version" remakes an order at the new
  setting. The ZIP records the dpi and sheet count, shown on the order page.
- **Rendering:** sheets are still rendered from interior.pdf with pdf.js, so
  a sheet matches the PDF pixel for pixel. Each page is drawn in 512-row
  strips into one RGB buffer per sheet, reused across sheets, then encoded
  with `optimiseCoding: false`. The optimised Huffman pass held the whole
  image's coefficients (measured 1.4 GB for one 640 dpi sheet); the plain
  pass streams in about 20 MB and changes no pixel.

## Measured (local, 10 photo-heavy pages = 5 sheets + 2 covers)

| | 300 dpi | 640 dpi |
|---|---|---|
| Sheet size | 7270 × 3600 px | 15512 × 7680 px |
| Time | 17 s | 31 s |
| ZIP | 44 MB | 184 MB |
| Peak memory | 700 MB | 1.2 GB |

The previous per-page code peaked at about 1.2 GB on a smaller book at
300 dpi. A real order through the full pipeline (build, store, read-back
SHA-256 check) passed at both resolutions.

## Open with the printer

Confirm with the print shop: that they want 12 in edge to edge with no
margin top and bottom, the trim at the two ends, and which resolution their
EZ Controller workflow prefers. Each is one setting or one constant here.
