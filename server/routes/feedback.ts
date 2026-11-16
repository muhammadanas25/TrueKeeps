/**
 * Customer feedback, shown to customers as private "reviews" on /review and
 * read on /admin/reviews (docs/adr/015). The API and table keep the name.
 *
 *   POST  /api/feedback               anyone; signed-in or guest visitors are linked
 *   GET   /api/admin/feedback?status=  the inbox, newest first           (admin)
 *   PATCH /api/admin/feedback/:id      mark a message read or new        (admin)
 *
 * Approach:
 *  1. Validate with the same schema the form uses (shared/feedback.ts).
 *  2. A filled honeypot (`website`) gets the normal success reply and is
 *     dropped, so a bot can't tell it was caught.
 *  3. Save the message, then email it to every ADMIN_EMAILS address so the
 *     team hears about it without checking the inbox. The email is best
 *     effort: a provider failure is logged and never fails the request,
 *     because the message is already safely stored.
 *  4. A per-visitor limit (5 per 10 minutes) caps rows and emails.
 */

import { Router } from "express";
import { createFeedbackSchema, FEEDBACK_STATUSES, ratingLabel, topicLabel, updateFeedbackSchema, type FeedbackStatus } from "@shared/feedback";
import type { Feedback } from "@shared/schema";
import { storage } from "../storage";
import { config } from "../config";
import { log } from "../logger";
import { emailProvider } from "../email";
import { feedbackReceivedEmail } from "../email/templates";
import { optionalUser, requireAdmin } from "../middleware/auth";
import { feedbackLimiter, writeLimiter } from "../middleware/rate-limit";
import { asyncHandler, parse } from "./helpers";

export const feedbackRouter = Router();

/** Tell the team. Never throws: the message is saved whatever happens here. */
async function notifyTeam(row: Feedback): Promise<void> {
  const to = config.auth.adminEmails;
  if (!to.length) return;
  const tpl = feedbackReceivedEmail({
    topic: topicLabel(row.topic),
    rating: ratingLabel(row.rating),
    message: row.message,
    name: row.name,
    contact: row.contact,
    orderNumber: row.orderNumber,
    adminUrl: `${config.appUrl}/admin/reviews`,
  });
  await Promise.all(
    to.map((email) =>
      emailProvider
        .send({ to: email, ...tpl, idempotencyKey: `feedback-${row.id}-${email}` })
        .catch((err) => log.error({ err, feedbackId: row.id }, "[feedback] team email failed")),
    ),
  );
}

feedbackRouter.post(
  "/api/feedback",
  optionalUser,
  feedbackLimiter,
  asyncHandler(async (req, res) => {
    const body = parse(createFeedbackSchema, req.body, res);
    if (!body) return;
    if (body.website) {
      log.warn({ ip: req.ip }, "[feedback] honeypot filled, dropped");
      return res.status(201).json({ ok: true });
    }
    const row = await storage.createFeedback({
      userId: req.user?.id ?? null,
      topic: body.topic,
      rating: body.rating,
      message: body.message,
      name: body.name,
      contact: body.contact,
      orderNumber: body.orderNumber,
      fromPath: body.from,
    });
    log.info({ feedbackId: row.id, topic: row.topic, rating: row.rating }, "[feedback] received");
    void notifyTeam(row);
    res.status(201).json({ ok: true });
  }),
);

feedbackRouter.get(
  "/api/admin/feedback",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const status = FEEDBACK_STATUSES.includes(req.query.status as FeedbackStatus) ? (req.query.status as FeedbackStatus) : undefined;
    res.json(await storage.listFeedback({ status, limit: 300 }));
  }),
);

feedbackRouter.patch(
  "/api/admin/feedback/:id",
  requireAdmin,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const body = parse(updateFeedbackSchema, req.body, res);
    if (!body) return;
    const row = await storage.setFeedbackStatus(req.params.id, body.status);
    if (!row) return res.status(404).json({ error: "Feedback not found" });
    res.json(row);
  }),
);
