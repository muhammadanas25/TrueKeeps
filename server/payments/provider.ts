/**
 * PaymentProvider — the seam between orders and whichever gateway is live.
 *
 * Orders code only ever calls these four methods, so swapping Safepay for
 * another gateway (or adding one beside it) is a new file here, not a
 * change to checkout logic. See docs/adr/005 for why Safepay.
 *
 * The contract that matters for money safety:
 *  - `fetchStatus` asks the GATEWAY what happened. It is the only thing
 *    that may mark an order paid. Browser redirects carry no signature
 *    (verified against Safepay's sandbox) and webhooks can be lost, so
 *    both merely TRIGGER a status fetch.
 *  - `verifyWebhook` authenticates the webhook before we even trigger
 *    that fetch, so a forged webhook can't make us hammer the gateway.
 */

export interface PaymentStatus {
  /** gateway knows this session */
  found: boolean;
  /** money captured */
  paid: boolean;
  /** raw gateway state, e.g. TRACKER_STARTED / TRACKER_ENDED */
  state: string | null;
  /** captured (or quoted) amount in paisa */
  amountMinor: number | null;
  currency: string | null;
  /** our order number as the gateway recorded it (metadata) */
  orderNumber: string | null;
}

export interface PaymentProvider {
  readonly name: "safepay" | "fake";
  /** false for sandbox/test — orders made through it must never ship */
  readonly livemode: boolean;
  /** Open a payment session for an exact amount; returns the gateway's id. */
  createSession(input: { orderNumber: string; amountMinor: number; currency: "PKR" }): Promise<{ providerRef: string }>;
  /** A fresh hosted-checkout URL for an existing session (tokens are short-lived). */
  checkoutUrl(providerRef: string, urls: { redirectUrl: string; cancelUrl: string }): Promise<string>;
  fetchStatus(providerRef: string): Promise<PaymentStatus>;
  /** Authenticate a webhook from its raw bytes + headers. */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean;
}

export class PaymentProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "PaymentProviderError";
  }
}
