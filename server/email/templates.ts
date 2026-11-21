/**
 * Email templates — plain functions returning {subject, html, text}.
 *
 * Deliberately no template engine: the messages are short, brand
 * styling is inline (email clients strip <style>), and a function per
 * message keeps every variable explicit and type-checked. Colours come
 * from Truekeeps-Brand-Kit: Paper ground, Indigo headings, one Rose 600
 * button. The logo is a hosted PNG because many email clients won't
 * render SVG. No emoji (brand rule).
 */

import { finishName, formatPKR } from "@shared/pricing";
import { config } from "../config";

const BRAND = {
  paper: "#FBF6F0",
  indigo: "#2A1E5C",
  /** Ink 400, solid stand-in for the kit's Ink at 85% */
  body: "#404442",
  /** Indigo 400 */
  soft: "#595080",
  /** Rose 600, the kit's button colour */
  button: "#CA3A58",
  /** Rose 700, for small Rose text */
  roseText: "#A5324A",
  /** Mist 300 */
  line: "#DEE2E1",
};

function shell(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:${BRAND.paper};font-family:Figtree,Helvetica,Arial,sans-serif;color:${BRAND.body}">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BRAND.paper};padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fff;border-radius:14px;padding:36px 32px">
<tr><td style="padding-bottom:12px"><img src="${config.appUrl}/email-logo.png" width="140" height="28" alt="truekeeps" style="display:block;border:0"></td></tr>
<tr><td style="font-size:20px;line-height:28px;font-weight:700;color:${BRAND.indigo};padding:12px 0 6px">${title}</td></tr>
${bodyHtml}
<tr><td style="font-size:12px;color:${BRAND.soft};padding-top:28px;border-top:1px solid ${BRAND.line}">Beautiful quality, for beautiful moments. · thetruekeeps.com</td></tr>
</table></td></tr></table></body></html>`;
}

function button(href: string, label: string): string {
  return `<tr><td style="padding:18px 0"><a href="${href}" style="display:inline-block;background:${BRAND.button};color:#fff;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:999px">${label}</a></td></tr>`;
}

function para(text: string): string {
  return `<tr><td style="font-size:16px;line-height:26px;padding:4px 0">${text}</td></tr>`;
}

export function magicLinkEmail(params: { url: string; expiresMinutes: number }) {
  const { url, expiresMinutes } = params;
  return {
    subject: "Your TrueKeeps sign-in link",
    html: shell(
      "Sign in to TrueKeeps",
      para("Tap the button below to sign in. This link works once and expires in " + expiresMinutes + " minutes.") +
        button(url, "Sign in") +
        para(`<span style="color:${BRAND.soft};font-size:14px">If you didn't request this, you can ignore it. Nothing happens unless the link is opened.</span>`),
    ),
    text: `Sign in to TrueKeeps\n\nOpen this link to sign in (expires in ${expiresMinutes} minutes):\n${url}\n\nIf you didn't request this, ignore this email.`,
  };
}

export function orderConfirmedEmail(params: {
  orderNumber: string;
  title: string;
  totalMinor: number;
  qty: number;
  binding: string;
  finish: string;
  orderUrl: string;
  /** sandbox payment — say so plainly so nobody expects a book */
  testMode: boolean;
}) {
  const { orderNumber, title, totalMinor, qty, binding, finish, orderUrl, testMode } = params;
  const total = formatPKR(totalMinor);
  const bindingName = binding.charAt(0).toUpperCase() + binding.slice(1);
  const details = `${qty} × ${bindingName}, 12×12 in, ${finishName(finish).toLowerCase()} finish`;
  const testNote = testMode
    ? para(`<b style="color:${BRAND.roseText}">Test order.</b> This was paid in Safepay's sandbox, so no money moved and nothing will be printed.`)
    : "";
  return {
    subject: `${testMode ? "[TEST] " : ""}Order ${orderNumber} confirmed: ${title}`,
    html: shell(
      "Thank you, your order is confirmed",
      testNote +
        para(`We've received your payment of <b>${total}</b> for <b>${escapeHtml(title)}</b> (${details}).`) +
        para(`Your order number is <b>${orderNumber}</b>. We'll email you again when your book ships.`) +
        button(orderUrl, "View your order"),
    ),
    text:
      (testMode ? "TEST ORDER: paid in Safepay's sandbox, so nothing will be printed.\n\n" : "") +
      `Thank you, your order is confirmed.\n\nOrder ${orderNumber}\n${title}: ${details}\nPaid: ${total}\n\nWe'll email you when it ships.\nView your order: ${orderUrl}`,
  };
}

/**
 * "Your order is received, make the payment to confirm it": a bank transfer
 * order's instructions, so the customer has them after closing the page.
 */
export function bankTransferEmail(params: {
  orderNumber: string;
  title: string;
  totalMinor: number;
  orderUrl: string;
  bank: { bankName: string; accountTitle: string; accountNumber: string; iban: string };
  whatsappDisplay: string;
  whatsappUrl: string;
  holdDays: number;
}) {
  const { orderNumber, title, totalMinor, orderUrl, bank, whatsappDisplay, whatsappUrl, holdDays } = params;
  const total = formatPKR(totalMinor);
  const rows: Array<[string, string]> = [
    ["Bank", bank.bankName],
    ["Account title", bank.accountTitle],
    ["Account number", bank.accountNumber],
    ["IBAN", bank.iban],
    ["Amount", total],
    ["Reference", orderNumber],
  ];
  const table = rows.map(([k, v]) => `<b>${k}:</b> ${escapeHtml(v)}`).join("<br>");
  return {
    subject: `Order ${orderNumber} received: make the payment to confirm it`,
    html: shell(
      "Your order is received",
      para(`Make the payment to confirm it. We start printing <b>${escapeHtml(title)}</b> once it is in.`) +
        para(`<b>1. Transfer ${total}</b> from your bank app:`) +
        `<tr><td style="font-size:15px;line-height:24px;padding:12px 16px;background:${BRAND.paper};border-radius:10px">${table}</td></tr>` +
        para(`<b>2. Send us the payment screenshot</b> on WhatsApp at <b>${whatsappDisplay}</b>, with your order number ${orderNumber}.`) +
        button(whatsappUrl, "Send screenshot on WhatsApp") +
        para(`3. We check it and email you when your order is confirmed. We hold your order for ${holdDays} days.`) +
        para(`<a href="${orderUrl}" style="color:${BRAND.indigo}">View your order</a>`),
    ),
    text:
      `Your order is received. Make the payment to confirm it.\n\n` +
      `1. Transfer ${total}:\n` +
      rows.map(([k, v]) => `${k}: ${v}`).join("\n") +
      `\n\n2. Send the payment screenshot on WhatsApp to ${whatsappDisplay} with your order number ${orderNumber}.\n` +
      `3. We check it and email you when your order is confirmed. We hold your order for ${holdDays} days.\n\nView your order: ${orderUrl}`,
  };
}

/**
 * New-review alert for the team (ADMIN_EMAILS). Everything the customer
 * typed is escaped: this mail renders their words, so they must never become
 * markup. Line breaks are kept so longer messages stay readable.
 */
export function feedbackReceivedEmail(params: {
  topic: string;
  rating: string | null;
  message: string;
  name: string | null;
  contact: string | null;
  orderNumber: string | null;
  adminUrl: string;
}) {
  const { topic, rating, message, name, contact, orderNumber, adminUrl } = params;
  const rows: Array<[string, string | null]> = [
    ["About", topic],
    ["How it went", rating],
    ["From", name],
    ["Reply to", contact],
    ["Order", orderNumber],
  ];
  const facts = rows
    .filter(([, v]) => v)
    .map(([k, v]) => `<b>${k}:</b> ${escapeHtml(v!)}`)
    .join("<br>");
  const body = escapeHtml(message).replace(/\n/g, "<br>");
  return {
    subject: `New review: ${topic}${rating ? ` (${rating})` : ""}`,
    html: shell(
      "New review",
      para(facts) +
        `<tr><td style="font-size:16px;line-height:26px;padding:14px 16px;margin-top:8px;background:${BRAND.paper};border-radius:10px">${body}</td></tr>` +
        button(adminUrl, "Open reviews"),
    ),
    text:
      `New review\n\n` +
      rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n") +
      `\n\n${message}\n\nOpen reviews: ${adminUrl}`,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
