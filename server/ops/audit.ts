/**
 * Audit log — who did what in the admin, and from where.
 *
 * Append-only rows in `audit_log` for every staff change, every print file
 * download, step-up passes and failures, and refused admin requests. It is
 * the record you reach for when a book went to the wrong address or a file
 * left the building: one place, with the person, time, IP and browser.
 *
 * Writing never blocks or fails the request it describes: an audit write that
 * errors is logged loudly instead (losing a request because the log table is
 * unhappy would be the worse outcome).
 */

import type { Request } from "express";
import { auditLog } from "@shared/schema";
import { opsDb } from "./db";
import { log } from "../logger";

export interface AuditTarget {
  type: string;
  id: string;
}

/** Record an action. `req` supplies the actor, IP and browser when there is one. */
export async function audit(req: Request | null, action: string, target?: AuditTarget | null, detail?: Record<string, unknown>): Promise<void> {
  const actor = req?.staff ?? null;
  const row = {
    actorId: actor?.userId ?? (req?.user?.id as string | undefined) ?? null,
    actorEmail: actor?.email ?? (req?.user?.email as string | undefined) ?? null,
    actorRole: actor?.role ?? null,
    action,
    targetType: target?.type ?? null,
    targetId: target?.id ?? null,
    detail: detail ?? null,
    ip: req?.ip ?? null,
    userAgent: req ? String(req.headers["user-agent"] ?? "").slice(0, 300) : null,
  };
  const db = opsDb();
  if (!db) {
    log.info({ audit: row }, "[audit]");
    return;
  }
  try {
    await db.insert(auditLog).values(row);
  } catch (err) {
    log.error({ err, audit: row }, "[audit] write failed");
  }
}
