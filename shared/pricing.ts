/**
 * Price list + quote math — the ONE place prices live.
 *
 * What: the PKR book price, the extra-sheet rate, the remote-area delivery
 * charge, and `quote()`, which turns (binding, qty, printed pages, address)
 * into unit price / subtotal / delivery / total.
 *
 * Why shared: the client renders exactly these numbers and the server
 * recomputes them when an order is created. The server NEVER trusts a
 * total sent by the browser — it re-quotes from this file (using the page
 * count of the saved book and the submitted address) and freezes the result
 * (plus `PRICE_LIST.version`) onto the order. Changing a price is an edit
 * here and a deploy; old orders keep the price they were placed at.
 *
 * The pricing model (owner, 2026-11-11; docs/adr/012):
 *  - every binding costs the same: Rs 5,690 a book
 *  - that includes 5 sheets inside the book (the cover is not a sheet); one sheet is two pages
 *  - each sheet beyond that is Rs 550 (charged per sheet, never per page)
 *  - shipping is free, except Rs 500 for Gilgit-Baltistan, Azad Jammu and
 *    Kashmir, and Balochistan outside Quetta
 *
 * Money is integer PAISA (1 rupee = 100 paisa) everywhere — no floats.
 * Safepay v3 also takes amounts in paisa, so the order total goes to the
 * gateway as-is. Format for display with `formatPKR()`.
 */

export const CURRENCY = "PKR" as const;

export type BindingId = "softcover" | "hardcover" | "layflat";

export interface BindingOption {
  id: BindingId;
  name: string;
  /** what the binding is, for the picker (all bindings cost the same) */
  blurb: string;
}

export const PRICE_LIST = {
  /** bump whenever any number below changes; stored on every order */
  version: "pkr-2026-11-11",
  /** price of one book in any binding, in paisa; includes `includedSheets` */
  bookMinor: 5_690_00,
  /** sheets inside the book that the book price covers */
  includedSheets: 5,
  /** each sheet beyond `includedSheets`, per copy, in paisa */
  extraSheetMinor: 550_00,
  /** delivery charge for remote areas (see isRemoteArea), once per order, in paisa */
  remoteDeliveryMinor: 500_00,
  bindings: [
    { id: "softcover", name: "Softcover", blurb: "Flexible cover" },
    { id: "hardcover", name: "Hardcover", blurb: "Rigid board cover" },
    { id: "layflat", name: "Layflat", blurb: "Opens fully flat" },
  ] as BindingOption[],
  maxQty: 20,
} as const;

export const BINDING_IDS = PRICE_LIST.bindings.map((b) => b.id) as [BindingId, ...BindingId[]];

/** Pages one sheet carries (front and back). */
export const PAGES_PER_SHEET = 2;

/** Pages the book price covers (5 sheets → 10 pages), for copy. */
export const INCLUDED_PAGES = PRICE_LIST.includedSheets * PAGES_PER_SHEET;

/* ── Paper finish ───────────────────────────────────────────────
   A printing instruction, not a price: both finishes cost the same, so it
   stays out of quote() and PRICE_LIST. Matte is the default because every
   order placed before this choice existed was printed on matte. */

export type FinishId = "matte" | "glossy";

export const FINISHES: Array<{ id: FinishId; name: string; blurb: string }> = [
  { id: "matte", name: "Matte", blurb: "Soft, no glare" },
  { id: "glossy", name: "Glossy", blurb: "Bright, with a shine" },
];

export const FINISH_IDS = FINISHES.map((f) => f.id) as [FinishId, ...FinishId[]];
export const DEFAULT_FINISH: FinishId = "matte";

/** Display name for a stored finish; unknown values read as the default. */
export const finishName = (id: string | null | undefined): string =>
  (FINISHES.find((f) => f.id === id) ?? FINISHES[0]).name;

/* ── Pages and sheets ───────────────────────────────────────── */

/**
 * Pages that count toward the price: every page inside the book. The cover
 * is not in `pages` at all; books made before 2026-11-11 also have a
 * words-only title page, which is not charged. Works on both the builder's
 * pages and a saved BuilderDocument's pages.
 */
export function printedPageCount(pages: ReadonlyArray<{ layout: string }>): number {
  return pages.filter((p) => p.layout !== "title").length;
}

/** Sheets needed for `printedPages`; a part-filled sheet is still a sheet. */
export const sheetsFor = (printedPages: number): number => Math.ceil(Math.max(0, printedPages) / PAGES_PER_SHEET);

/* ── Delivery ───────────────────────────────────────────────── */

/**
 * Remote areas pay Rs 500 for delivery: all of Gilgit-Baltistan and Azad
 * Jammu and Kashmir, and Balochistan except Quetta. Province names match
 * PK_PROVINCES in shared/orders.ts. The address form only has a free-text
 * city, so "Quetta" is matched as a word ("Quetta Cantt" counts as Quetta).
 * No address yet means no charge shown yet.
 */
export function isRemoteArea(address?: { province?: string | null; city?: string | null } | null): boolean {
  switch (address?.province) {
    case "Gilgit-Baltistan":
    case "Azad Jammu and Kashmir":
      return true;
    case "Balochistan":
      return !/\bquetta\b/i.test(address.city ?? "");
    default:
      return false;
  }
}

/* ── Quote ──────────────────────────────────────────────────── */

export interface Quote {
  currency: typeof CURRENCY;
  binding: BindingId;
  qty: number;
  /** pages inside the book (an older book's title page is not counted) */
  printedPages: number;
  sheets: number;
  /** sheets beyond the included ones, charged per copy */
  extraSheets: number;
  /** price of one copy, extra sheets included */
  unitMinor: number;
  subtotalMinor: number;
  remoteArea: boolean;
  /** delivery charge (0, or the remote-area charge) */
  shippingMinor: number;
  totalMinor: number;
  freeShipping: boolean;
  priceListVersion: string;
}

/** Look up a binding; unknown ids fall back to hardcover (the default). */
export function bindingById(id: string): BindingOption {
  return PRICE_LIST.bindings.find((b) => b.id === id) ?? PRICE_LIST.bindings[1];
}

/**
 * Price a book order.
 *  1. sheets = printed pages ÷ 2, rounded up; extras = sheets beyond the
 *     included 5
 *  2. one copy = book price + extras × sheet price (same for every binding)
 *  3. qty clamped to 1..maxQty (the UI clamps too; this is the guard)
 *  4. delivery is free, except the remote-area charge, once per order
 */
export function quote(input: {
  binding: string;
  qty: number;
  printedPages: number;
  address?: { province?: string | null; city?: string | null } | null;
}): Quote {
  const b = bindingById(input.binding);
  const qty = Math.min(PRICE_LIST.maxQty, Math.max(1, Math.floor(input.qty || 1)));
  const printedPages = Math.max(0, Math.floor(input.printedPages || 0));
  const sheets = sheetsFor(printedPages);
  const extraSheets = Math.max(0, sheets - PRICE_LIST.includedSheets);
  const unitMinor = PRICE_LIST.bookMinor + extraSheets * PRICE_LIST.extraSheetMinor;
  const subtotalMinor = unitMinor * qty;
  const remoteArea = isRemoteArea(input.address);
  const shippingMinor = remoteArea ? PRICE_LIST.remoteDeliveryMinor : 0;
  return {
    currency: CURRENCY,
    binding: b.id,
    qty,
    printedPages,
    sheets,
    extraSheets,
    unitMinor,
    subtotalMinor,
    remoteArea,
    shippingMinor,
    totalMinor: subtotalMinor + shippingMinor,
    freeShipping: shippingMinor === 0,
    priceListVersion: PRICE_LIST.version,
  };
}

/** 569000 → "Rs 5,690" (whole rupees shown without ".00"). */
export function formatPKR(minor: number): string {
  const rupees = minor / 100;
  const whole = Number.isInteger(rupees);
  return (
    "Rs " +
    rupees.toLocaleString("en-PK", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })
  );
}

/** Lowest price of a book — for "from Rs …" marketing copy. */
export const STARTING_PRICE_MINOR = PRICE_LIST.bookMinor;

/** The remote-area rule in words, for the FAQ, price pages and checkout. */
export const REMOTE_AREAS_TEXT = "Gilgit-Baltistan, Azad Kashmir and Balochistan outside Quetta";
