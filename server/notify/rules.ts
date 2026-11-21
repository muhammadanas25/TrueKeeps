/**
 * Notification rules: who gets which message, as set in Admin → Notifications.
 *
 * A rule that was never saved falls back to the event's defaults
 * (NOTIFY_EVENT_INFO in shared/ops.ts) with these staff emails:
 *   ALERT_EMAILS if set, otherwise the email of every Owner account.
 * So staff alerts reach the owner from the first deploy, and the settings
 * screen opens pre-filled with exactly who would get them. Once saved, the
 * rule is taken literally: an empty list means nobody.
 */

import { eq, inArray } from "drizzle-orm";
import { notifyRules, users, type NotifyRule } from "@shared/schema";
import { NOTIFY_EVENTS, NOTIFY_EVENT_INFO, type NotifyEvent, type NotifyRuleInput } from "@shared/ops";
import { config } from "../config";
import { opsDb, requireOpsDb } from "../ops/db";

export interface EffectiveRule extends NotifyRuleInput {
  event: NotifyEvent;
  /** false until the owner saves this rule once */
  saved: boolean;
  updatedAt: Date | null;
}

async function fallbackStaffEmails(): Promise<string[]> {
  if (config.ops.alertEmails.length) return config.ops.alertEmails;
  const db = opsDb();
  if (!db) return config.auth.adminEmails;
  const owners = await db.select({ email: users.email }).from(users).where(inArray(users.role, ["admin"]));
  return owners.map((o) => o.email.toLowerCase());
}

function fromRow(event: NotifyEvent, row: NotifyRule): EffectiveRule {
  return {
    event,
    saved: true,
    updatedAt: row.updatedAt,
    enabled: row.enabled,
    staffEmails: row.staffEmails ?? [],
    staffWhatsapp: row.staffWhatsapp ?? [],
    customerEmail: row.customerEmail,
    customerWhatsapp: row.customerWhatsapp,
    staffTemplate: row.staffTemplate,
    customerTemplate: row.customerTemplate,
    templateLang: row.templateLang,
  };
}

async function defaultRule(event: NotifyEvent): Promise<EffectiveRule> {
  const d = NOTIFY_EVENT_INFO[event].defaults;
  return {
    event,
    saved: false,
    updatedAt: null,
    enabled: true,
    staffEmails: d.staffEmail ? await fallbackStaffEmails() : [],
    staffWhatsapp: [],
    customerEmail: d.customerEmail,
    customerWhatsapp: d.customerWhatsapp,
    staffTemplate: null,
    customerTemplate: null,
    templateLang: "en",
  };
}

export async function getRule(event: NotifyEvent): Promise<EffectiveRule> {
  const db = opsDb();
  if (db) {
    const [row] = await db.select().from(notifyRules).where(eq(notifyRules.event, event)).limit(1);
    if (row) return fromRow(event, row);
  }
  return defaultRule(event);
}

export async function listRules(): Promise<EffectiveRule[]> {
  const db = requireOpsDb();
  const rows = new Map((await db.select().from(notifyRules)).map((r) => [r.event, r]));
  return Promise.all(NOTIFY_EVENTS.map((e) => (rows.has(e) ? fromRow(e, rows.get(e)!) : defaultRule(e))));
}

export async function saveRule(event: NotifyEvent, input: NotifyRuleInput, updatedBy: string): Promise<EffectiveRule> {
  const db = requireOpsDb();
  const values = { ...input, event, updatedBy, updatedAt: new Date() };
  const [row] = await db.insert(notifyRules).values(values).onConflictDoUpdate({ target: notifyRules.event, set: values }).returning();
  return fromRow(event, row);
}
