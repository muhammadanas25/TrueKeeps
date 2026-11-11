# ADR 011 — Two-stage photo uploads and private media

**Status:** accepted · 2026-11-06

## Context

Customers upload from phones in Pakistan, where upload speed is often around
5.6 Mbps. The builder uploaded one photo at a time with no visible progress, and
showed none of them until the whole batch had finished. The editor displayed
full-size originals. A failed upload silently fell back to a copy that lived only
in that tab, so a photo could miss the printed book. Photos were served from a
public bucket while the product tells customers they're private.

The owner decided that originals are kept untouched for print, and compressed
copies are used for editing.

## Measurements

Six real camera JPEGs, Chromium with 4x CPU throttling, SSIMULACRA2 on a 1200px
centre crop (2026-11-05). This is desktop emulation, not real phones.

| Encoder, 1600px | Size | Score | Time |
|---|---|---|---|
| Canvas WebP q0.80 (chosen) | 230 KB | 75.5 | 128 ms |
| Canvas JPEG q0.75 (Safari fallback) | 277 KB | 74.8 | 53 ms |
| MozJPEG WASM q0.75 | 233 KB | 73.6 | 766 ms |
| AVIF WASM q60, speed 8 | 176 KB | 73.2 | 2773 ms |

Twenty photos over a throttled 5.6 Mbps link took 138.4s one at a time, and 133.5s
at both 3 and 6 at once. The phone's connection is the limit, so more parallelism
gains nothing. Reordering the work is what helps.

## Decision

**Two stages.** The browser makes a ~1600px display copy and ~400px thumbnail in a
Web Worker, and they go up first, about 240 KB per photo. The book is usable within
seconds. The untouched original follows in a separate lane that only runs while the
fast lanes are empty. Lanes run 2 (prepare), 3 (display) and 2 (original) at a time.
Implementation: `client/src/features/builder/upload/engine.ts`.

**Client-chosen photo ids.** Pages can reference a photo before any network request,
and a retried registration is idempotent. There's no id remapping step to get wrong.

**No waiting screen.** Choosing photos goes straight to ComposeScreen, whose three
questions fill the time. Each changes a real book using the customer's own photo, and
the book gets thicker as photos arrive.

**Order hold.** Payment waits until every printed photo's original has arrived. The
client shows this; `photosWithoutOriginals` on the server enforces it, and
`POST /api/uploads/:id/original/complete` checks the object really exists first.

**Never drop a photo silently.** A network failure retries for as long as the page is
open. A request with no progress for 45s counts as failed, because one hung photo
would otherwise stop the whole queue. A file that can't be read leaves the book and
is named to the customer. The tab-only fallback is gone.

**Closed tabs.** File objects don't survive a reload, so each photo stores a
fingerprint (size plus a hash of its first 64 KB). Re-picking the same photos resumes
them without resending display copies, and duplicates are skipped.

**Private media.** The only stored URL is `/media/<key>`. That route checks ownership
and redirects to a signed link. Signing against the start of the hour keeps a link
byte-identical for that hour, so the browser's cache still hits. Older stored URLs are
rewritten by SQL in migration 0004 (rows) and on read by `normalizeMediaUrl` (book
documents and drafts).

**HEIC.** Printers and our prebuilt sharp can't read it, so it's converted in the
browser to a full-size JPEG at q0.95, which becomes the print original. Native decoding
is tried first; the 3.1 MB WebAssembly decoder (`heic-to`, LGPL-3.0) loads only when
it's needed. Files over 50 MB get the same conversion.

## Consequences

- An HD upload still takes as long as the connection needs: about 22 minutes for 200
  photos at 5.6 Mbps. The customer can do everything except pay during that time. If
  the tab closes, they have to choose those photos again.
- `url` in a book document now points at a display copy. Print must use the
  original. Paid orders get print files cut from the originals with the
  customer's framing (ADR 014), at `GET /api/admin/orders/:id/print-files`.
  **The print pipeline must never read `url` directly.**
- New covers (`classic`, `moment`, `signature`) must be supported by the print PDF
  when it's built. Signature colours are written out in `data.ts` because they print.
- `/create` keeps a simple one-stage upload, with server-made derivatives.

## Rollout

1. Run migrations 0004 and 0005. 0004 backfills existing originals and rewrites stored URLs; 0005 adds `upload_batches` (ADR 014).
2. Deploy. Signed reads work whether or not the bucket is public.
3. Turn off public access on the R2 bucket. Until then, "Your photos stay private" is
   not yet true of the stored files.
4. Remove `S3_PUBLIC_BASE_URL` from the environment.

## Alternatives rejected

- **Compressing the print copy to q0.90:** about 62% less data and about 8 minutes
  instead of 22 for 200 photos, but irreversible. The owner chose untouched originals.
- **MozJPEG or AVIF in the browser:** too slow on a phone for what they save.
- **Multipart or resumable uploads (tus, Uppy):** R2's minimum part size is 5 MiB and
  most photos are smaller. Retrying a whole photo is simple and enough.
- **Storing files in IndexedDB to survive reloads:** 900 MB doesn't reliably fit in a
  phone browser's quota. Re-picking by fingerprint needs no storage.
- **A tutorial video during upload:** spends the customer's mobile data, and a
  question that changes their own book holds attention better.
