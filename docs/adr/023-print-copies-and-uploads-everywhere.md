# ADR 023: Smaller print copies, uploads on every page, photos kept on the phone

- Status: accepted (owner decisions 2026-11-28, on the upload round 6 canvas)
- Design: canvas boards A3 (welcome back), A4 (exact re-add list), C2 (back
  from another app), Option 2 (checkout keeps its hold)
- Supersedes, in part: ADR 011's "the HD original is the untouched file"
- No migration. One new read-only endpoint, `GET /api/projects/:id/photo-status`.

## Context

The owner reported on 2026-11-27:

- 80 photos of 5 to 6 MB took 20 to 30 minutes to upload on mobile data,
  with the customer waiting on the checkout page
- going back, signing in or opening another page paused the upload
- after that, finding "the exact remaining images" to add again was very hard

Measured causes:

- the upload was bandwidth-bound, at about 2.3 Mbps in practice; parallel
  uploads were already in place and don't help a full connection
- the engine stopped scheduling uploads whenever the builder wasn't on
  screen
- Google sign-in redirected the whole tab, which loses the picked files

## Decisions

### 1. Print copies at JPEG quality 0.95, but only where that can't cost quality

The owner approved 0.95, with a firm rule: quality comes first, and a photo
that's already compressed (a WhatsApp forward, for example) must never be
compressed again. The rules live in
`client/src/features/builder/upload/print-copy.ts`. The first that applies
wins:

1. Not a JPEG: sent untouched. That covers PNG screenshots, WebP and GIF.
   HEIC is still converted to JPEG at 0.95, as before, because printers
   can't read it.
2. Unreadable or unusual (not 8-bit, not 3 colour channels): sent untouched.
3. A colour profile other than sRGB, such as iPhone Display P3: sent
   untouched. A browser canvas squashes wide colours into sRGB, and the print
   renderer converts them properly.
4. Saved below quality 97: sent untouched. That covers WhatsApp, screenshots
   saved as JPEG, edited photos and phones that save at 95 or less. WhatsApp
   and screenshot file names are also never re-saved, as a second guard.
5. Under 1.5 MB: sent untouched.
6. Otherwise, re-saved at 0.95 with every pixel kept. A photo whose short
   side is over 4,400 px (48 and 50 MP cameras) is also resized to 3,520 px:
   the largest photo on a page is 11 in, and 3,520 px is 320 ppi, half the
   printer's 640 dpi.
7. The copy must be at most 80% of the original, or the original is sent.
   Any failure sends the original. Being wrong can only mean a bigger file,
   never a worse one.

How it's decided: the source quality is read from the file's quantization
tables (`jpeg-info.ts`). The estimate is exact for every quality from 50 to
100 in the tests. The re-save runs in the HD lane, just before that photo
uploads, so it never delays photos appearing in the book.

Measured on the app's real output (Chromium, the owner's photos, SSIMULACRA2
on three 1000 px crops, where 90 means no visible difference at 100% zoom):

| Photo | Original | Sent for print | Score (worst crop) |
|---|---|---|---|
| Owner photo, 2624×3936, quality 99 | 7.0 MB | 3.2 MB (45%) | 89.4 |
| Owner photo, 3936×2624, quality 99 | 6.1 MB | 2.7 MB (44%) | 90.1 |
| Owner photo, 2752×1536, quality 99 | 2.4 MB | 1.0 MB (44%) | 88.2 |
| 50 MP, 6120×8160, quality 99 | 21.2 MB | 4.3 MB (21%), 3520×4693 | 88.3 |
| WhatsApp forward, 1067×1600, quality 78 | 0.26 MB | untouched | n/a |
| Phone at quality 92 | 1.9 MB | untouched | n/a |
| Display P3, quality 99 | 5.7 MB | untouched | n/a |
| PNG screenshot | 7.4 MB | untouched | n/a |

### 2. Uploads run on every page

The engine no longer needs the builder on screen. Only a photo whose book
has no project yet waits for the builder, because creating one needs it.
The keep-alive pieces (screen wake lock, the "Leave site?" warning) moved to
`UploadNotices`. That component is mounted at the app shell, and only for
visitors with photos on their way.

### 3. Photos are kept on the phone until their HD copy is up

Each picked photo is copied into the browser's private file storage, the
Origin Private File System (`stash.ts`, written by `stash.worker.ts`). A
list of what's there lives in localStorage (`pending.ts`). The next page load
anywhere on the site carries on by itself. A Web Lock makes sure only one tab
does this, so two tabs never upload the same photo. Where the storage is
missing, blocked or full, the customer gets the re-add list instead, as
before.

The builder asks the server (`photo-status`) when it opens. Uploads that
finished while it was closed then show up straight away, so a photo that's
safe never looks blank or asks to be added again.

### 4. The re-add list shows exactly which photos (A4)

The list shows each photo's picture, file name, date taken (EXIF) and page.
Choosing a whole album again is fine: the sheet takes only the photos the
book is waiting on and ignores the rest. The file name and date are saved
with each photo in the book document (`name`, `taken`).

### 5. Coming back from another app (C2), and welcome back (A3)

The C2 message, "Uploading again", shows only when the customer was away for
at least 8 seconds and the HD upload made no progress meanwhile, which is
what iPhones do. Coming back also retries at once, instead of waiting out a
backoff. A3, "Welcome back. We're carrying on.", shows once after photos are
carried over from an earlier visit, then fades. Per the owner, nothing is
shown on each photo: the customer keeps designing with the display copies.

### 6. Google sign-in opens in a new tab

`signInWithGoogleInNewTab` opens a blank tab inside the tap, so it isn't
blocked as a pop-up, then points it at Google. Google returns to
`/auth/done`. That page tells the original tab over a BroadcastChannel and
closes itself. If the tab can't open, sign-in falls back to the old redirect,
which is now safe because the photos are kept on the phone. The sign-in sheet
also checks the session whenever the customer returns to the tab, which covers
magic links opened from an email app.

### 7. Checkout: Option 2, decluttered (canvas D2/D3, approved 2026-11-28)

Pay stays locked until every printed photo's HD copy is in. The customer can
fill everything in meanwhile. While they wait, the only addition is one line
above Pay saying how many are left; the button reads "Pay opens when your
photos finish".

The page itself was decluttered to three cards and a footer:

- the book in one row: cover, title, size, pages, finish, "See it again" and
  the number of copies
- where to send it: name, mobile, one address line, city and province
- how to pay: method names only, then book, delivery to the city typed, and
  the total

The footer holds Pay and one line covering print and delivery time,
cancelling and Safepay. On phones it stays on screen while scrolling.

Removed from the page:

- the "Final step" kicker and sub-line
- the separate apartment/landmark field
- the postal code (optional, and not needed by the courier)
- the "order updates go to" line
- the sheet maths and the long delivery paragraph
- each payment method's explanation (bank transfer keeps one line once
  picked)

A saved address with a second line has it folded into the first, so nothing
is sent that the customer can't see.

## Not changed

Editor and preview copies stay as they are:

| Copy | Size | Format |
|---|---|---|
| Display copy | 1600 px long edge | WebP q0.80 (JPEG q0.75 on Safari) |
| Thumbnail | 400 px | WebP q0.72 (JPEG q0.70) |

The display copy scored 75.5 on SSIMULACRA2 ("high quality"). It is used
only on screen, never for printing.

## Consequences

- The HD upload is about half the bytes for typical high-quality phone
  photos. 80 photos of the owner's kind drop from about 520 MB to about
  240 MB, roughly 11 to 12 minutes instead of 25 at the speed measured.
- EXIF metadata isn't carried into a re-saved print copy. The print renderer
  never needed it: rotation is applied to the pixels first.
- Storage on the customer's phone: up to the size of the photos picked,
  freed as each HD copy lands. Entries older than 14 days are dropped.
- Tests: `client/src/features/builder/upload/print-copy.test.ts`.
