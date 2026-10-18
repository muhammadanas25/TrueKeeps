/**
 * Email templates — plain functions returning {subject, html, text}.
 *
 * Deliberately no template engine: the messages are short, brand
 * styling is inline (email clients strip <style>), and a function per
 * message keeps every variable explicit and type-checked. Colours are
 * the TrueKeep brand tokens (cobalt #1D46A0, gunmetal #3C3C3B, beige
 * #EBEBD3). No emoji (brand rule).
 */

import { formatPKR } from "@shared/pricing";

const BRAND = {
  cobalt: "#1D46A0",
  gunmetal: "#3C3C3B",
  beige: "#EBEBD3",
  muted: "#6b6b6a",
};

function shell(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:${BRAND.beige};font-family:Archivo,Helvetica,Arial,sans-serif;color:${BRAND.gunmetal}">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BRAND.beige};padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fff;border-radius:16px;padding:36px 32px">
<tr><td style="font-size:22px;font-weight:700;letter-spacing:-0.2px;padding-bottom:8px">True<span style="color:${BRAND.cobalt}">Keep</span></td></tr>
<tr><td style="font-size:20px;font-weight:600;padding:12px 0 6px">${title}</td></tr>
${bodyHtml}
<tr><td style="font-size:12px;color:${BRAND.muted};padding-top:28px;border-top:1px solid #eee">Beautiful quality, for beautiful moments. · thetruekeeps.com</td></tr>
</table></td></tr></table></body></html>`;
}

function button(href: string, label: string): string {
  return `<tr><td style="padding:18px 0"><a href="${href}" style="display:inline-block;background:${BRAND.cobalt};color:#fff;text-decoration:none;font-weight:600;padding:14px 22px;border-radius:10px">${label}</a></td></tr>`;
}

function para(text: string): string {
  return `<tr><td style="font-size:15px;line-height:1.55;padding:4px 0">${text}</td></tr>`;
}

export function magicLinkEmail(params: { url: string; expiresMinutes: number }) {
  const { url, expiresMinutes } = params;
  return {
    subject: "Your TrueKeep sign-in link",
    html: shell(
      "Sign in to TrueKeep",
      para("Tap the button below to sign in. This link works once and expires in " + expiresMinutes + " minutes.") +
        button(url, "Sign in") +
        para(`<span style="color:${BRAND.muted};font-size:13px">If you didn't request this, you can ignore it — nothing happens unless the link is opened.</span>`),
    ),
    text: `Sign in to TrueKeep\n\nOpen this link to sign in (expires in ${expiresMinutes} minutes):\n${url}\n\nIf you didn't request this, ignore this email.`,
  };
}

export function orderConfirmedEmail(params: {
  orderNumber: string;
  title: string;
  totalMinor: number;
  qty: number;
  binding: string;
  orderUrl: string;
  /** sandbox payment — say so plainly so nobody expects a book */
  testMode: boolean;
}) {
  const { orderNumber, title, totalMinor, qty, binding, orderUrl, testMode } = params;
  const total = formatPKR(totalMinor);
  const bindingName = binding.charAt(0).toUpperCase() + binding.slice(1);
  const testNote = testMode
    ? para(`<b style="color:#DB3069">Test order.</b> This was paid in Safepay's sandbox, so no money moved and nothing will be printed.`)
    : "";
  return {
    subject: `${testMode ? "[TEST] " : ""}Order ${orderNumber} confirmed — ${title}`,
    html: shell(
      "Thank you — your order is confirmed",
      testNote +
        para(`We've received your payment of <b>${total}</b> for <b>${escapeHtml(title)}</b> (${qty} × ${bindingName}).`) +
        para(`Your order number is <b>${orderNumber}</b>. We'll email you again when your book ships.`) +
        button(orderUrl, "View your order"),
    ),
    text:
      (testMode ? "TEST ORDER — paid in Safepay's sandbox; nothing will be printed.\n\n" : "") +
      `Thank you — your order is confirmed.\n\nOrder ${orderNumber}\n${title} — ${qty} × ${bindingName}\nPaid: ${total}\n\nWe'll email you when it ships.\nView your order: ${orderUrl}`,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
