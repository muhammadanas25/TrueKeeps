/**
 * WhatsApp Cloud API (Meta, direct — no Twilio markup; owner's choice).
 *
 * Sending: POST graph.facebook.com/<version>/<phone-number-id>/messages with
 * a template message. Messages a business starts must use a template Meta
 * has approved (utility category), so the template's name and language come
 * from the notification rule and only its {{n}} parameters come from us.
 *
 * Delivery receipts: Meta calls our webhook with statuses (sent → delivered
 * → read, or failed). server/routes/notify-webhooks.ts checks the
 * X-Hub-Signature-256 HMAC of the raw body with the app secret before trusting
 * any of it (`verifySignature` below).
 *
 * Not configured (no WHATSAPP_* env): `whatsapp` is null and the outbox marks
 * WhatsApp rows `skipped`, so email keeps working while Meta verification is
 * pending.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { config } from "../config";

export interface WhatsAppSender {
  sendTemplate(to: string, template: string, lang: string, params: string[]): Promise<{ messageId: string | null }>;
}

class CloudApiSender implements WhatsAppSender {
  constructor(private readonly cfg: NonNullable<typeof config.whatsapp>) {}

  async sendTemplate(to: string, template: string, lang: string, params: string[]) {
    const url = `https://graph.facebook.com/${this.cfg.apiVersion}/${this.cfg.phoneNumberId}/messages`;
    const body = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: template,
        language: { code: lang },
        ...(params.length
          ? { components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text: text.slice(0, 1000) || "-" })) }] }
          : {}),
      },
    };
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await res.json().catch(() => ({}))) as { messages?: Array<{ id: string }>; error?: { message?: string; code?: number } };
    if (!res.ok) throw new Error(`whatsapp ${res.status}: ${data.error?.message ?? "request failed"}`.slice(0, 300));
    return { messageId: data.messages?.[0]?.id ?? null };
  }
}

export const whatsapp: WhatsAppSender | null = config.whatsapp ? new CloudApiSender(config.whatsapp) : null;

/** True when `signature` (the X-Hub-Signature-256 header) matches the raw body. */
export function verifySignature(rawBody: Buffer, signature: string | undefined): boolean {
  const secret = config.whatsapp?.appSecret;
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = Buffer.from("sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex"));
  const got = Buffer.from(signature);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** 03001234567 / +92 300 1234567 → 923001234567 (what the Cloud API expects). */
export function toWhatsappNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = phone.replace(/[^\d]/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = "92" + d.slice(1);
  return /^\d{10,15}$/.test(d) ? d : null;
}
