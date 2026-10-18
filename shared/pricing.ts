/**
 * Price list + quote math — the ONE place prices live.
 *
 * What: PKR prices per binding, shipping rule, and `quote()` which turns
 * (binding, qty) into subtotal / shipping / total.
 *
 * Why shared: the client renders exactly these numbers and the server
 * recomputes them when an order is created. The server NEVER trusts a
 * total sent by the browser — it re-quotes from this file and freezes the
 * result (plus `PRICE_LIST.version`) onto the order. Changing a price is
 * a one-line edit here and a deploy; old orders keep the price they were
 * placed at.
 *
 * Money is integer PAISA (1 rupee = 100 paisa) everywhere — no floats.
 * Safepay v3 also takes amounts in paisa, so the order total goes to the
 * gateway as-is. Format for display with `formatPKR()`.
 *
 * NOTE: the rupee values below are launch PLACEHOLDERS chosen 2026-10-18
 * pending the owner's confirmation — see docs/adr/005.
 */

export const CURRENCY = "PKR" as const;

export type BindingId = "softcover" | "hardcover" | "layflat";

export interface BindingPrice {
  id: BindingId;
  name: string;
  /** price per copy, in paisa */
  unitMinor: number;
}

export const PRICE_LIST = {
  /** bump whenever any number below changes; stored on every order */
  version: "pkr-2026-10-18",
  bindings: [
    { id: "softcover", name: "Softcover", unitMinor: 4_499_00 },
    { id: "hardcover", name: "Hardcover", unitMinor: 6_499_00 },
    { id: "layflat", name: "Layflat", unitMinor: 9_499_00 },
  ] as BindingPrice[],
  /** flat nationwide courier fee, in paisa */
  shippingMinor: 299_00,
  /** subtotal at or above which shipping is free, in paisa */
  freeShippingFromMinor: 10_000_00,
  maxQty: 20,
} as const;

export const BINDING_IDS = PRICE_LIST.bindings.map((b) => b.id) as [BindingId, ...BindingId[]];

export interface Quote {
  currency: typeof CURRENCY;
  binding: BindingId;
  qty: number;
  unitMinor: number;
  subtotalMinor: number;
  shippingMinor: number;
  totalMinor: number;
  freeShipping: boolean;
  priceListVersion: string;
}

/** Look up a binding; unknown ids fall back to hardcover (the default). */
export function bindingPrice(id: string): BindingPrice {
  return PRICE_LIST.bindings.find((b) => b.id === id) ?? PRICE_LIST.bindings[1];
}

/**
 * Price a book order.
 *  1. unit price from the binding
 *  2. qty clamped to 1..maxQty (the UI clamps too; this is the guard)
 *  3. shipping is free once the subtotal reaches the threshold
 */
export function quote(input: { binding: string; qty: number }): Quote {
  const b = bindingPrice(input.binding);
  const qty = Math.min(PRICE_LIST.maxQty, Math.max(1, Math.floor(input.qty || 1)));
  const subtotalMinor = b.unitMinor * qty;
  const freeShipping = subtotalMinor >= PRICE_LIST.freeShippingFromMinor;
  const shippingMinor = freeShipping ? 0 : PRICE_LIST.shippingMinor;
  return {
    currency: CURRENCY,
    binding: b.id,
    qty,
    unitMinor: b.unitMinor,
    subtotalMinor,
    shippingMinor,
    totalMinor: subtotalMinor + shippingMinor,
    freeShipping,
    priceListVersion: PRICE_LIST.version,
  };
}

/** 449900 → "Rs 4,499" (whole rupees shown without ".00"). */
export function formatPKR(minor: number): string {
  const rupees = minor / 100;
  const whole = Number.isInteger(rupees);
  return (
    "Rs " +
    rupees.toLocaleString("en-PK", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })
  );
}

/** Cheapest unit price — for "from Rs …" marketing copy. */
export const STARTING_PRICE_MINOR = Math.min(...PRICE_LIST.bindings.map((b) => b.unitMinor));
