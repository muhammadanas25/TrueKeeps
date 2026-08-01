# ADR 003 — In-process job queue (pg-boss-shaped) + sharp image pipeline

**Status:** accepted · 2026-07-14

## Context

Thumbnail/preview generation, and later PDF rendering and AI caption
batches, must not run inside HTTP request handlers. The roadmap's
target queue is pg-boss (Postgres-backed, survives restarts), but the
dev default has no database at all, and today's job volume is tiny.

## Decision

- server/jobs.ts implements a minimal in-process queue with the same
  register/enqueue surface pg-boss exposes: bounded concurrency (2 —
  sharp work is CPU-bound), one retry, never awaited by request
  handlers. Swapping the internals for pg-boss later touches zero
  enqueue call sites.
- First job, `media.derivatives`: sharp `.rotate()` (applies EXIF
  orientation — phone photos otherwise render sideways), probes
  rotated dimensions (needed for print preflight), and emits two webp
  derivatives next to the original (`.thumb.webp` ~400px for grids,
  `.preview.webp` ~1200px for book spreads), then patches the
  uploaded_photos row.
- Failure is non-fatal by design: clients render the original URL until
  `thumbUrl`/`previewUrl` appear.

## Consequences

- Jobs are lost on process crash (acceptable: derivatives are
  re-derivable; nothing user-visible is queued yet). Revisit at the
  point orders/PDF rendering enter the queue — that's the pg-boss
  trigger.
- Sharp is a native dependency; it's in `dependencies` so production
  builds include the platform binary.
