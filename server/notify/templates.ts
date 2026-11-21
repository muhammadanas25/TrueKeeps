/**
 * What each notification says, per event and audience (staff | customer).
 *
 * Email: {subject, html, text} with the same brand look as server/email/
 * templates.ts (Paper ground, Indigo heading, one Rose button, no emoji).
 * The customer's "order confirmed" email is that module's existing template,
 * so customers see no change.
 *
 * WhatsApp: only the ordered parameters for the owner's approved template
 * (their wording lives in Meta's manager). The order matches
 * NOTIFY_EVENT_INFO[event].whatsappParams in shared/ops.ts, which is what the
 * settings screen shows.
 *
 * Privacy: messages carry a first name and an order number at most. Links go
 * to pages that need sign-in; print files are never attached.
 */

import type { NotifyEvent } from "@shared/ops";
import { config } from "../config";
import { orderConfirmedEmail } from "../email/templates";

export type Vars = Record<string, string | number | boolean | null | undefined>;
export type Audience = "staff" | "customer";
export interface EmailBody {
  subject: string;
  html: string;
  text: string;
}

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const s = (v: unknown) => String(v ?? "");

function shell(title: string, lines: string[], cta?: { href: string; label: string }): string {
  const body = lines.map((l) => `<tr><td style="font-size:16px;line-height:26px;padding:4px 0">${l}</td></tr>`).join("");
  const btn = cta
    ? `<tr><td style="padding:18px 0"><a href="${esc(cta.href)}" style="display:inline-block;background:#CA3A58;color:#fff;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:999px">${esc(cta.label)}</a></td></tr>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#FBF6F0;font-family:Figtree,Helvetica,Arial,sans-serif;color:#404442">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FBF6F0;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fff;border-radius:14px;padding:36px 32px">
<tr><td style="padding-bottom:12px"><img src="${config.appUrl}/email-logo.png" width="140" height="28" alt="truekeeps" style="display:block;border:0"></td></tr>
<tr><td style="font-size:20px;line-height:28px;font-weight:700;color:#2A1E5C;padding:12px 0 6px">${esc(title)}</td></tr>
${body}${btn}
<tr><td style="font-size:12px;color:#595080;padding-top:28px;border-top:1px solid #DEE2E1">TrueKeeps · thetruekeeps.com</td></tr>
</table></td></tr></table></body></html>`;
}

function make(title: string, subject: string, lines: string[], cta?: { href: string; label: string }): EmailBody {
  const text = [title, "", ...lines.map((l) => l.replace(/<[^>]+>/g, "")), ...(cta ? ["", `${cta.label}: ${cta.href}`] : [])].join("\n");
  return { subject, html: shell(title, lines.map(esc), cta), text };
}

const test = (v: Vars) => (v.testMode ? "[TEST] " : "");

/** The email for one event and audience, or null when that pair has no email. */
export function renderEmail(event: NotifyEvent, audience: Audience, v: Vars): EmailBody | null {
  const admin = { href: s(v.adminUrl), label: "Open in admin" };
  if (audience === "customer") {
    switch (event) {
      case "order_paid":
        return orderConfirmedEmail({
          orderNumber: s(v.orderNumber),
          title: s(v.title),
          totalMinor: Number(v.totalMinor ?? 0),
          qty: Number(v.qty ?? 1),
          binding: s(v.binding),
          finish: s(v.finish),
          orderUrl: s(v.orderUrl),
          testMode: Boolean(v.testMode),
        });
      case "order_shipped":
        return make(
          "Your book is on its way",
          `${test(v)}Your TrueKeeps order ${s(v.orderNumber)} has shipped`,
          [`Hi ${s(v.firstName)}, your book "${s(v.title)}" is with ${s(v.courier) || "the courier"}.`, v.tracking ? `Tracking number: ${s(v.tracking)}` : "We'll let you know when it's delivered."],
          { href: s(v.orderUrl), label: "See your order" },
        );
      case "order_delivered":
        return make(
          "Delivered. We hope you love it.",
          `${test(v)}Your TrueKeeps book has been delivered`,
          [`Hi ${s(v.firstName)}, order ${s(v.orderNumber)} shows as delivered.`, "If anything isn't right, reply to this email and we'll fix it. If it is, we'd love to hear that too."],
          { href: s(v.reviewUrl), label: "Leave a private review" },
        );
      case "order_cancelled":
        return make(
          `Order ${s(v.orderNumber)} ${s(v.status)}`,
          `${test(v)}Your TrueKeeps order ${s(v.orderNumber)} was ${s(v.status)}`,
          [`Hi ${s(v.firstName)}, your order ${s(v.orderNumber)} was ${s(v.status)}.`, "Questions? Reply to this email."],
          { href: s(v.orderUrl), label: "See your order" },
        );
      default:
        return null;
    }
  }
  switch (event) {
    case "order_paid":
      return make(`New order ${s(v.orderNumber)}`, `${test(v)}New order ${s(v.orderNumber)} · ${s(v.total)}`, [`"${s(v.title)}" · ${s(v.book)}`, `Total ${s(v.total)} · ${s(v.city)}`], admin);
    case "print_ready":
      return make(`Print file ready: ${s(v.orderNumber)}`, `Print file ready · ${s(v.orderNumber)}`, [`"${s(v.title)}": ${s(v.pages)} pages, checked and stored.`], admin);
    case "print_failed":
      return make(`Print file failed: ${s(v.orderNumber)}`, `Needs you: print file failed · ${s(v.orderNumber)}`, [`Tried ${s(v.attempts)} times. Last error: ${s(v.reason)}`, "Open the order to see which photos are affected and rebuild."], admin);
    case "order_shipped":
      return make(`Shipped: ${s(v.orderNumber)}`, `Shipped · ${s(v.orderNumber)}`, [`${s(v.courier)} ${s(v.tracking)}`], admin);
    case "order_delivered":
      return make(`Delivered: ${s(v.orderNumber)}`, `Delivered · ${s(v.orderNumber)}`, [`"${s(v.title)}"`], admin);
    case "order_cancelled":
      return make(`Order ${s(v.status)}: ${s(v.orderNumber)}`, `Order ${s(v.status)} · ${s(v.orderNumber)}`, [`"${s(v.title)}"`], admin);
    case "payment_mismatch":
      return make(
        `Payment mismatch on ${s(v.orderNumber)}`,
        `Check now: payment mismatch · ${s(v.orderNumber)}`,
        [`Safepay reported ${s(v.reported)}; the order total is ${s(v.total)}.`, "The order was NOT marked paid. Check the Safepay dashboard before doing anything else."],
        admin,
      );
    case "staff_sign_in":
      return make(
        "Admin sign-in",
        `Admin sign-in: ${s(v.name)}`,
        [`${s(v.name)} (${s(v.email)}) passed the admin's second sign-in step${v.first ? " for the first time" : ""}.`, `IP ${s(v.ip)} · ${new Date(s(v.when)).toLocaleString("en-PK", { timeZone: "Asia/Karachi" })}`, "If this wasn't expected, remove them in Admin → Team now."],
        { href: `${config.appUrl}/admin/team`, label: "Open Team" },
      );
    case "daily_summary":
      return make(
        "Yesterday at TrueKeeps",
        `Daily summary · ${s(v.paidCount)} orders · ${s(v.revenue)}`,
        [`Paid orders: ${s(v.paidCount)}`, `Revenue: ${s(v.revenue)}`, `Needing action now: ${s(v.actionCount)}`],
        { href: `${config.appUrl}/admin`, label: "Open the admin" },
      );
  }
}

/** Parameters for the event's approved WhatsApp template, in {{1}}, {{2}}… order. */
export function whatsappParams(event: NotifyEvent, audience: Audience, v: Vars): string[] {
  const c = audience === "customer";
  switch (event) {
    case "order_paid":
      return c ? [s(v.firstName), s(v.orderNumber), s(v.orderUrl)] : [s(v.orderNumber), s(v.title), s(v.total)];
    case "print_ready":
      return [s(v.orderNumber), s(v.title)];
    case "print_failed":
      return [s(v.orderNumber), s(v.reason).slice(0, 200)];
    case "order_shipped":
      return c ? [s(v.firstName), s(v.orderNumber), s(v.courier), s(v.tracking)] : [s(v.orderNumber), s(v.courier), s(v.tracking)];
    case "order_delivered":
      return c ? [s(v.firstName), s(v.orderNumber), s(v.reviewUrl)] : [s(v.orderNumber)];
    case "order_cancelled":
      return c ? [s(v.firstName), s(v.orderNumber), s(v.status)] : [s(v.orderNumber), s(v.status)];
    case "payment_mismatch":
      return [s(v.orderNumber), s(v.reported), s(v.total)];
    case "staff_sign_in":
      return [s(v.name), s(v.ip)];
    case "daily_summary":
      return [s(v.paidCount), s(v.revenue), s(v.actionCount)];
  }
}
