/**
 * Migration runner — `npm run db:migrate`.
 *
 * Applies every SQL file in ./migrations that has not yet been recorded
 * in drizzle's `__drizzle_migrations` journal table, each in its own
 * transaction, in order. Safe to run repeatedly; a no-op when current.
 *
 * Why not `drizzle-kit push` (docs/adr/007): push diffs the live DB
 * interactively and can drop columns; migrations are reviewed SQL,
 * versioned in git, and run unattended as Railway's pre-deploy command
 * so the schema and the code that expects it always ship together.
 *
 * Uses its own short-lived pg Pool rather than server/db.ts so it can
 * run in a process that never boots the app.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { config } from "./config";

async function main() {
  if (!config.databaseUrl) {
    console.error("[migrate] DATABASE_URL is not set — nothing to migrate");
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 1, connectionTimeoutMillis: 10_000 });
  const db = drizzle(pool);
  const started = Date.now();
  try {
    await migrate(db, { migrationsFolder: "./migrations" });
    console.log(`[migrate] up to date (${Date.now() - started}ms)`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
