/**
 * Safepay (v3) implementation of PaymentProvider.
 *
 * Every call below was exercised against the Safepay sandbox on
 * 2026-10-18 before this file was written (create → metadata → token →
 * hosted checkout → paid → reporter shows TRACKER_ENDED with the exact
 * amount and our order number). The flow:
 *
 *   1. POST /order/payments/v3/                     create tracker (amount in PAISA)
 *   2. POST /order/payments/v3/{tracker}/metadata   attach our order number
 *   3. POST /client/passport/v1/token               short-lived checkout token ("tbt")
 *   4. browser → {checkoutBase}?tracker&tbt&…       Safepay-hosted payment page
 *   5. browser ← redirect_url?tracker=…             NO signature → never trusted
 *   6. GET /reporter/api/v1/payments/{tracker}      source of truth: state + amount
 *
 * Why v3 and not the legacy `/order/v1/init` + `/checkout` the SDK uses:
 * legacy trackers are invisible to the reporter API (it answers "cannot
 * find tracker" even after payment), which would leave webhooks as the
 * only proof of payment. v3 trackers can always be re-checked.
 *
 * Auth: server-to-server calls send the merchant SECRET key in
 * `X-SFPY-MERCHANT-SECRET`; the tracker is bound to our public API key
 * via `merchant_api_key`. No SDK dependency — four fetch calls.
 *
 * Webhooks: HMAC-SHA512 hex of the payload with the endpoint's shared
 * secret, in `X-SFPY-SIGNATURE`. Safepay's docs disagree on which bytes
 * are signed (the SDK hashes JSON.stringify(body.data), the docs example
 * the whole payload), so we accept a match on any of the three forms —
 * each still requires the secret, so this widens nothing for an attacker.
 */

import crypto from "crypto";
import type { PaymentProvider, PaymentStatus } from "./provider";
import { PaymentProviderError } from "./provider";

export interface SafepayConfig {
  apiKey: string;
  v1Secret: string;
  webhookSecret: string;
  baseUrl: string;
  environment: "sandbox" | "production";
  checkoutBase: string;
}

const TIMEOUT_MS = 12_000;

export class SafepayProvider implements PaymentProvider {
  readonly name = "safepay" as const;
  readonly livemode: boolean;

  constructor(private readonly cfg: SafepayConfig) {
    this.livemode = cfg.environment === "production";
  }

  private async call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const res = await fetch(this.cfg.baseUrl + path, {
      method,
      headers: {
        "X-SFPY-MERCHANT-SECRET": this.cfg.v1Secret,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* non-JSON error page */
    }
    if (!res.ok) {
      // never include secrets; message/code are Safepay's own
      throw new PaymentProviderError(`safepay ${method} ${path.split("/").slice(0, 4).join("/")} → ${res.status}: ${json?.message ?? text.slice(0, 120)}`, res.status);
    }
    return json as T;
  }

  async createSession({ orderNumber, amountMinor, currency }: { orderNumber: string; amountMinor: number; currency: "PKR" }) {
    const created = await this.call<{ data: { tracker: { token: string } } }>("POST", "/order/payments/v3/", {
      merchant_api_key: this.cfg.apiKey,
      intent: "CYBERSOURCE",
      mode: "payment",
      currency,
      amount: amountMinor,
    });
    const providerRef = created?.data?.tracker?.token;
    if (!providerRef) throw new PaymentProviderError("safepay: no tracker token in create response");
    // Order number on the gateway side: shows in Safepay's dashboard and
    // lets fetchStatus cross-check the tracker belongs to this order.
    await this.call("POST", `/order/payments/v3/${encodeURIComponent(providerRef)}/metadata`, {
      data: { source: "truekeep", order_id: orderNumber },
    });
    return { providerRef };
  }

  async checkoutUrl(providerRef: string, { redirectUrl, cancelUrl }: { redirectUrl: string; cancelUrl: string }) {
    const tok = await this.call<{ data: string }>("POST", "/client/passport/v1/token");
    if (typeof tok?.data !== "string") throw new PaymentProviderError("safepay: no checkout token");
    const q = new URLSearchParams({
      environment: this.cfg.environment,
      tracker: providerRef,
      tbt: tok.data,
      source: "hosted",
      redirect_url: redirectUrl,
      cancel_url: cancelUrl,
    });
    return `${this.cfg.checkoutBase}?${q.toString()}`;
  }

  async fetchStatus(providerRef: string): Promise<PaymentStatus> {
    let json: any;
    try {
      json = await this.call("GET", `/reporter/api/v1/payments/${encodeURIComponent(providerRef)}`);
    } catch (err) {
      // The reporter answers 500 "cannot find tracker" for unknown tokens.
      if (err instanceof PaymentProviderError && /cannot find tracker/i.test(err.message)) {
        return { found: false, paid: false, state: null, amountMinor: null, currency: null, orderNumber: null };
      }
      throw err;
    }
    const d = json?.data ?? {};
    const charge = d.charge?.amount ?? null;
    const quoteAmt = d.purchase_totals?.quote_amount ?? null;
    const state: string | null = d.state ?? null;
    return {
      found: true,
      // TRACKER_ENDED = captured. Belt and braces: require a charge object.
      paid: state === "TRACKER_ENDED" && Boolean(d.charge),
      state,
      amountMinor: (charge?.amount ?? quoteAmt?.amount ?? null) as number | null,
      currency: (charge?.currency ?? quoteAmt?.currency ?? null) as string | null,
      orderNumber: d.metadata?.order_id?.value ?? null,
    };
  }

  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean {
    const raw = headers["x-sfpy-signature"];
    const sig = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase();
    if (!sig || !/^[0-9a-f]{128}$/.test(sig)) return false;
    const candidates: Buffer[] = [rawBody];
    try {
      const parsed = JSON.parse(rawBody.toString("utf8"));
      candidates.push(Buffer.from(JSON.stringify(parsed)));
      if (parsed && typeof parsed === "object" && "data" in parsed) candidates.push(Buffer.from(JSON.stringify(parsed.data)));
    } catch {
      return false;
    }
    const given = Buffer.from(sig, "hex");
    return candidates.some((bytes) => {
      const expected = crypto.createHmac("sha512", this.cfg.webhookSecret).update(bytes).digest();
      return expected.length === given.length && crypto.timingSafeEqual(expected, given);
    });
  }
}
