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
 * Layout (owner-approved canvas D2/D3, 2026-11-28): decluttered to three
 * cards (the book in one row, where to send it, how to pay with the total)
 * and a footer holding Pay. While HD copies finish, Pay is locked and one
 * line above it says how far along they are (Option 2); nothing else is added.
 *
 * Double-submit safety: each attempt carries an idempotency key derived
 * from (mount nonce + what's being bought), so a double click returns the
 * same order, while changing the quantity or address makes a new one.
 */

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen, Check, CheckCircle2, Copy, Loader2, Lock, Minus, Plus, RotateCcw } from "lucide-react";
import { MiniBook } from "../book";
import { coverPhotoIdFor, occasionById, type CopyVoice } from "../data";
import { bookTheme } from "../palette";
import { lowQualityPageCount, photosAwaitingOriginal } from "../print";
import { uploadEngine } from "../upload/engine";
import { formatEta } from "../upload/tips";
import { useUploads } from "../upload/UploadContext";
import { RepickSheet } from "../upload/RepickSheet";
import { toDocument } from "../sync";
import type { BuilderState } from "../state";
import { finishName, formatPKR, PRICE_LIST, printedPageCount, quote } from "@shared/pricing";
import { PK_PROVINCES, STATUS_LABEL, shippingAddressSchema, type ShippingAddress } from "@shared/orders";
import { useOrdered } from "../useOrdered";
import { discountFor } from "@shared/promo";
import { BANK_TRANSFER_WINDOW_DAYS, type PaymentMethod } from "@shared/payments";
import "../flow.css";
import "./checkout.css";
import { useSession } from "@/features/auth/useSession";

interface PricingResponse {
  checkout: {
    enabled: boolean;
    livemode: boolean;
    provider: string | null;
    methods?: { card: boolean; bankTransfer: boolean };
  };
}

const ADDRESS_KEY = "tk_ship_addr_v1";
type AddressForm = Omit<ShippingAddress, "province"> & { province: string };
const EMPTY_ADDRESS: AddressForm = {
  fullName: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  province: "",
  postalCode: "",
};

function loadAddress(): AddressForm | null {
  try {
    const raw = localStorage.getItem(ADDRESS_KEY);
    if (!raw) return null;
    const saved = {
      ...EMPTY_ADDRESS,
      ...(JSON.parse(raw) as Partial<AddressForm>),
    };
    // the decluttered form (2026-11-28) has one address line and no postal
    // code: fold an older saved second line in, so nothing is sent unseen
    const line1 = [saved.line1, saved.line2]
      .map((x) => (x ?? "").trim())
      .filter(Boolean)
      .join(", ")
      .slice(0, 160);
    return { ...saved, line1, line2: "", postalCode: "" };
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
  onRestart,
}: {
  state: BuilderState;
  set: (patch: Partial<BuilderState>) => void;
  copy: CopyVoice;
  onBack: () => void;
  /** start a new book (the header's "Start over") */
  onRestart: () => void;
}) {
  const { user } = useSession();
  const occ = occasionById(state.occasion);
  const theme = bookTheme(state.themeId, state.pageColor);
  // Last honest chance to mention print quality before money changes
  // hands. Silent at zero — nobody needs a green tick telling them
  // nothing is wrong.
  const softPages = lowQualityPageCount(state.pages, state.photos);
  // We print from the HD originals, so payment waits for all of them. The
  // form stays usable: filling in an address is a good use of the wait.
  const awaiting = photosAwaitingOriginal(state.pages, state.photos, coverPhotoIdFor(state));
  const { snapshot } = useUploads();
  const [repickOpen, setRepickOpen] = useState(false);
  const toRepick = awaiting.filter((p) => !uploadEngine.canFinish(p.id));
  const stillSending = awaiting.length - toRepick.length;
  const needRepick = toRepick.length;

  const pricing = useQuery<PricingResponse>({
    queryKey: ["/api/pricing"],
    staleTime: 5 * 60_000,
  });
  const checkout = pricing.data?.checkout;
  // How to pay (shared/payments.ts). The owner switches each method on in the
  // admin; while Safepay is being set up only bank transfer is offered, and
  // the choice appears once both are on.
  const methods = checkout?.methods ?? {
    card: Boolean(checkout?.enabled),
    bankTransfer: false,
  };
  const [picked, setPicked] = useState<PaymentMethod | null>(null);
  const method: PaymentMethod = picked ?? (methods.card ? "card" : "bank_transfer");
  const bank = method === "bank_transfer";

  const [addr, setAddr] = useState<AddressForm>(
    () =>
      loadAddress() ?? {
        ...EMPTY_ADDRESS,
        fullName: user?.name ?? "",
        phone: user?.phone ?? "",
      },
  );
  // Same quote the server will make: the pages inside the book decide the
  // extra sheets, and the address decides the remote-area delivery charge, so
  // the total updates while the customer types their city and province.
  const q = quote({
    binding: state.binding,
    qty: state.qty,
    printedPages: printedPageCount(state.pages),
    address: addr,
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nonce = useRef(Math.random().toString(36).slice(2));

  /*
   * Has this book already been ordered? (owner, 2026-11-22: pressing Back
   * after placing an order showed this form again and seemed stuck.) An
   * ordered book shows its order instead; "Order another copy" is the
   * deliberate way to order it again, and the server refuses a second order
   * without it (createOrder, ALREADY_ORDERED).
   */
  const { ordered, refetch: refetchOrders } = useOrdered(state.projectId);
  const [again, setAgain] = useState(false);

  /*
   * Promo code (owner, 2026-11-22). Hidden behind a link so customers without
   * one aren't sent looking. The server checks the code (a preview) and again
   * when the order is placed, where it is priced; here the discount is worked
   * out with the same rule (shared/promo.ts discountFor) so it follows a
   * change of binding or quantity.
   */
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<{
    code: string;
    kind: string;
    value: number;
    label: string;
  } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);
  const discountMinor = promo ? discountFor(promo, q.subtotalMinor) : 0;
  const totalMinor = q.totalMinor - discountMinor;
  const applyPromo = async () => {
    if (!promoInput.trim()) return;
    setPromoBusy(true);
    setPromoError(null);
    try {
      const res = await fetch("/api/promo/check", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: promoInput,
          subtotalMinor: q.subtotalMinor,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        code?: string;
        kind?: string;
        value?: number;
        label?: string;
        error?: string;
      };
      if (!res.ok || !data.code) return setPromoError(data.error ?? "That code didn't work. Try again.");
      setPromo({
        code: data.code,
        kind: data.kind!,
        value: data.value!,
        label: data.label!,
      });
      setPromoOpen(false);
    } catch {
      setPromoError("You seem to be offline. Try again in a moment.");
    } finally {
      setPromoBusy(false);
    }
  };

  // Back from the order page restores this page from the browser's cache with
  // the button still saying "Placing…". Wake it up and look for the order.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      setBusy(false);
      void refetchOrders();
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, [refetchOrders]);

  /** One field checked on its own, when the customer leaves it (not on every key). */
  const check = (k: keyof AddressForm) => {
    if (k === "province")
      return setFieldErrors((fe) => ({
        ...fe,
        province: addr.province ? "" : "Choose a province",
      }));
    const shape = shippingAddressSchema.shape as Record<
      string,
      {
        safeParse: (v: unknown) => {
          success: boolean;
          error?: { issues: Array<{ message: string }> };
        };
      }
    >;
    const one = shape[k]?.safeParse(addr[k] ?? "");
    if (!one) return;
    // an optional field left empty is fine; a required one waits for the button
    if (!(addr[k] ?? "").trim()) return;
    setFieldErrors((fe) => ({
      ...fe,
      [k]: one.success ? "" : (one.error?.issues[0]?.message ?? "Check this"),
    }));
  };

  const field = (k: keyof AddressForm) => ({
    value: addr[k] ?? "",
    onChange: (e: { target: { value: string } }) => {
      setAddr((a) => ({ ...a, [k]: e.target.value }));
      if (fieldErrors[k]) setFieldErrors((fe) => ({ ...fe, [k]: "" }));
    },
    onBlur: () => check(k),
    "aria-invalid": Boolean(fieldErrors[k]) || undefined,
  });

  const idempotencyKey = useMemo(
    () => `${nonce.current}-${hash(JSON.stringify([state.projectId, q.binding, state.finish, q.qty, addr]))}`,
    [state.projectId, q.binding, state.finish, q.qty, addr],
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
      // take them to the first problem
      requestAnimationFrame(() => (document.querySelector('.bb-ship [aria-invalid="true"]') as HTMLElement | null)?.focus());
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
          finish: state.finish,
          qty: q.qty,
          address: parsed.data,
          document: toDocument(state),
          idempotencyKey: `${idempotencyKey}-${method}`,
          method,
          again: again || undefined,
          promoCode: promo?.code,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        checkoutUrl?: string | null;
        order?: { id: string };
        error?: string;
        fields?: Record<string, string>;
      };
      // bank transfer: no payment page; the order page shows how to pay
      if (res.ok && bank && data.order) {
        window.location.assign(`/orders/${data.order.id}?placed=1`);
        return;
      }
      // ordered in another tab, or before a Back press: show that order
      if (res.status === 409 && (data as { code?: string }).code === "ALREADY_ORDERED") {
        setBusy(false);
        void refetchOrders();
        return;
      }
      if (res.status === 400 && (data as { code?: string }).code === "PROMO_INVALID") {
        // the code stopped applying since it was checked (used up, expired): say so by the code
        setPromo(null);
        setPromoOpen(true);
        setPromoError(data.error ?? "That code no longer applies.");
        setBusy(false);
        return;
      }
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

  const disabled = busy || pricing.isLoading || !checkout?.enabled || awaiting.length > 0;

  if (ordered && !again) {
    return (
      <div className="bb-screen bb-order">
        <div className="bb-order-inner">
          <div className="bb-ordered" role="status">
            <CheckCircle2 size={28} />
            <h1>You've ordered this book</h1>
            <p>
              Order {ordered.orderNumber} · {STATUS_LABEL[ordered.status]}. Changes now would make a different book, so this one stays as you ordered it.
            </p>
            <div className="bb-ordered-actions">
              <a className="bb-btn bb-btn-primary bb-btn-lg" href={`/orders/${ordered.id}`}>
                See my order <ArrowRight size={18} />
              </a>
              <button type="button" className="bb-btn bb-btn-secondary" onClick={() => setAgain(true)}>
                <Copy size={16} /> Order another copy
              </button>
              <button type="button" className="bb-btn bb-btn-ghost" onClick={onRestart}>
                Start a new book
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const hdLeft = awaiting.length;
  const fine = bank
    ? `We'll hold your order for ${BANK_TRANSFER_WINDOW_DAYS} days while you make the transfer.`
    : "Printed in 2–3 days, delivered in 2–4. Cancel within 6 support hours of paying. Secure payment by Safepay.";

  return (
    <div className="bb-screen bb-order co">
      <div className="co-inner">
        <h1 className="co-title">{copy.orderTitle}</h1>

        {checkout && !checkout.livemode && !bank ? (
          <div className="bb-testmode" role="note">
            <b>Test mode.</b> Payments go to Safepay's sandbox — use test card 4456 5300 0000 1005, any future expiry, CVC 111. No money moves and nothing will be printed.
          </div>
        ) : null}

        <form className="co-form" onSubmit={onPay} noValidate>
          {/* the book, in one row: what it is, a way back to it, and how many */}
          <section className="co-card co-book" aria-label="Your book">
            <MiniBook theme={theme} coverStyle={state.coverStyle} title={state.title} occasion={occ} photos={state.photos} size={72} />
            <div className="co-book-text">
              <b>{state.title}</b>
              <span>
                12×12 hardcover · {state.pages.length} pages · {finishName(state.finish)}
              </span>
              <button type="button" className="co-link" onClick={onBack}>
                See it again
              </button>
            </div>
            <div className="bb-qty" aria-label="Copies">
              <button type="button" onClick={() => set({ qty: Math.max(1, state.qty - 1) })} aria-label="Fewer copies">
                <Minus size={15} />
              </button>
              <span>{q.qty}</span>
              <button type="button" onClick={() => set({ qty: Math.min(PRICE_LIST.maxQty, state.qty + 1) })} aria-label="More copies">
                <Plus size={15} />
              </button>
            </div>
          </section>
          {/* last honest chance to mention print quality; silent at zero */}
          {softPages > 0 ? (
            <p className="co-warn">
              Some photos may not print sharp. You can still order.{" "}
              <button type="button" className="co-link" onClick={onBack}>
                See which ones
              </button>
            </p>
          ) : null}

          <section className="co-card" aria-labelledby="co-ship-h">
            <h2 className="co-h" id="co-ship-h">
              Where should we send it?
            </h2>
            <fieldset className="bb-ship co-ship" disabled={busy} aria-labelledby="co-ship-h">
              <label className="bb-ship-field wide">
                <span>Full name</span>
                <input autoComplete="name" {...field("fullName")} />
                {fieldErrors.fullName ? <em>{fieldErrors.fullName}</em> : null}
              </label>
              <label className="bb-ship-field wide">
                <span>Mobile number</span>
                <input type="tel" inputMode="tel" autoComplete="tel" placeholder="0300 1234567" {...field("phone")} />
                {fieldErrors.phone ? <em>{fieldErrors.phone}</em> : null}
              </label>
              <label className="bb-ship-field wide">
                <span>Address</span>
                <input autoComplete="street-address" placeholder="House, street, area, landmark" {...field("line1")} />
                {fieldErrors.line1 ? <em>{fieldErrors.line1}</em> : null}
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
            </fieldset>
          </section>

          <section className="co-card co-pay" aria-label="Payment">
            {methods.card && methods.bankTransfer ? (
              <fieldset className="co-methods" disabled={busy}>
                <legend className="co-h">How to pay</legend>
                <div className="co-choices" role="radiogroup" aria-label="How to pay">
                  {(
                    [
                      ["card", "Card or Google Pay"],
                      ["bank_transfer", "Bank transfer"],
                    ] as const
                  ).map(([id, name]) => (
                    <button key={id} type="button" role="radio" aria-checked={method === id} className={"co-choice" + (method === id ? " on" : "")} onClick={() => setPicked(id)}>
                      {name}
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}
            {/* the explanation only for the method that needs one */}
            {bank ? <p className="co-note">Place your order to see our bank details. WhatsApp us the receipt, and your album goes to print once we see the payment.</p> : null}

            <div className="co-prices">
              <div className="co-row">
                <span>
                  {q.qty === 1 ? "Book" : `${q.qty} books`}
                  {q.extraSheets > 0 ? (
                    <small>
                      {" "}
                      · includes {q.extraSheets} extra {q.extraSheets === 1 ? "sheet" : "sheets"}
                    </small>
                  ) : null}
                </span>
                <span>{formatPKR(q.subtotalMinor)}</span>
              </div>
              <div className="co-row">
                <span>{q.deliveryKnown ? `Delivery to ${addr.city.trim()}` : "Delivery"}</span>
                <span>{!q.deliveryKnown ? "Add your city" : q.shippingMinor ? formatPKR(q.shippingMinor) : "Free"}</span>
              </div>
              {promo ? (
                <div className="co-row bb-promo-line">
                  <span>
                    {promo.code} · {promo.label}{" "}
                    <button type="button" className="bb-promo-remove" onClick={() => setPromo(null)}>
                      Remove
                    </button>
                  </span>
                  <span>− {formatPKR(discountMinor)}</span>
                </div>
              ) : null}
              <div className="co-row co-total">
                <span>Total</span>
                <span>{formatPKR(totalMinor)}</span>
              </div>
              {promo ? null : promoOpen ? (
                <label className="bb-ship-field wide">
                  <span>Promo code</span>
                  <span className="bb-promo-row">
                    <input
                      value={promoInput}
                      onChange={(e) => {
                        setPromoInput(e.target.value.toUpperCase());
                        setPromoError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void applyPromo();
                        }
                      }}
                      autoCapitalize="characters"
                      autoComplete="off"
                      maxLength={24}
                      aria-invalid={Boolean(promoError) || undefined}
                    />
                    <button type="button" className="bb-btn bb-btn-secondary" disabled={promoBusy || !promoInput.trim()} onClick={() => void applyPromo()}>
                      Apply
                    </button>
                  </span>
                  {promoError ? <em>{promoError}</em> : null}
                </label>
              ) : (
                <button type="button" className="bb-promo-open" onClick={() => setPromoOpen(true)}>
                  Have a promo code?
                </button>
              )}
            </div>
          </section>

          {error ? (
            <p className="bb-pay-error" role="alert">
              {error}
            </p>
          ) : null}
          {checkout && !checkout.enabled ? (
            <p className="bb-pay-error" role="alert">
              Ordering is paused for a moment. Your book is saved, so please try again soon.
            </p>
          ) : null}
          {needRepick ? (
            <div className="ck-order-wait" role="status">
              <p>
                <b>
                  {needRepick} {needRepick === 1 ? "photo needs" : "photos need"} adding again before you can pay.
                </b>
              </p>
              <button type="button" className="bb-btn bb-btn-secondary" onClick={() => setRepickOpen(true)}>
                <RotateCcw size={15} /> See which photos
              </button>
              {repickOpen ? <RepickSheet photos={toRepick} pages={state.pages} coverPhotoId={coverPhotoIdFor(state)} onClose={() => setRepickOpen(false)} /> : null}
            </div>
          ) : null}

          {/* Option 2 (owner, 2026-11-28): Pay waits for the HD copies, with one line saying how far along */}
          <div className="co-foot">
            {hdLeft && !needRepick ? (
              <p className="co-hd" role="status">
                <Loader2 size={14} className="au-spin" aria-hidden="true" />
                {snapshot.offline
                  ? "Waiting for a connection. We'll carry on by ourselves."
                  : `Saving HD copies · ${stillSending} left${snapshot.etaSeconds !== null ? ` · ${formatEta(snapshot.etaSeconds)}` : ""}`}
              </p>
            ) : null}
            <button type="submit" className="bb-btn bb-btn-primary bb-btn-lg" disabled={disabled}>
              {busy ? (
                bank ? (
                  "Placing your order…"
                ) : (
                  "Opening secure payment…"
                )
              ) : hdLeft ? (
                bank ? (
                  "Ordering opens when your photos finish"
                ) : (
                  "Pay opens when your photos finish"
                )
              ) : bank ? (
                <>
                  Order now <ArrowRight size={17} />
                </>
              ) : (
                <>
                  <Lock size={16} /> Pay {formatPKR(totalMinor)} <ArrowRight size={17} />
                </>
              )}
            </button>
            <p className="co-fine">{fine}</p>
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
