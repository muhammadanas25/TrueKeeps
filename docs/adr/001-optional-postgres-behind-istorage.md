# ADR 001 — Optional Postgres behind the IStorage repository interface

**Status:** accepted · 2026-07-14

## Context

Dev ran entirely on `MemStorage` (in-memory Maps): zero setup, but every
draft dies with the process. The Drizzle schema for Postgres already
existed but nothing implemented it. We need real persistence without
making local development require a database.

## Decision

- Keep the existing `IStorage` interface as the single seam between
  routes and persistence; add `DrizzleStorage` (server/storage-pg.ts)
  as a second implementation.
- Select the backend by configuration in one factory
  (server/storage.ts): `DATABASE_URL` set → Postgres, unset → memory.
- Use the plain `pg` driver (drizzle-orm/node-postgres), NOT the Neon
  serverless driver: Neon speaks the standard Postgres wire protocol
  through its pooled connection string, so the same code runs against
  local Postgres 16 in dev and Neon in prod. The serverless driver
  would work only against Neon endpoints.
- `getProjectFull()` is part of the interface specifically to keep
  whole-book loads at a fixed query count (project → pages →
  `inArray(pageIds)` photos → uploads), eliminating the 1+N(+N×M)
  fan-out the client used to do per page.
- Starter themes are seeded idempotently on boot when the themes table
  is empty, so a fresh database behaves exactly like a fresh dev server.

## Consequences

- `npm run db:push` (drizzle-kit) must be run once per new database.
- Sessions/orders tables (Phase 2) extend the same pattern.
- MemStorage stays the CI/unit-test backend — no test database needed.
