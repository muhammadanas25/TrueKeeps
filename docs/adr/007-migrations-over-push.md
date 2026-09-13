# ADR 007 — Versioned SQL migrations instead of `drizzle-kit push`

**Status:** accepted · 2026-09-13
*(numbered 007 to leave 005 orders/payments and 006 events for Phase 2B/2C)*

## Context

Schema changes were applied with `drizzle-kit push`, which diffs the live
database interactively and will happily drop columns. That was acceptable
for a prototype with no users. Phase 2A replaces the `users` table shape,
adds NOT NULL + foreign keys to columns that have nulls and dangling ids in
production, and adds auth tables — changes that need data backfills and
must run unattended before the new code starts.

## Decision

- `shared/schema.ts` stays the single source of truth; `npm run
  db:generate` emits SQL under `migrations/` (plus drizzle's snapshot
  chain) and the SQL is **reviewed and hand-edited** where a data
  migration is required (e.g. `0001` inserts a legacy owner and backfills
  `user_id` before `SET NOT NULL`).
- `migrations/0000_baseline.sql` recreates the pre-Phase-2 schema with
  `CREATE TABLE IF NOT EXISTS`, so the same chain applies to a fresh
  database and to the databases that already exist.
- `npm run db:migrate` (`server/migrate.ts`, drizzle's node-postgres
  migrator) applies pending files in order, each in a transaction, and
  records them in `__drizzle_migrations`. The build also bundles it to
  `dist/migrate.js`; Railway runs `npm run db:migrate:prod` as the
  `preDeployCommand`, so schema and code ship together and a failed
  migration blocks the deploy instead of half-applying.
- `db:push` remains in `package.json` for throwaway local experiments only.

## Consequences

- Every schema edit is a commit with a migration file; reviewers see the
  exact SQL that will hit production.
- Non-interactive `drizzle-kit generate` cannot answer "renamed or new
  column?" prompts; when a table both gains and loses columns, run it in a
  terminal (or drive the prompt) and accept "create" — as done for `0001`.
- Partitioned tables (Phase 2C `events`) and other DDL drizzle-kit does
  not model are written as hand-authored migration files in the same
  folder.
