/**
 * WhatsApp delivery receipts from Meta.
 *
 *   GET  /api/webhooks/whatsapp   Meta's one-time subscription check: echo
 *                                 hub.challenge when hub.verify_token matches
 *                                 WHATSAPP_VERIFY_TOKEN (raw text, not JSON)
 *   POST /api/webhooks/whatsapp   status updates; trusted only when
 *                                 X-Hub-Signature-256 is a valid HMAC of the
 *                                 raw body with WHATSAPP_APP_SECRET
 *
 * Each status moves the matching outbox row forward (sent → delivered →
 * read, or failed with Meta's reason). Statuses can arrive out of order, so a
 * row never moves backwards. Always answers 200 to a valid call, or Meta
 * retries for days.
 */

import express, { Router } from "express";
import { and, eq, notInArray } from "drizzle-orm";
import { notifications } from "@shared/schema";
import { config } from "../config";
import { opsDb } from "../ops/db";
import { verifySignature } from "../notify/whatsapp";
import { log } from "../logger";

export const whatsappWebhookRouter = Router();

const RANK: Record<string, number> = { queued: 0, failed: 1, sent: 2, delivered: 3, read: 4 };

whatsappWebhookRouter.get("/api/webhooks/whatsapp", (req, res) => {
  const token = config.whatsapp?.verifyToken;
  if (token && req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === token) {
    return res.type("text/plain").send(String(req.query["hub.challenge"] ?? ""));
  }
  res.status(403).end();
});

whatsappWebhookRouter.post("/api/webhooks/whatsapp", express.raw({ type: () => true, limit: "1mb" }), async (req, res) => {
  const raw = req.body as Buffer;
  if (!Buffer.isBuffer(raw) || !verifySignature(raw, req.headers["x-hub-signature-256"] as string | undefined)) {
    return res.status(401).end();
  }
  res.status(200).end();
  const db = opsDb();
  if (!db) return;
  try {
    const body = JSON.parse(raw.toString("utf8")) as {
      entry?: Array<{ changes?: Array<{ value?: { statuses?: Array<{ id: string; status: string; errors?: Array<{ title?: string; message?: string }> }> } }> }>;
    };
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const st of change.value?.statuses ?? []) {
          if (!(st.status in RANK)) continue;
          const lower = Object.keys(RANK).filter((k) => RANK[k] >= RANK[st.status] && k !== "failed");
          await db
            .update(notifications)
            .set({
              status: st.status,
              ...(st.status === "failed" ? { error: (st.errors?.[0]?.message ?? st.errors?.[0]?.title ?? "failed").slice(0, 300) } : {}),
              updatedAt: new Date(),
            })
            // never move backwards: only rows whose status is below the new one
            .where(and(eq(notifications.providerId, st.id), notInArray(notifications.status, st.status === "failed" ? ["delivered", "read"] : lower)));
        }
      }
    }
  } catch (err) {
    log.warn({ err }, "[whatsapp] webhook parse failed");
  }
});
