# ADR 014 — Print files with the customer's framing, and upload measurements

**Status:** accepted · 2026-11-11

## Context

Since ADR 011 the editor shows a ~1600px display copy, and the untouched HD
original is kept for print. The customer's framing (pan, zoom, quarter turns,
straightening) is saved on the book as numbers, not pixels. Nothing turned those
numbers plus the original into a file a printer can use, so the printer would get
either the small copy or an unframed original.

The owner also wants to compare upload timings across batch sizes, photo sizes
and connections, to know what customers really experience.

## Decision: print files

When an order is paid, `print.render` cuts every placed photo from its HD
original with the customer's framing applied (`server/print/render.ts`).

- **Geometry is a transcription of `Ph` in `client/src/features/builder/book.tsx`:**
  cover-fit at the focal point, zoom about the focal point, quarter turn of the
  slot's transposed box, then straightening by `tiltCover`. It uses the client's
  own `slotInches`, `tiltCover` and `clampTilt` from `print.ts`, so a change to the
  editor's maths reaches print without a second copy.
- **Resolution:** 300 DPI, or the photo's own effective DPI if lower; enlarging
  adds no detail. Each JPEG (q95, 4:4:4) carries its DPI, so its physical size is
  right.
- **Files live in the project:** under `projects/<pid>/print/<orderId>/`, with a
  `manifest.json` written last, so its presence means the job finished.
  `GET /api/admin/orders/:id/print-files` returns signed links to every file, the
  cover original and all originals. `POST …/print-files/render` re-cuts them.
- **Covers carry no framing** (the first photo, centred), so the manifest points
  at the original. Page-level decoration (edges, borders, the collage mirror) is
  the layout's job and is recorded in the manifest rather than baked in.

**Verified 2026-11-11:** 14 cases (7 framings × 2 photos, one with EXIF rotation)
rendered in the editor's real `Ph` component and by the server, compared at
200px. Mean difference was 1.0–4.3 of 255. The same image shifted 3% scores
10.8–28.1, and mirrored scores 37–71.

## Decision: upload measurements

The upload engine tracks each batch of picked photos
(`client/src/features/builder/upload/metrics.ts`). When every photo has settled it
posts one report to `POST /api/uploads/metrics`, which stores it in
`upload_batches` and logs `[uploads] batch`. If the page closes first, an
`unfinished` report goes with `keepalive`. The batch id is reused, so a later
finished report replaces it.

Measured: photo count, rejected and duplicate counts, HEIC count, source,
original and display bytes, time to first photo in the book, time to all in the
book, time to all HD, HD speed in Mbps, retries and stalls. It also records the
connection type, downlink, device memory, CPU cores, phone or computer, and
browser. Each photo gets a row of [KB, megapixels, prepare ms, display ms,
original ms, type].

Nothing identifying is stored: no file names, no photos, nothing typed.

`GET /api/admin/upload-stats?days=30` returns medians grouped by photo count,
average photo size, connection and device. For anything else, query
`upload_batches` directly.

## Consequences

- The print pipeline reads the manifest's files, not the book's `url` field,
  which points at display copies.
- Rendering is CPU and memory work: about 0.4–1.3s and up to ~150 MB per slot for
  large photos. It runs in the in-process queue, two at a time, so a big order
  takes a few minutes in the background after payment.
- Measurements depend on the browser reporting; a tab killed outright (not
  closed) sends nothing.
