/**
 * BankTransferSteps — "make the payment to confirm it", on the order page of
 * a bank transfer order (owner-approved design, canvas Round 3, 2026-11-21).
 *
 * What: three steps. 1, the account to transfer the total to, each detail
 * with a Copy button and the order number as the reference; 2, a button that
 * opens WhatsApp with "Payment for order TK-…" already typed, for the
 * screenshot; 3, what happens next. The same details go out by email when the
 * order is placed (server/email/templates.ts bankTransferEmail).
 *
 * The account and number live in shared/payments.ts, so this page, the email
 * and the checkout can't disagree.
 */

import { useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { formatPKR } from "@shared/pricing";
import { BANK_DETAILS, SUPPORT_WHATSAPP, whatsappLink } from "@shared/payments";

export function BankTransferSteps({ orderNumber, totalMinor }: { orderNumber: string; totalMinor: number }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied((c) => (c === label ? null : c)), 2000);
    } catch {
      /* no clipboard (old browser, http): the text is on screen to type */
    }
  };
  const rows: Array<[string, string]> = [
    ["Bank", BANK_DETAILS.bankName],
    ["Account title", BANK_DETAILS.accountTitle],
    ["Account number", BANK_DETAILS.accountNumber],
    ["IBAN", BANK_DETAILS.iban],
  ];

  return (
    <div className="bt-steps">
      <section className="bt-step">
        <div className="bt-step-head">
          <b>1. Transfer the total</b>
          <b className="bt-amount">{formatPKR(totalMinor)}</b>
        </div>
        <dl className="bt-rows">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
              <button type="button" className="bt-copy" onClick={() => copy(k, v)} aria-label={`Copy ${k}`}>
                {copied === k ? <Check size={14} /> : <Copy size={14} />} {copied === k ? "Copied" : "Copy"}
              </button>
            </div>
          ))}
        </dl>
        <p className="bt-small">
          Put <b>{orderNumber}</b> in the transfer's note or reference, so we can match it to your order.
        </p>
      </section>

      <section className="bt-step">
        <b>2. Send us the screenshot</b>
        <p>
          Send the payment screenshot on WhatsApp to <b>{SUPPORT_WHATSAPP.display}</b>, with your order number.
        </p>
        <a className="bb-btn bb-btn-primary bt-wa" href={whatsappLink(`Payment for order ${orderNumber}`)} target="_blank" rel="noopener noreferrer">
          <MessageCircle size={17} /> Send screenshot on WhatsApp
        </a>
        <p className="bt-small">Opens WhatsApp with "Payment for order {orderNumber}" already typed. Attach the screenshot and send.</p>
      </section>

      <p className="bt-next">
        <b>3.</b> We check the payment and email you when your order is confirmed. Your book and these details are saved under My orders.
      </p>
    </div>
  );
}
