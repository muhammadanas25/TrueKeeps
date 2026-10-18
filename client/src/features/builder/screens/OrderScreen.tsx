/**
 * OrderScreen + ConfirmScreen — the checkout beat.
 *
 * Ported from `book_builder/screens3.jsx`; Phase 2B makes it real:
 *  - prices are PKR from shared/pricing.ts (the server re-quotes the same
 *    file, so what's shown is what's charged)
 *  - a delivery address (Pakistani mobile + province validated with the
 *    same zod schema the server uses)
 *  - "Pay" creates the order on the server and hands the browser to
 *    Safepay's hosted page; Safepay sends the customer back to
 *    /orders/:id, which confirms the payment with the gateway
 *
 * The signed-in requirement is enforced by the builder shell (hard gate
 * on this screen) and again by the API.
 *
 * Double-submit safety: each attempt carries an idempotency key derived
 * from (mount nonce + what's being bought), so a double click returns the
 * same order, while changing the quantity or address makes a new one.
 */

import { useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen, Check, Lock, Minus, Plus, ShieldCheck, Truck } from "lucide-react";
import { MiniBook } from "../book";
import { BINDINGS, occasionById, type CopyVoice } from "../data";
import { bookTheme } from "../palette";
import { lowQualityPageCount } from "../print";
import { toDocument } from "../sync";
import type { BuilderState } from "../state";
import { formatPKR, PRICE_LIST, quote } from "@shared/pricing";
import { PK_PROVINCES, shippingAddressSchema, type ShippingAddress } from "@shared/orders";
import { useSession } from "@/features/auth/useSession";

interface PricingResponse {
  checkout: { enabled: boolean; livemode: boolean; provider: string | null };
}

const ADDRESS_KEY = "tk_ship_addr_v1";
type AddressForm = Omit<ShippingAddress, "province"> & { province: string };
const EMPTY_ADDRESS: AddressForm = { fullName: "", phone: "", line1: "", line2: "", city: "", province: "", postalCode: "" };

function loadAddress(): AddressForm | null {
  try {
    const raw = localStorage.getItem(ADDRESS_KEY);
    return raw ? { ...EMPTY_ADDRESS, ...(JSON.parse(raw) as Partial<AddressForm>) } : null;
  } catch {
    return null;
  }
}

/** Small stable string hash (djb2) — only used to fingerprint a checkout attempt. */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function OrderScreen({
  state,
  set,
  copy,
  onBack,
}: {
  state: BuilderState;
  set: (patch: Partial<BuilderState>) => void;
  copy: CopyVoice;
  onBack: () => void;
}) {
  const { user } = useSession();
  const occ = occasionById(state.occasion);
  const theme = bookTheme(state.themeId, state.pageColor);
  const q = quote({ binding: state.binding, qty: state.qty });
  // Last honest chance to mention print quality before money changes
  // hands. Silent at zero — nobody needs a green tick telling them
  // nothing is wrong.
  const softPages = lowQualityPageCount(state.pages, state.photos);

  const pricing = useQuery<PricingResponse>({ queryKey: ["/api/pricing"], staleTime: 5 * 60_000 });
  const checkout = pricing.data?.checkout;

  const [addr, setAddr] = useState<AddressForm>(
    () => loadAddress() ?? { ...EMPTY_ADDRESS, fullName: user?.name ?? "", phone: user?.phone ?? "" },
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nonce = useRef(Math.random().toString(36).slice(2));

  const field = (k: keyof AddressForm) => ({
    value: addr[k] ?? "",
    onChange: (e: { target: { value: string } }) => {
      setAddr((a) => ({ ...a, [k]: e.target.value }));
      if (fieldErrors[k]) setFieldErrors((fe) => ({ ...fe, [k]: "" }));
    },
    "aria-invalid": Boolean(fieldErrors[k]) || undefined,
  });

  const idempotencyKey = useMemo(
    () => `${nonce.current}-${hash(JSON.stringify([state.projectId, q.binding, q.qty, addr]))}`,
    [state.projectId, q.binding, q.qty, addr],
  );

  const onPay = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = shippingAddressSchema.safeParse(addr);
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const issue of parsed.error.issues) fe[String(issue.path[0])] ||= issue.message;
      if (!addr.province) fe.province = "Choose a province";
      setFieldErrors(fe);
      return;
    }
    if (!state.projectId) {
      setError("This book hasn't been saved to your account yet. Go back one step and try again.");
      return;
    }
    setBusy(true);
    try {
      localStorage.setItem(ADDRESS_KEY, JSON.stringify(parsed.data));
    } catch {
      /* private mode — fine */
    }
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: state.projectId,
          binding: q.binding,
          qty: q.qty,
          address: parsed.data,
          document: toDocument(state),
          idempotencyKey,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { checkoutUrl?: string; error?: string; fields?: Record<string, string> };
      if (!res.ok || !data.checkoutUrl) {
        setError(data.error ?? "Something went wrong. Please try again.");
        if (data.fields) setFieldErrors(Object.fromEntries(Object.entries(data.fields).map(([k, v]) => [k.replace(/^address\./, ""), v])));
        setBusy(false);
        return;
      }
      // hand over to Safepay's hosted page (stay "busy" while the browser navigates)
      window.location.assign(data.checkoutUrl);
    } catch {
      setError("You seem to be offline. Check your connection and try again.");
      setBusy(false);
    }
  };

  const disabled = busy || pricing.isLoading || !checkout?.enabled;

  return (
    <div className="bb-screen bb-order">
      <div className="bb-order-inner">
        <div style={{ textAlign: "center" }}>
          <div className="bb-kicker">Last step</div>
          <h1>{copy.orderTitle}</h1>
          <p className="bb-sub">{copy.orderSub}</p>
        </div>

        {checkout && !checkout.livemode ? (
          <div className="bb-testmode" role="note">
            <b>Test mode.</b> Payments go to Safepay's sandbox — use test card 4456 5300 0000 1005, any future expiry, CVC 111.
            No money moves and nothing will be printed.
          </div>
        ) : null}

        <form className="bb-order-card" onSubmit={onPay} noValidate>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
            <MiniBook theme={theme} coverStyle={state.coverStyle} title={state.title} occasion={occ} photos={state.photos} size={200} />
            <button type="button" className="bb-btn bb-btn-ghost" onClick={onBack}>
              <BookOpen size={15} /> Flip through it again
            </button>
          </div>

          <div className="bb-order-specs">
            <div className="bb-spec-row">
              <b>Book</b>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}>{state.title}</span>
            </div>
            <div className="bb-spec-row">
              <b>Details</b>
              <span>8×8 in · {state.pages.length} pages · matte paper · {theme.name}</span>
            </div>
            {softPages > 0 ? (
              <div className="bb-spec-row bb-spec-warn">
                <b>Heads up</b>
                <span>
                  {softPages === 1 ? "1 page uses a photo" : `${softPages} pages use photos`} that may look soft in
                  print. You can still order — or go back and zoom out a little.
                </span>
              </div>
            ) : null}
            <div>
              <div className="bb-panel-label" style={{ marginBottom: 8 }}>
                Binding
              </div>
              <div className="bb-bindings">
                {BINDINGS.map((b) => (
                  <button type="button" key={b.id} className={"bb-binding" + (q.binding === b.id ? " on" : "")} onClick={() => set({ binding: b.id })}>
                    <b>{b.name}</b>
                    <i>{formatPKR(b.priceMinor)}</i>
                  </button>
                ))}
              </div>
            </div>
            <div className="bb-spec-row" style={{ alignItems: "center" }}>
              <b>Quantity</b>
              <div className="bb-qty">
                <button type="button" onClick={() => set({ qty: Math.max(1, state.qty - 1) })} aria-label="Fewer">
                  <Minus size={15} />
                </button>
                <span>{q.qty}</span>
                <button type="button" onClick={() => set({ qty: Math.min(PRICE_LIST.maxQty, state.qty + 1) })} aria-label="More">
                  <Plus size={15} />
                </button>
              </div>
            </div>

            <fieldset className="bb-ship" disabled={busy}>
              <legend className="bb-panel-label">Deliver to</legend>
              <label className="bb-ship-field wide">
                <span>Full name</span>
                <input autoComplete="name" {...field("fullName")} />
                {fieldErrors.fullName ? <em>{fieldErrors.fullName}</em> : null}
              </label>
              <label className="bb-ship-field wide">
                <span>Mobile number</span>
                <input type="tel" inputMode="tel" autoComplete="tel" placeholder="0300 1234567" {...field("phone")} />
                {fieldErrors.phone ? <em>{fieldErrors.phone}</em> : <small>The courier calls this number to deliver.</small>}
              </label>
              <label className="bb-ship-field wide">
                <span>Address</span>
                <input autoComplete="address-line1" placeholder="House, street, area" {...field("line1")} />
                {fieldErrors.line1 ? <em>{fieldErrors.line1}</em> : null}
              </label>
              <label className="bb-ship-field wide">
                <span>
                  Apartment, landmark <i>(optional)</i>
                </span>
                <input autoComplete="address-line2" {...field("line2")} />
              </label>
              <label className="bb-ship-field">
                <span>City</span>
                <input autoComplete="address-level2" {...field("city")} />
                {fieldErrors.city ? <em>{fieldErrors.city}</em> : null}
              </label>
              <label className="bb-ship-field">
                <span>Province</span>
                <select autoComplete="address-level1" {...field("province")}>
                  <option value="">Choose…</option>
                  {PK_PROVINCES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                {fieldErrors.province ? <em>{fieldErrors.province}</em> : null}
              </label>
              <label className="bb-ship-field">
                <span>
                  Postal code <i>(optional)</i>
                </span>
                <input inputMode="numeric" autoComplete="postal-code" maxLength={5} {...field("postalCode")} />
                {fieldErrors.postalCode ? <em>{fieldErrors.postalCode}</em> : null}
              </label>
            </fieldset>

            <div className="bb-price-rows">
              <div className="bb-spec-row">
                <b>
                  Subtotal ({q.qty} × {formatPKR(q.unitMinor)})
                </b>
                <span>{formatPKR(q.subtotalMinor)}</span>
              </div>
              <div className="bb-spec-row">
                <b>Shipping</b>
                <span>{q.freeShipping ? "Free" : formatPKR(q.shippingMinor)}</span>
              </div>
              {!q.freeShipping ? (
                <span className="bb-free-ship">
                  <Truck size={14} /> Free shipping on orders of {formatPKR(PRICE_LIST.freeShippingFromMinor)} or more
                </span>
              ) : null}
              <div className="bb-spec-row total">
                <span>Total</span>
                <span>{formatPKR(q.totalMinor)}</span>
              </div>
            </div>

            {error ? (
              <p className="bb-pay-error" role="alert">
                {error}
              </p>
            ) : null}
            {checkout && !checkout.enabled ? (
              <p className="bb-pay-error" role="alert">
                Online payment is temporarily unavailable. Your book is saved — please try again soon.
              </p>
            ) : null}

            <button type="submit" className="bb-btn bb-btn-primary bb-btn-lg" disabled={disabled}>
              {busy ? (
                "Opening secure payment…"
              ) : (
                <>
                  <Lock size={16} /> Pay {formatPKR(q.totalMinor)} <ArrowRight size={17} />
                </>
              )}
            </button>
            <p className="bb-pay-trust">
              <ShieldCheck size={14} /> Secure checkout by Safepay — your card details never touch our servers
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ConfirmScreen({ copy, onRestart, onBack }: { copy: CopyVoice; onRestart: () => void; onBack: () => void }) {
  return (
    <div className="bb-screen bb-confirm">
      <div className="bb-confirm-badge">
        <Check size={40} strokeWidth={2.5} />
      </div>
      <h1>{copy.confirmTitle}</h1>
      <p>{copy.confirmSub}</p>
      <div style={{ display: "flex", gap: 12, marginTop: 22 }}>
        <button className="bb-btn bb-btn-secondary" onClick={onBack}>
          <BookOpen size={16} /> See my book
        </button>
        <button className="bb-btn bb-btn-primary" onClick={onRestart}>
          <Plus size={16} /> Start another book
        </button>
      </div>
    </div>
  );
}
