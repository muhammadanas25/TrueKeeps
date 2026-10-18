/**
 * Payment provider selection + the dev-only fake gateway.
 *
 *  - Safepay keys configured  → SafepayProvider (sandbox or live per
 *    SAFE_PAY_API_URL; `livemode` follows)
 *  - no keys, not production  → FakeProvider: a local "checkout" page with
 *    Pay / Fail buttons, so the whole order flow is testable offline
 *  - no keys, production      → null: checkout is disabled (503) rather
 *    than silently using a fake gateway with real customers
 */

import { randomUUID } from "crypto";
import { config } from "../config";
import { log } from "../logger";
import type { PaymentProvider, PaymentStatus } from "./provider";
import { SafepayProvider } from "./safepay";

interface FakeSession {
  orderNumber: string;
  amountMinor: number;
  paid: boolean;
}

/** In-memory stand-in for a gateway. Never constructed in production. */
export class FakeProvider implements PaymentProvider {
  readonly name = "fake" as const;
  readonly livemode = false;
  readonly sessions = new Map<string, FakeSession>();

  async createSession({ orderNumber, amountMinor }: { orderNumber: string; amountMinor: number }) {
    const providerRef = "fake_" + randomUUID();
    this.sessions.set(providerRef, { orderNumber, amountMinor, paid: false });
    return { providerRef };
  }

  async checkoutUrl(providerRef: string, { redirectUrl, cancelUrl }: { redirectUrl: string; cancelUrl: string }) {
    const q = new URLSearchParams({ ref: providerRef, redirect: redirectUrl, cancel: cancelUrl });
    return `${config.appUrl}/api/payments/fake/checkout?${q}`;
  }

  async fetchStatus(providerRef: string): Promise<PaymentStatus> {
    const s = this.sessions.get(providerRef);
    if (!s) return { found: false, paid: false, state: null, amountMinor: null, currency: null, orderNumber: null };
    return {
      found: true,
      paid: s.paid,
      state: s.paid ? "TRACKER_ENDED" : "TRACKER_STARTED",
      amountMinor: s.amountMinor,
      currency: "PKR",
      orderNumber: s.orderNumber,
    };
  }

  verifyWebhook() {
    return false; // the fake gateway never sends webhooks
  }
}

function select(): PaymentProvider | null {
  if (config.safepay) {
    log.info({ env: config.safepay.environment }, "[payments] using Safepay");
    return new SafepayProvider(config.safepay);
  }
  if (config.isProd) {
    log.warn("[payments] Safepay not configured — checkout is DISABLED in production");
    return null;
  }
  log.info("[payments] no Safepay keys — using the local fake gateway (dev only)");
  return new FakeProvider();
}

export const paymentProvider: PaymentProvider | null = select();
