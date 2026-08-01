# ADR 002 — Media store with presigned direct uploads (local disk dev, R2 prod)

**Status:** accepted · 2026-07-14

## Context

Photos were uploaded as base64 data URLs inside JSON bodies
(`express.json({limit:'50mb'})`) and stored as text in the DB/memory. A
50-photo book is ~150MB of JSON parse + DB rows; photo bandwidth would
be the #1 cost and the API server the bottleneck.

## Decision

- Introduce a `MediaStore` interface (server/media.ts) that owns photo
  BYTES; the database keeps only metadata + URLs.
- Upload flow is presign → direct PUT → complete:
  1. `POST /api/uploads/presign` validates type/size and returns
     `{key, uploadUrl, headers, publicUrl}`
  2. client PUTs the raw file to `uploadUrl`
  3. `POST /api/uploads/complete` registers the row and queues
     derivative generation
- Two backends behind the interface, chosen by env:
  - **LocalDiskMediaStore** (default): files under `.local/media`,
    "presigned" URL points at `PUT /api/media/<key>` on the same
    Express app, served back at `/media/<key>` with immutable caching.
    Exists so the client flow is byte-identical in dev and prod.
  - **S3MediaStore**: any S3-compatible store via `@aws-sdk/client-s3`
    presigned PUTs. Target is **Cloudflare R2** because egress is $0
    and photo delivery dominates bandwidth; a public bucket domain/CDN
    serves reads (`S3_PUBLIC_BASE_URL`).
- Keys are server-generated (`projects/<projectId>/<uuid>-<name>`),
  re-validated on every byte-touching endpoint (no traversal), and
  immutable (cache-forever).
- Client compresses before upload (browser-image-compression in a Web
  Worker, ~2.5MB/2400px cap) — good enough for screen; print-quality
  originals policy is revisited with the print pipeline (Phase 3).

## Consequences

- Legacy `POST /api/uploads` (data URL in JSON) still exists for the
  classic wizard; new surfaces must use the presign flow.
- Deleting an upload best-effort deletes original + derivatives.
- R2 credentials are configuration only — no code change to go live.
