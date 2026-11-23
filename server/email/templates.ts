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
import { SUPPORT_WHATSAPP } from "@shared/payments";

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

/**
 * The frame every email shares (owner, 2026-11-22: "can we make it more
 * professional"): an Indigo band with the white logo and, for order mail, the
 * order number; a white card; a footer with help hours and the policies.
 * Tables, inline styles and a hosted PNG logo, because email clients strip
 * <style> and many won't show SVG. Exported for server/notify/templates.ts.
 */
export function emailFrame(title: string, bodyHtml: string, opts: { reference?: string; preheader?: string } = {}): string {
  const app = config.appUrl;
  const pre = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(opts.preheader)}</div>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:${BRAND.paper};font-family:Figtree,Helvetica,Arial,sans-serif;color:${BRAND.body}">${pre}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BRAND.paper};padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden">
<tr><td style="background:${BRAND.indigo};padding:22px 28px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
<td><img src="${app}/email-logo-white.png" width="140" height="28" alt="truekeeps" style="display:block;border:0"></td>
${opts.reference ? `<td align="right" style="color:#D9D6E2;font-size:13px;font-weight:600">${escapeHtml(opts.reference)}</td>` : ""}
</tr></table></td></tr>
<tr><td style="padding:28px 28px 8px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
<tr><td style="font-size:22px;line-height:30px;font-weight:800;color:${BRAND.indigo};padding:0 0 10px">${title}</td></tr>
${bodyHtml}
</table></td></tr>
<tr><td style="padding:18px 28px 24px;border-top:1px solid ${BRAND.line};font-size:12.5px;line-height:20px;color:${BRAND.soft}">
Help: WhatsApp ${SUPPORT_WHATSAPP.display}, Monday to Friday, 10am to 6pm<br>
<a href="${app}/policies/shipping" style="color:${BRAND.soft}">Shipping</a> · <a href="${app}/policies/refund-and-reprint" style="color:${BRAND.soft}">Refund and reprint</a> · <a href="${app}/policies/cancellation" style="color:${BRAND.soft}">Cancellation</a> · <a href="${app}" style="color:${BRAND.soft}">thetruekeeps.com</a>
</td></tr>
</table></td></tr></table></body></html>`;
}

function shell(title: string, bodyHtml: string, opts: { reference?: string; preheader?: string } = {}): string {
  return emailFrame(title, bodyHtml, opts);
}

/** Label / value rows, value on the right: the order details and bank details. */
function factTable(rows: Array<[string, string]>): string {
  const tr = rows
    .map(
      ([k, v], i) =>
        `<tr><td style="padding:9px 0;font-size:14px;color:${BRAND.soft};${i ? `border-top:1px solid ${BRAND.line};` : ""}">${escapeHtml(k)}</td><td align="right" style="padding:9px 0;font-size:14px;font-weight:700;color:${BRAND.indigo};${i ? `border-top:1px solid ${BRAND.line};` : ""}">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
  return `<tr><td style="padding:6px 0 10px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid ${BRAND.line};border-radius:10px;padding:2px 14px">${tr}</table></td></tr>`;
}

/** A small numbered heading inside an email ("1. Transfer Rs 5,690"). */
function stepHead(text: string): string {
  return `<tr><td style="font-size:16px;line-height:24px;font-weight:800;color:${BRAND.indigo};padding:14px 0 4px">${text}</td></tr>`;
}

/** The delivery promise, the same everywhere (shipping policy). */
const DELIVERY_LINE = "Most books reach you in 4 to 7 working days after your payment is confirmed.";

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
    subject: `${testMode ? "[TEST] " : ""}Order ${orderNumber} confirmed: printing now`,
    html: shell(
      "Thank you. Your book is going to print.",
      testNote +
        para(`We've received your payment of <b>${total}</b>. Here's what you ordered:`) +
        factTable([
          ["Book", title],
          ["Details", details],
          ["Paid", total],
        ]) +
        para(`${DELIVERY_LINE} We'll email you again when it's on its way.`) +
        button(orderUrl, "See your order"),
      { reference: `Order ${orderNumber}`, preheader: `Payment received. ${DELIVERY_LINE}` },
    ),
    text:
      (testMode ? "TEST ORDER: paid in Safepay's sandbox, so nothing will be printed.\n\n" : "") +
      `Thank you. Your book is going to print.\n\nOrder ${orderNumber}\n${title}: ${details}\nPaid: ${total}\n\n${DELIVERY_LINE}\nWe'll email you when it's on its way.\nSee your order: ${orderUrl}`,
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
  return {
    subject: `Order ${orderNumber}: one step left`,
    html: shell(
      "One step left: pay to confirm your book",
      para(`We start printing <b>${escapeHtml(title)}</b> as soon as your payment is in.`) +
        stepHead(`1. Transfer ${total}`) +
        factTable(rows.filter(([k]) => k !== "Amount").map(([k, v]) => [k === "Reference" ? "Put in the reference" : k, v] as [string, string])) +
        stepHead("2. Send us the screenshot") +
        para(`On WhatsApp at <b>${whatsappDisplay}</b>, with your order number ${orderNumber}.`) +
        button(whatsappUrl, "Send on WhatsApp") +
        para(`We confirm it within working hours and print right after. ${DELIVERY_LINE} We hold your order for ${holdDays} days.`) +
        para(`<a href="${orderUrl}" style="color:${BRAND.indigo}">See your order</a>`),
      { reference: `Order ${orderNumber}`, preheader: `Transfer ${total} to confirm your book.` },
    ),
    text:
      `One step left: pay to confirm your book.\n\n` +
      `1. Transfer ${total}:\n` +
      rows.map(([k, v]) => `${k}: ${v}`).join("\n") +
      `\n\n2. Send the payment screenshot on WhatsApp to ${whatsappDisplay} with your order number ${orderNumber}.\n` +
      `We confirm it within working hours and print right after. ${DELIVERY_LINE} We hold your order for ${holdDays} days.\n\nSee your order: ${orderUrl}`,
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
