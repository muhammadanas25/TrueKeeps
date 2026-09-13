/**
 * Email delivery — one tiny interface, two implementations.
 *
 * Why an interface: the auth layer (magic links), orders (confirmations)
 * and the reminder job (Phase 2C) all need "send this message" and none
 * of them should know which provider is wired. Swapping Resend for Brevo
 * later is a one-file change here.
 *
 *  - ConsoleEmailProvider (dev default / no API key): prints the message,
 *    including the magic-link URL, to the server log so you can click it.
 *  - ResendEmailProvider: HTTPS call to Resend's REST API. Kept as a
 *    plain fetch so we don't take an SDK dependency for one endpoint.
 *
 * Templates live next to their feature (server/email/templates/*) and
 * return {subject, html, text}. Keep `text` — some PK mobile clients
 * render plain text only.
 */

import { config } from "../config";
import { log } from "../logger";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** stable id for idempotent sends / provider dedupe (e.g. notification row id) */
  idempotencyKey?: string;
}

export interface EmailProvider {
  readonly kind: "console" | "resend";
  send(msg: EmailMessage): Promise<{ providerMessageId: string | null }>;
}

class ConsoleEmailProvider implements EmailProvider {
  readonly kind = "console" as const;
  async send(msg: EmailMessage) {
    log.info({ to: msg.to, subject: msg.subject }, "[email:console] message (not sent)");
    // The text body carries the actionable link (magic link etc.) — print
    // it so dev flows are completable from the terminal.
    // eslint-disable-next-line no-console
    console.log(`\n──── email to ${msg.to} ────\n${msg.subject}\n\n${msg.text}\n────────────────────────────\n`);
    return { providerMessageId: null };
  }
}

class ResendEmailProvider implements EmailProvider {
  readonly kind = "resend" as const;
  constructor(private readonly apiKey: string) {}
  async send(msg: EmailMessage) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...(msg.idempotencyKey ? { "Idempotency-Key": msg.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: config.email.from,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`resend ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as { id?: string };
    return { providerMessageId: data.id ?? null };
  }
}

export const emailProvider: EmailProvider = config.email.resendApiKey
  ? new ResendEmailProvider(config.email.resendApiKey)
  : new ConsoleEmailProvider();

if (config.isProd && emailProvider.kind === "console") {
  log.warn("[email] RESEND_API_KEY not set in production — emails will only be logged");
}
