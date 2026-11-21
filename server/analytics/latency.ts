/**
 * Server response times by route, as p50 / p90 / p95 / p99.
 *
 * How: every /api request is timed when it finishes and counted into a
 * fixed-bucket histogram for its route template ("GET /api/orders/:id", never
 * the real id, so the table stays small and holds no customer data). Once a
 * minute each route's histogram is written as one row of `request_metrics`.
 *
 * Why histograms, not averages: one slow call hides in an average and is
 * exactly what you want to see. Fixed buckets also merge exactly — the
 * admin adds up any range of minutes and reads percentiles off the sum.
 * The answer is the bucket's upper bound, so "p95 ≤ 300 ms" is as precise as
 * the bucket edges below, which is plenty for spotting outliers.
 */

import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "crypto";
import { requestMetrics } from "@shared/schema";
import { opsDb } from "../ops/db";
import { log } from "../logger";

/** Upper bounds in ms; the last bucket is everything slower. */
export const BUCKET_BOUNDS = [5, 10, 25, 50, 75, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000, 10000, 30000];

interface Acc {
  count: number;
  errors: number;
  sumMs: number;
  maxMs: number;
  buckets: number[];
}

const INSTANCE = randomUUID().slice(0, 8);
let current = new Map<string, Acc>();

export function bucketOf(ms: number): number {
  const i = BUCKET_BOUNDS.findIndex((b) => ms <= b);
  return i < 0 ? BUCKET_BOUNDS.length : i;
}

/** Percentile from summed buckets: the upper bound of the bucket holding it. */
export function percentile(buckets: number[], p: number): number | null {
  const total = buckets.reduce((a, b) => a + b, 0);
  if (!total) return null;
  const target = Math.ceil(total * p);
  let seen = 0;
  for (let i = 0; i < buckets.length; i++) {
    seen += buckets[i];
    if (seen >= target) return BUCKET_BOUNDS[i] ?? BUCKET_BOUNDS[BUCKET_BOUNDS.length - 1] * 2;
  }
  return null;
}

export function record(route: string, ms: number, error: boolean) {
  let a = current.get(route);
  if (!a) {
    a = { count: 0, errors: 0, sumMs: 0, maxMs: 0, buckets: new Array(BUCKET_BOUNDS.length + 1).fill(0) };
    current.set(route, a);
  }
  a.count++;
  if (error) a.errors++;
  a.sumMs += ms;
  a.maxMs = Math.max(a.maxMs, ms);
  a.buckets[bucketOf(ms)]++;
}

/** Express middleware: time /api requests (health checks and beacons excluded). */
export function latencyRecorder(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith("/api") || req.path === "/api/health" || req.path === "/api/events") return next();
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const template = req.route?.path ? `${req.baseUrl}${req.route.path}` : "(no route)";
    record(`${req.method} ${template}`, Math.round(ms), res.statusCode >= 500);
  });
  next();
}

/** Write the last minute's histograms. Called every minute; a failed write is dropped, not retried. */
export async function flushLatency(): Promise<void> {
  const db = opsDb();
  const batch = current;
  current = new Map();
  if (!db || !batch.size) return;
  const minute = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 60_000);
  const rows = Array.from(batch.entries()).map(([route, a]) => ({ minute, route, instance: INSTANCE, ...a }));
  try {
    await db.insert(requestMetrics).values(rows).onConflictDoNothing();
  } catch (err) {
    log.warn({ err }, "[latency] flush failed");
  }
}

setInterval(() => void flushLatency(), 60_000).unref();
