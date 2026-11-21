/**
 * Granting staff roles at sign-in.
 *
 * Two sources, checked every time a session is created:
 *  - ADMIN_EMAILS (env): the owner's bootstrap. Before this, it only applied
 *    when the user row was first created, so an email added to the env after
 *    that person had signed up never became admin. Now it applies on their
 *    next sign-in.
 *  - staff_invites: an Owner typed this email into Admin → Team before the
 *    person had an account. The role is applied once and the invite deleted.
 *
 * Neither ever lowers a role; removing staff is done from Admin → Team.
 */

import { eq } from "drizzle-orm";
import { staffInvites, users } from "@shared/schema";
import { isStaffRole } from "@shared/ops";
import { config } from "../config";
import { storage } from "../storage";
import { opsDb } from "./db";
import { log } from "../logger";

/** Set a user's role (staff changes only ever go through here and Admin → Team). */
export async function setRole(userId: string, role: string): Promise<void> {
  const db = opsDb();
  if (!db) return;
  await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId));
}

export async function applyStaffRoleOnSignIn(userId: string): Promise<void> {
  const db = opsDb();
  if (!db) return; // without a database, the create-time hook in auth.ts still applies ADMIN_EMAILS
  const user = await storage.getUser(userId);
  if (!user || user.isAnonymous) return;
  const email = user.email.toLowerCase();

  if (config.auth.adminEmails.includes(email) && user.role !== "admin") {
    await setRole(user.id, "admin");
    log.info({ userId }, "[staff] owner role applied from ADMIN_EMAILS");
    return;
  }
  const [invite] = await db.select().from(staffInvites).where(eq(staffInvites.email, email)).limit(1);
  if (!invite) return;
  if (isStaffRole(invite.role) && user.role !== "admin") {
    await setRole(user.id, invite.role);
    log.info({ userId, role: invite.role }, "[staff] invited role applied");
  }
  await db.delete(staffInvites).where(eq(staffInvites.email, email));
}
