/**
 * Database access for the ops console (docs/adr/018).
 *
 * The ops features — staff step-up, audit log, print jobs, the notification
 * outbox, analytics — query Postgres directly with Drizzle instead of going
 * through IStorage. They are reporting and back-office work over tables only
 * they own, with SQL (percentiles, funnels, GROUP BY) that an in-memory twin
 * would have to re-implement badly. The durable queue needs Postgres anyway.
 *
 * So: with DATABASE_URL these work; without it (zero-setup dev) `opsDb()`
 * returns null and each feature degrades: the admin answers 503 with a clear
 * message, beacons are dropped, notifications are logged instead of stored.
 */

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "@shared/schema";
import { config } from "../config";
import { getDb } from "../db";

export type OpsDb = NodePgDatabase<typeof schema>;

/** The shared Drizzle client, or null when the app runs without a database. */
export function opsDb(): OpsDb | null {
  return config.databaseUrl ? getDb() : null;
}

/** For code that only runs when a database exists (job handlers, admin routes behind the gate). */
export function requireOpsDb(): OpsDb {
  const db = opsDb();
  if (!db) throw Object.assign(new Error("The admin console needs a database (DATABASE_URL)"), { status: 503 });
  return db;
}
