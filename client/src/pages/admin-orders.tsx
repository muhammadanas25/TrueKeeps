/**
 * /admin/orders — fulfilment console (role = admin).
 *
 * List with a status filter; selecting an order shows the delivery
 * address, the book link, and the moves the state machine allows next
 * (shared/orders.ts TRANSITIONS — the server enforces the same table and
 * refuses to send a sandbox/test order to production).
 */

import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatPKR } from "@shared/pricing";
import { ORDER_STATUSES, STATUS_LABEL, TRANSITIONS, type OrderStatus } from "@shared/orders";
import { AppShell } from "@/features/account/AppShell";
import { useSession } from "@/features/auth/useSession";
import { bindingName, formatDate, getJSON, postJSON, type OrderEvent, type PublicOrder } from "@/features/orders/api";
import "@/features/orders/orders.css";

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

        <div className="ad-split">
          <ul className="or-list">
            {(list.data ?? []).map((x) => (
              <li key={x.id}>
                <button className={"or-row" + (x.id === selected ? " sel" : "")} onClick={() => { setSelected(x.id); setCourier(x.courier ?? ""); setTracking(x.trackingNumber ?? ""); }}>
                  <div>
                    <b>{x.orderNumber} · {x.title}</b>
                    <span>{x.shippingAddress.fullName} · {x.shippingAddress.city} · {formatDate(x.createdAt)}</span>
                  </div>
                  <div className="or-row-end">
                    <span className={"or-status s-" + x.status}>{STATUS_LABEL[x.status]}</span>
                    <b>{formatPKR(x.totalMinor)}</b>
                    {!x.livemode ? <span className="or-tag">TEST</span> : null}
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
              <div className="or-line"><span>Book</span><span>{o.title} — {o.qty} × {bindingName(o.binding)}, {o.pageCount} pages</span></div>
              <div className="or-line"><span>Total</span><b>{formatPKR(o.totalMinor)}</b></div>
              <div className="or-line"><span>Customer</span><span>{o.contactEmail}</span></div>
              <address className="or-addr">
                <b>{o.shippingAddress.fullName}</b>
                <span>{o.shippingAddress.line1}</span>
                {o.shippingAddress.line2 ? <span>{o.shippingAddress.line2}</span> : null}
                <span>{o.shippingAddress.city}, {o.shippingAddress.province} {o.shippingAddress.postalCode}</span>
                <span>{o.shippingAddress.phone}</span>
              </address>
              <div className="or-line"><span>Safepay tracker</span><code>{o.providerRef ?? "—"}</code></div>

              <div className="ad-fields">
                <input placeholder="Courier (TCS, Leopards…)" value={courier} onChange={(e) => setCourier(e.target.value)} />
                <input placeholder="Tracking number" value={tracking} onChange={(e) => setTracking(e.target.value)} />
                <input placeholder="Note (optional, shown in timeline)" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <div className="ad-moves">
                {TRANSITIONS[o.status].map((to) => (
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
