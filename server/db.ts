/**
 * Database client — Drizzle over node-postgres.
 *
 * Approach: one lazily-created pg Pool for the whole process, exposed
 * through getDb(). We use the plain Postgres wire protocol (`pg`)
 * rather than the Neon serverless driver so the SAME code runs against
 * local Postgres in dev and Neon's pooled connection string in prod
 * (Neon speaks standard postgres protocol; see docs/adr/001).
 *
 * getDb() must only be called when DATABASE_URL is set — the storage
 * factory (storage.ts) guarantees that; calling it without one is a
 * programmer error and throws immediately rather than failing later.
 */

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

let db: NodePgDatabase<typeof schema> | null = null;

export function getDb(): NodePgDatabase<typeof schema> {
  if (db) return db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("getDb() called without DATABASE_URL — storage factory should have used MemStorage");
  }
  const pool = new pg.Pool({
    connectionString: url,
    // Neon/pgbouncer friendly: modest pool, fail fast instead of hanging
    max: 10,
    connectionTimeoutMillis: 5_000,
  });
  db = drizzle(pool, { schema });
  return db;
}
