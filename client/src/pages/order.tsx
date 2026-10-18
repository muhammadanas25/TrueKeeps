/**
 * /orders/:id — one order: status, timeline, what was bought, where it goes.
 *
 * This is where Safepay sends the customer back. The server already asked
 * the gateway on the way through (/api/payments/return), but capture can
 * lag a few seconds, so while the order is still awaiting payment the page
 * asks the server to re-check (POST /refresh) every 3 s for up to ~90 s.
 * After that it stops and offers a manual "Check again" — the background
 * sweep will still catch a late payment and email the customer.
 */

import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Clock, CreditCard, Package, RefreshCw, Truck } from "lucide-react";
import { formatPKR } from "@shared/pricing";
import { STATUS_LABEL } from "@shared/orders";
import { AppShell } from "@/features/account/AppShell";
import { bindingName, formatDate, getJSON, postJSON, type OrderEvent, type PublicOrder } from "@/features/orders/api";
import "@/features/orders/orders.css";

const POLL_MS = 3000;
const POLL_FOR_MS = 90_000;

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const params = new URLSearchParams(window.location.search);
  const fromCheckout = params.get("from") === "checkout";
  const cancelled = params.get("cancelled") === "1";
  const key = ["/api/orders", id];

  const q = useQuery<{ order: PublicOrder; events: OrderEvent[] }>({
    queryKey: key,
    queryFn: () => getJSON(`/api/orders/${id}`),
    retry: false,
  });
  const order = q.data?.order;

  // poll while pending, but only right after checkout and only for a while
  const [polling, setPolling] = useState(fromCheckout);
  const started = useRef(Date.now());
  useEffect(() => {
    if (!polling || !order || order.status !== "pending_payment") return;
    if (Date.now() - started.current > POLL_FOR_MS) {
      setPolling(false);
      return;
    }
    const t = setTimeout(async () => {
      try {
        await postJSON(`/api/orders/${id}/refresh`);
      } finally {
        qc.invalidateQueries({ queryKey: key });
      }
    }, POLL_MS);
    return () => clearTimeout(t);
  }, [polling, order?.status, q.dataUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const payNow = async () => {
    setBusy(true);
    setActionError(null);
    try {
      const { checkoutUrl } = await postJSON<{ checkoutUrl: string }>(`/api/orders/${id}/pay`);
      window.location.assign(checkoutUrl);
    } catch (e) {
      setActionError((e as Error).message);
      setBusy(false);
    }
  };
  const checkAgain = async () => {
    setBusy(true);
    try {
      await postJSON(`/api/orders/${id}/refresh`);
      await qc.invalidateQueries({ queryKey: key });
    } finally {
      setBusy(false);
    }
  };

  if (q.isLoading) {
    return (
      <AppShell>
        <div className="au-page" aria-busy="true" />
      </AppShell>
    );
  }
  if (!order) {
    return (
      <AppShell>
        <div className="au-page">
          <div className="au-empty">
            <AlertCircle size={28} />
            <h2>Order not found</h2>
            <p style={{ margin: 0 }}>It may belong to a different account. Sign in with the email you ordered with.</p>
            <Link href="/orders" className="bb-btn bb-btn-primary">
              My orders
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const pending = order.status === "pending_payment";
  const paidish = !["pending_payment", "expired", "cancelled"].includes(order.status);
  const a = order.shippingAddress;

  return (
    <AppShell>
      <div className="au-page or-page">
        {!order.livemode ? (
          <div className="or-test">
            <b>Test order.</b> Paid through Safepay's sandbox — no money moved and it will not be printed.
          </div>
        ) : null}

        <header className={"or-hero " + (paidish ? "ok" : pending ? "wait" : "off")}>
          <span className="or-hero-ic">
            {paidish ? <CheckCircle2 size={30} /> : pending ? <Clock size={30} /> : <AlertCircle size={30} />}
          </span>
          <div>
            <div className="bb-kicker">Order {order.orderNumber}</div>
            <h1>
              {paidish
                ? "Thank you — your order is confirmed"
                : pending
                  ? polling
                    ? "Confirming your payment…"
                    : cancelled
                      ? "Payment cancelled"
                      : "Awaiting payment"
                  : STATUS_LABEL[order.status]}
            </h1>
            <p className="au-page-sub">
              {paidish
                ? `We emailed a receipt to ${order.contactEmail}. We'll email again when it ships.`
                : pending
                  ? polling
                    ? "This usually takes a few seconds. Please keep this page open."
                    : `Your order is saved. You can complete payment until ${formatDate(order.expiresAt)}.`
                  : order.status === "expired"
                    ? "We didn't receive a payment in time. If you were charged, contact us with this order number."
                    : ""}
            </p>
          </div>
        </header>

        {pending && !polling ? (
          <div className="or-actions">
            <button className="bb-btn bb-btn-primary" onClick={payNow} disabled={busy}>
              <CreditCard size={16} /> Pay {formatPKR(order.totalMinor)}
            </button>
            <button className="bb-btn bb-btn-secondary" onClick={checkAgain} disabled={busy}>
              <RefreshCw size={15} /> I've paid — check again
            </button>
            {actionError ? <p className="bb-pay-error">{actionError}</p> : null}
          </div>
        ) : null}

        <div className="or-grid">
          <section className="au-section">
            <h2>Your book</h2>
            <div className="or-line">
              <span>{order.title}</span>
              <span>
                {order.qty} × {bindingName(order.binding)}
              </span>
            </div>
            <div className="or-line muted">
              <span>8×8 in · {order.pageCount} pages</span>
              <span>{formatPKR(order.unitMinor)} each</span>
            </div>
            <div className="or-sum">
              <div className="or-line">
                <span>Subtotal</span>
                <span>{formatPKR(order.subtotalMinor)}</span>
              </div>
              <div className="or-line">
                <span>Shipping</span>
                <span>{order.shippingMinor ? formatPKR(order.shippingMinor) : "Free"}</span>
              </div>
              <div className="or-line total">
                <span>Total</span>
                <span>{formatPKR(order.totalMinor)}</span>
              </div>
            </div>
            <Link href={`/wizard?project=${order.projectId}`} className="bb-btn bb-btn-ghost" style={{ alignSelf: "flex-start" }}>
              Open the book
            </Link>
          </section>

          <section className="au-section">
            <h2>Delivery</h2>
            <address className="or-addr">
              <b>{a.fullName}</b>
              <span>{a.line1}</span>
              {a.line2 ? <span>{a.line2}</span> : null}
              <span>
                {a.city}, {a.province} {a.postalCode}
              </span>
              <span>{a.phone}</span>
            </address>
            {order.trackingNumber ? (
              <div className="or-line">
                <span>
                  <Truck size={14} style={{ verticalAlign: "-2px" }} /> {order.courier ?? "Courier"}
                </span>
                <span>{order.trackingNumber}</span>
              </div>
            ) : null}
          </section>
        </div>

        <section className="au-section">
          <h2>Timeline</h2>
          <ol className="or-timeline">
            {(q.data?.events ?? [])
              .slice()
              .reverse()
              .map((e) => (
                <li key={e.id}>
                  <span className="dot">
                    <Package size={12} />
                  </span>
                  <div>
                    <b>
                      {e.kind === "created"
                        ? "Order placed"
                        : e.kind === "payment_failed"
                          ? "Payment attempt declined"
                          : e.toStatus
                            ? STATUS_LABEL[e.toStatus as keyof typeof STATUS_LABEL] ?? e.toStatus
                            : "Update"}
                    </b>
                    {e.note && e.kind !== "status" ? <span>{e.note}</span> : null}
                    <time>{formatDate(e.createdAt)}</time>
                  </div>
                </li>
              ))}
          </ol>
        </section>
      </div>
    </AppShell>
  );
}
