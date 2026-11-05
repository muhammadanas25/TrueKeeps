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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
