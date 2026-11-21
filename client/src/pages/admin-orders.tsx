/**
 * /admin/orders — fulfilment console (role = admin).
 *
 * List with a status filter; selecting an order shows the delivery
 * address, the book link, and the moves the state machine allows next
 * (shared/orders.ts TRANSITIONS — the server enforces the same table and
 * refuses to send a sandbox/test order to production).
 *
 * Bank transfer (2026-11-21, shared/payments.ts): a transfer order waits as
 * "Awaiting payment" until someone checks the money arrived and presses
 * "Payment received" (confirms, emails the customer, cuts the print files).
 * "Payment methods" at the top switches card payments (Safepay) and bank
 * transfer on and off for checkout.
 */

import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { finishName, formatPKR } from "@shared/pricing";
import { ORDER_STATUSES, STATUS_LABEL, TRANSITIONS, type OrderStatus } from "@shared/orders";
import { AppShell } from "@/features/account/AppShell";
import { useSession } from "@/features/auth/useSession";
import { bindingName, formatDate, getJSON, postJSON, type OrderEvent, type PublicOrder } from "@/features/orders/api";
import type { PaymentSettings } from "@shared/payments";
import "@/features/orders/orders.css";

/** A Pakistani number as wa.me wants it: 0300 1234567 → 923001234567. */
const waDigits = (phone: string) => {
  const d = phone.replace(/\D/g, "");
  return d.startsWith("0") ? "92" + d.slice(1) : d;
};

/** Card payments (Safepay) and bank transfer on or off for checkout. */
function PaymentMethodsPanel() {
  const qc = useQueryClient();
  const q = useQuery<{ settings: PaymentSettings; gatewayReady: boolean; livemode: boolean }>({
    queryKey: ["/api/admin/settings/payments"],
    queryFn: () => getJSON("/api/admin/settings/payments"),
    staleTime: 0,
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // shown at once while saving, so the switch moves under the finger; rolled back on an error
  const [optimistic, setOptimistic] = useState<PaymentSettings | null>(null);
  if (!q.data) return null;
  const { gatewayReady, livemode } = q.data;
  const settings = optimistic ?? q.data.settings;
  const save = async (next: PaymentSettings) => {
    setErr(null);
    setSaving(true);
    setOptimistic(next);
    try {
      await postJSON("/api/admin/settings/payments", next, "PUT");
      await qc.invalidateQueries({ queryKey: ["/api/admin/settings/payments"] });
      await qc.invalidateQueries({ queryKey: ["/api/pricing"] });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setOptimistic(null);
      setSaving(false);
    }
  };
  return (
    <section className="au-section ad-pay">
      <h2>Payment methods</h2>
      <label className="ad-switch">
        <input type="checkbox" checked={settings.card} disabled={saving || (!gatewayReady && !settings.card)} onChange={(e) => save({ ...settings, card: e.target.checked })} />
        <span>
          <b>Card and Google Pay (Safepay)</b>
          <i>
            {gatewayReady
              ? livemode
                ? "Safepay is set up for live payments."
                : "Safepay is in sandbox (test) mode: customers would pay test money."
              : "Safepay isn't set up on the server yet, so this can't be switched on."}
          </i>
        </span>
      </label>
      <label className="ad-switch">
        <input type="checkbox" checked={settings.bankTransfer} disabled={saving} onChange={(e) => save({ ...settings, bankTransfer: e.target.checked })} />
        <span>
          <b>Bank transfer</b>
          <i>Customers transfer to Dubai Islamic Bank and send the screenshot on WhatsApp. You confirm each one below.</i>
        </span>
      </label>
      {err ? <p className="bb-pay-error">{err}</p> : null}
    </section>
  );
}

type AdminOrder = PublicOrder & { userId: string; providerRef: string | null };

export default function AdminOrdersPage() {
  const { loading, isAdmin } = useSession();
  const qc = useQueryClient();
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [selected, setSelected] = useState<string | null>(null);
  const list = useQuery<AdminOrder[]>({
    queryKey: ["/api/admin/orders", status],
    queryFn: () => getJSON(`/api/admin/orders${status ? `?status=${status}` : ""}`),
    enabled: isAdmin,
    staleTime: 0,
  });
  const detail = useQuery<{ order: AdminOrder; events: OrderEvent[] }>({
    queryKey: ["/api/admin/orders", "detail", selected],
    queryFn: () => getJSON(`/api/admin/orders/${selected}`),
    enabled: Boolean(selected && isAdmin),
    staleTime: 0,
  });

  const [courier, setCourier] = useState("");
  const [tracking, setTracking] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [confirming, setConfirming] = useState(false);
  const markPaid = async () => {
    setErr(null);
    try {
      await postJSON(`/api/admin/orders/${selected}/mark-paid`, reference ? { reference } : {});
      setConfirming(false);
      setReference("");
      await qc.invalidateQueries({ queryKey: ["/api/admin/orders"] });
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const update = async (patch: Record<string, string>) => {
    setErr(null);
    try {
      await postJSON(`/api/admin/orders/${selected}`, patch, "PATCH");
      setNote("");
      await qc.invalidateQueries({ queryKey: ["/api/admin/orders"] });
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  if (loading) return <AppShell><div className="au-page" aria-busy="true" /></AppShell>;
  if (!isAdmin) {
    return (
      <AppShell>
        <div className="au-page">
          <div className="au-empty">
            <h2>Admins only</h2>
            <Link href="/" className="bb-btn bb-btn-primary">Home</Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const o = detail.data?.order;
  return (
    <AppShell>
      <div className="au-page" style={{ maxWidth: 1180 }}>
        <div className="au-page-head">
          <div>
            <div className="bb-kicker">Admin</div>
            <h1>Orders</h1>
          </div>
          <select className="ad-filter" value={status} onChange={(e) => setStatus(e.target.value as OrderStatus | "")}>
            <option value="">All statuses</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>

        <PaymentMethodsPanel />

        <div className="ad-split">
          <ul className="or-list">
            {(list.data ?? []).map((x) => (
              <li key={x.id}>
                <button className={"or-row" + (x.id === selected ? " sel" : "")} onClick={() => { setSelected(x.id); setCourier(x.courier ?? ""); setTracking(x.trackingNumber ?? ""); setConfirming(false); setReference(""); }}>
                  <div>
                    <b>{x.orderNumber} · {x.title}</b>
                    <span>{x.shippingAddress.fullName} · {x.shippingAddress.phone} · {x.shippingAddress.city} · {formatDate(x.createdAt)}</span>
                  </div>
                  <div className="or-row-end">
                    <span className={"or-status s-" + x.status}>{STATUS_LABEL[x.status]}</span>
                    <b>{formatPKR(x.totalMinor)}</b>
                    {!x.livemode ? <span className="or-tag">TEST</span> : null}
                    {x.paymentMethod === "bank_transfer" ? <span className="or-tag bank">Bank transfer</span> : null}
                  </div>
                </button>
              </li>
            ))}
            {list.data && list.data.length === 0 ? <li className="au-empty">No orders</li> : null}
          </ul>

          {o ? (
            <aside className="au-section ad-detail">
              <h2>{o.orderNumber} {!o.livemode ? <span className="or-tag">TEST</span> : null}</h2>
              <div className="or-line"><span>Status</span><b>{STATUS_LABEL[o.status]}</b></div>
              <div className="or-line"><span>Book</span><span>{o.title}: {o.qty} × {bindingName(o.binding)}, 12×12 in, {finishName(o.finish)}, {o.pageCount} pages</span></div>
              <div className="or-line"><span>Total</span><b>{formatPKR(o.totalMinor)}</b></div>
              <div className="or-line"><span>Customer</span><span>{o.contactEmail}</span></div>
              <div className="or-line">
                <span>Phone</span>
                <span className="ad-contact">
                  <a href={`tel:${o.shippingAddress.phone}`}>{o.shippingAddress.phone}</a>
                  <a href={`https://wa.me/${waDigits(o.shippingAddress.phone)}?text=${encodeURIComponent(`Hi ${o.shippingAddress.fullName}, about your Truekeeps order ${o.orderNumber}`)}`} target="_blank" rel="noopener noreferrer">
                    WhatsApp
                  </a>
                </span>
              </div>
              <div className="or-line"><span>Payment</span><b>{o.paymentMethod === "bank_transfer" ? "Bank transfer" : "Card (Safepay)"}</b></div>
              <address className="or-addr">
                <b>{o.shippingAddress.fullName}</b>
                <span>{o.shippingAddress.line1}</span>
                {o.shippingAddress.line2 ? <span>{o.shippingAddress.line2}</span> : null}
                <span>{o.shippingAddress.city}, {o.shippingAddress.province} {o.shippingAddress.postalCode}</span>
                <span>{o.shippingAddress.phone}</span>
              </address>
              {o.paymentMethod === "bank_transfer" ? (
                (o.status === "pending_payment" || o.status === "expired") ? (
                  <div className="ad-bank">
                    {!confirming ? (
                      <button className="bb-btn bb-btn-primary" onClick={() => setConfirming(true)}>
                        Payment received
                      </button>
                    ) : (
                      <>
                        <p>
                          <b>Mark {o.orderNumber} as paid?</b> Only once {formatPKR(o.totalMinor)} is in the account. The customer gets the confirmation email and the print files are made.
                        </p>
                        <input placeholder="Bank reference (optional)" value={reference} onChange={(e) => setReference(e.target.value)} />
                        <div className="ad-moves">
                          <button className="bb-btn bb-btn-primary" onClick={markPaid}>Yes, mark as paid</button>
                          <button className="bb-btn bb-btn-ghost" onClick={() => setConfirming(false)}>Not yet</button>
                        </div>
                      </>
                    )}
                  </div>
                ) : null
              ) : (
                <div className="or-line"><span>Safepay tracker</span><code>{o.providerRef ?? "—"}</code></div>
              )}

              <div className="ad-fields">
                <input placeholder="Courier (TCS, Leopards…)" value={courier} onChange={(e) => setCourier(e.target.value)} />
                <input placeholder="Tracking number" value={tracking} onChange={(e) => setTracking(e.target.value)} />
                <input placeholder="Note (optional, shown in timeline)" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <div className="ad-moves">
                {/* "paid" only through a payment: Safepay, or Payment received above */}
                {TRANSITIONS[o.status].filter((to) => to !== "paid").map((to) => (
                  <button key={to} className="bb-btn bb-btn-secondary" onClick={() => update({ status: to, courier, trackingNumber: tracking, ...(note ? { note } : {}) })}>
                    → {STATUS_LABEL[to]}
                  </button>
                ))}
                <button className="bb-btn bb-btn-ghost" onClick={() => update({ courier, trackingNumber: tracking, ...(note ? { note } : {}) })}>
                  Save details
                </button>
              </div>
              {err ? <p className="bb-pay-error">{err}</p> : null}
              <ol className="or-timeline">
                {(detail.data?.events ?? []).slice().reverse().map((e) => (
                  <li key={e.id}><span className="dot" /><div><b>{e.toStatus ?? e.kind}</b>{e.note ? <span>{e.note}</span> : null}<time>{e.actor} · {formatDate(e.createdAt)}</time></div></li>
                ))}
              </ol>
            </aside>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
