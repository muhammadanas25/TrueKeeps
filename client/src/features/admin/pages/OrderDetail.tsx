/**
 * Order detail (canvas board A4Order): can this book be printed, is it
 * moving, and how do I reach the customer?
 *
 *  - Customer: the full phone (Call / WhatsApp / Copy), email, the full ship-to
 *    address (Copy / Open in Maps), and how many orders they've placed
 *  - Print file: the latest version's state, each PDF's pages, size and
 *    SHA-256, low-resolution and missing-photo warnings, audited 15-minute
 *    downloads, and "Rebuild as a new version"
 *  - Delivery: the promised date, courier and tracking (saving them with
 *    "Mark shipped" tells the customer through the notification rules)
 *  - Moves: only the status changes the order's rules allow next (shared/
 *    orders.ts); "paid" is never set by hand here — payment is confirmed by
 *    the gateway, or by the bank-transfer check
 *  - Timeline: status changes, system notes and every message sent, newest
 *    first, with internal notes
 */

import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Download, MapPin, MessageCircle, Phone, RefreshCw } from "lucide-react";
import { TRANSITIONS, STATUS_LABEL, type OrderStatus } from "@shared/orders";
import { adminFetch, useAdminQuery, type OrderDetail, type StaffMe } from "../api";
import { day, money, printTone, STATUS, waLink, when } from "../format";
import { ErrorNote, Loading, Pill } from "../parts";

const MOVE_LABEL: Partial<Record<OrderStatus, string>> = {
  in_production: "Send to printer",
  shipped: "Mark shipped",
  delivered: "Mark delivered",
  cancelled: "Cancel order",
  refunded: "Mark refunded",
};

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="oc-btn sm"
      onClick={() => {
        void navigator.clipboard?.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      <Copy size={14} aria-hidden /> {done ? "Copied" : label}
    </button>
  );
}

export function OrderDetailPage({ id, me }: { id: string; me: StaffMe }) {
  const qc = useQueryClient();
  const q = useAdminQuery<OrderDetail>(["order", id], `/api/admin/ops/orders/${id}`, { refetchInterval: 30_000 });
  const [courier, setCourier] = useState<string | null>(null);
  const [tracking, setTracking] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [bankRef, setBankRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  if (q.error) return <ErrorNote error={q.error} />;
  if (!q.data) return <Loading />;
  const { order: o, printJobs, events, notifications, customer } = q.data;
  const a = o.shippingAddress;
  const status = o.status as OrderStatus;
  const [st, stTone] = STATUS[status] ?? [status, "muted"];
  const job = printJobs[0];
  const [pr, prTone] = printTone(job?.state, job?.problems?.length ?? 0);
  const addressText = [a.fullName, a.line1, a.line2, `${a.city}, ${a.province}${a.postalCode ? " " + a.postalCode : ""}`, a.phone].filter(Boolean).join("\n");
  const c = courier ?? o.courier ?? "";
  const t = tracking ?? o.trackingNumber ?? "";

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: "ok", text: ok });
      setNote("");
      await qc.invalidateQueries({ queryKey: ["order", id] });
      void qc.invalidateQueries({ queryKey: ["orders"] });
    } catch (e) {
      setMsg({ tone: "bad", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const patch = (body: Record<string, unknown>, ok: string) => act(() => adminFetch(`/api/admin/orders/${o.id}`, { method: "PATCH", body }), ok);
  const download = async (version: number, kind: string) => {
    try {
      const r = await adminFetch<{ url: string }>(`/api/admin/ops/orders/${o.id}/print/${version}/${kind}`);
      window.location.href = r.url;
    } catch (e) {
      setMsg({ tone: "bad", text: (e as Error).message });
    }
  };

  const moves = (TRANSITIONS[status] ?? []).filter((s) => s !== "paid" && s !== "expired");
  const timeline = [
    ...events.map((e) => ({
      at: e.createdAt,
      what: e.toStatus ? `${STATUS_LABEL[e.toStatus as OrderStatus] ?? e.toStatus}` : e.kind === "note" ? e.note ?? "Note" : e.kind.replace(/_/g, " "),
      who: `${e.actor}${e.toStatus && e.note ? ` · ${e.note}` : ""}`,
      tone: e.kind === "amount_mismatch" ? "#9E1F3B" : e.toStatus ? "#2A1E5C" : "#888F8E",
    })),
    ...notifications.map((n) => ({
      at: n.createdAt,
      what: `${n.channel === "whatsapp" ? "WhatsApp" : "Email"} to ${n.audience === "customer" ? "customer" : n.recipient}: ${n.event.replace(/_/g, " ")}`,
      who: `${n.status}${n.error ? ` · ${n.error}` : ""}`,
      tone: n.status === "failed" ? "#9E1F3B" : "#595080",
    })),
  ].sort((x, y) => y.at.localeCompare(x.at));

  return (
    <>
      <Link href="/orders" className="oc-small" style={{ fontWeight: 600 }}>
        ← Orders
      </Link>
      <div className="oc-head">
        <h1 style={{ flex: "0 1 auto" }}>{o.orderNumber}</h1>
        <Pill tone={stTone}>{st}</Pill>
        {!o.livemode ? <Pill tone="warn">TEST order: never print</Pill> : null}
        <span className="oc-sub" style={{ flex: "1 1 auto" }}>
          "{o.title}" · {o.binding} · {o.pageCount} pages · {o.finish}
          {o.qty > 1 ? ` · ${o.qty} copies` : ""} · {money(o.totalMinor)}
        </span>
      </div>
      {msg ? (
        <p className={`oc-note ${msg.tone}`} role="status">
          {msg.text}
        </p>
      ) : null}

      <div className="oc-row" style={{ alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "999 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
          <section className="oc-card" aria-labelledby="pf">
            <div className="oc-card-head">
              <h2 id="pf">Print file</h2>
              <Pill tone={prTone}>{pr}</Pill>
              {job ? <span className="oc-small">version {job.version}</span> : null}
            </div>
            {!job ? (
              ["paid", "in_production", "shipped", "delivered"].includes(status) ? (
                <div className="oc-row">
                  <span className="oc-sub" style={{ flex: "1 1 240px" }}>
                    Not built yet. The safety check starts it within 10 minutes, or start it now.
                  </span>
                  <button className="oc-btn primary sm" disabled={busy} onClick={() => act(() => adminFetch(`/api/admin/orders/${o.id}/print-files/render`, { method: "POST", body: {} }), "Building the print file. This page refreshes by itself.")}>
                    <RefreshCw size={14} aria-hidden /> Build print file now
                  </button>
                </div>
              ) : (
                <p className="oc-sub">Made once the order is paid.</p>
              )
            ) : (
              <>
                {job.state === "failed" ? <p className="oc-note bad">Failed after {job.attempts} tries: {job.lastError}</p> : null}
                {job.state !== "checked" && job.state !== "failed" ? <p className="oc-sub">Working on it (try {job.attempts}). This page refreshes by itself.</p> : null}
                {(job.files ?? []).map((f) => (
                  <div key={f.kind} className="oc-row" style={{ padding: 12, border: "1px solid #DEE2E1", borderRadius: 10 }}>
                    <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                      <b style={{ color: "#2A1E5C" }}>{f.key.split("/").pop()}</b>
                      <div className="oc-small">
                        {f.kind === "jpegs"
                          ? `${f.pages} JPEGs: front cover, every page by sheet, back cover · 300 dpi`
                          : f.kind === "cover"
                            ? `${f.pages} page${f.pages > 1 ? "s" : ""}${f.pages > 1 ? ": front, back" : ""}`
                            : `${f.pages} page${f.pages > 1 ? "s" : ""}`}{" "}
                        · {(f.bytes / 1e6).toFixed(1)} MB · {f.backupKey ? "2 copies" : "1 copy"}
                      </div>
                      <div className="oc-mono" title={f.sha256} style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                        sha256 {f.sha256.slice(0, 12)}…{f.sha256.slice(-6)}
                      </div>
                    </div>
                    <button className="oc-btn sm" onClick={() => download(job.version, f.kind)}>
                      <Download size={14} aria-hidden /> Download
                    </button>
                  </div>
                ))}
                {job.lowDpiCount ? <p className="oc-note warn">{job.lowDpiCount} photo(s) print below 200 DPI and may look soft. Consider asking the customer for a sharper copy.</p> : null}
                {job.problems?.length ? (
                  <div className="oc-note warn">
                    {job.problems.map((p, i) => (
                      <div key={i}>{p.page >= 0 ? `Page ${p.page + 1}, slot ${p.slot + 1}: ` : ""}{p.reason}</div>
                    ))}
                  </div>
                ) : null}
                {job.state === "checked" ? (
                  <p className="oc-small">
                    Captions, the title page and the cover title use standard fonts in this version. The JPEGs are rendered from the two PDFs, so they match them exactly.
                  </p>
                ) : null}
                <div className="oc-row">
                  <button className="oc-btn sm" disabled={busy} onClick={() => act(() => adminFetch(`/api/admin/orders/${o.id}/print-files/render`, { method: "POST", body: {} }), "Rebuilding as a new version. The old one is kept.")}>
                    <RefreshCw size={14} aria-hidden /> Rebuild as version {(job?.version ?? 0) + 1}
                  </button>
                  {printJobs.length > 1 ? <span className="oc-small">{printJobs.length - 1} older version(s) kept</span> : null}
                </div>
              </>
            )}
          </section>

          <section className="oc-card" aria-labelledby="tl">
            <h2 id="tl">Timeline</h2>
            <form
              className="oc-row"
              onSubmit={(e) => {
                e.preventDefault();
                if (note.trim()) void patch({ note: note.trim() }, "Note added");
              }}
            >
              <label className="oc-sr" htmlFor="note">
                Internal note
              </label>
              <input id="note" className="oc-input" style={{ flex: 1 }} placeholder="Add a note for the team (customers never see it)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
              <button className="oc-btn dark sm" disabled={busy || !note.trim()}>
                Add
              </button>
            </form>
            <ol className="oc-tl">
              {timeline.map((x, i) => (
                <li key={i}>
                  <time className="oc-small">{when(x.at)}</time>
                  <span className="dot" style={{ background: x.tone }} />
                  <span style={{ display: "flex", flexDirection: "column" }}>
                    <b style={{ color: "#2A1E5C", fontWeight: 600 }}>{x.what}</b>
                    <span className="oc-small">{x.who}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div style={{ flex: "1 1 300px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
          <section className="oc-card" aria-labelledby="cu">
            <h2 id="cu">Customer</h2>
            <div>
              <b style={{ fontSize: 16, color: "#2A1E5C" }}>{a.fullName}</b>
              <div className="oc-sub">
                {customer.orders > 1 ? `${customer.orders} orders` : "First order"}
                {customer.spentMinor !== null ? ` · ${money(customer.spentMinor)} paid in total` : ""}
                {customer.since ? ` · since ${day(customer.since)}` : ""}
              </div>
            </div>
            <div style={{ padding: "10px 12px", borderRadius: 10, background: "#FBF6F0", display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="oc-small" style={{ fontWeight: 700 }}>
                PHONE
              </span>
              <b style={{ fontSize: 17, color: "#2A1E5C", letterSpacing: "0.02em" }}>{o.contactPhone}</b>
              <div className="oc-row">
                <a className="oc-btn dark sm" href={`tel:${o.contactPhone}`}>
                  <Phone size={14} aria-hidden /> Call
                </a>
                <a className="oc-btn sm" href={waLink(o.contactPhone)} target="_blank" rel="noreferrer">
                  <MessageCircle size={14} aria-hidden /> WhatsApp
                </a>
                <CopyButton text={o.contactPhone} label="Copy" />
              </div>
              <a href={`mailto:${o.contactEmail}`} className="oc-small">
                {o.contactEmail}
              </a>
            </div>
            <div style={{ padding: "10px 12px", borderRadius: 10, background: "#FBF6F0", display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="oc-small" style={{ fontWeight: 700 }}>
                SHIP TO
              </span>
              <address style={{ fontStyle: "normal", fontSize: 15, lineHeight: "22px", color: "#2A1E5C", whiteSpace: "pre-line" }}>{addressText}</address>
              <div className="oc-row">
                <CopyButton text={addressText} label="Copy address" />
                <a className="oc-btn sm" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([a.line1, a.line2, a.city, "Pakistan"].filter(Boolean).join(", "))}`}>
                  <MapPin size={14} aria-hidden /> Open in Maps
                </a>
              </div>
            </div>
          </section>

          <section className="oc-card" aria-labelledby="dl">
            <div className="oc-card-head">
              <h2 id="dl">Delivery</h2>
              {o.deliverBy ? <Pill tone={new Date(o.deliverBy).getTime() < Date.now() && ["paid", "in_production"].includes(status) ? "bad" : "info"}>Deliver by {day(o.deliverBy)}</Pill> : null}
            </div>
            <label className="oc-field">
              Courier
              <input list="couriers" value={c} onChange={(e) => setCourier(e.target.value)} maxLength={40} />
              <datalist id="couriers">
                <option value="TCS" />
                <option value="Leopards" />
                <option value="PostEx" />
                <option value="M&P" />
                <option value="Trax" />
              </datalist>
            </label>
            <label className="oc-field">
              Tracking number
              <input value={t} onChange={(e) => setTracking(e.target.value)} maxLength={80} />
            </label>
            <div className="oc-row">
              <button className="oc-btn sm" disabled={busy} onClick={() => patch({ courier: c, trackingNumber: t }, "Saved")}>
                Save
              </button>
            </div>
          </section>

          <section className="oc-card" aria-labelledby="mv">
            <h2 id="mv">Move this order</h2>
            {moves.length === 0 ? <p className="oc-sub">No further steps for this order.</p> : null}
            <div className="oc-row">
              {moves.map((to) => (
                <button
                  key={to}
                  className={`oc-btn sm ${to === "cancelled" || to === "refunded" ? "danger" : to === "in_production" || to === "shipped" ? "primary" : ""}`}
                  disabled={busy || (to === "in_production" && !o.livemode) || (to === "shipped" && !t)}
                  title={to === "shipped" && !t ? "Add the tracking number first" : undefined}
                  onClick={() => {
                    if ((to === "cancelled" || to === "refunded") && !window.confirm(`${MOVE_LABEL[to]} for ${o.orderNumber}? The customer will be told.`)) return;
                    void patch({ status: to, courier: c, trackingNumber: t, ...(note.trim() ? { note: note.trim() } : {}) }, `${MOVE_LABEL[to] ?? to}: done`);
                  }}
                >
                  {MOVE_LABEL[to] ?? to}
                </button>
              ))}
            </div>
            <p className="oc-small">Shipped, delivered and cancelled tell the customer by the channels set in Notifications.</p>
          </section>

          {o.paymentProvider === "bank_transfer" && (status === "pending_payment" || status === "expired") ? (
            <section className="oc-card" aria-labelledby="bt" style={{ borderColor: "#2A1E5C" }}>
              <h2 id="bt">Waiting for a bank transfer</h2>
              <p className="oc-sub">Only once {money(o.totalMinor)} is in the account. The customer is then emailed and the print file starts.</p>
              <label className="oc-field">
                Bank reference (optional)
                <input value={bankRef} onChange={(e) => setBankRef(e.target.value)} maxLength={80} />
              </label>
              <button
                className="oc-btn primary"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`Mark ${o.orderNumber} as paid by bank transfer?`)) void act(() => adminFetch(`/api/admin/orders/${o.id}/mark-paid`, { method: "POST", body: bankRef.trim() ? { reference: bankRef.trim() } : {} }), "Marked paid. Confirmation sent and print file started.");
                }}
              >
                Payment received
              </button>
            </section>
          ) : null}

          <section className="oc-card" aria-labelledby="pc">
            <h2 id="pc">Payment</h2>
            <div className="oc-small">
              {o.paymentProvider === "bank_transfer" ? "Bank transfer" : o.paymentProvider === "safepay" ? "Card (Safepay)" : o.paymentProvider}
              {o.paidAt ? ` · paid ${when(o.paidAt)}` : " · not paid"}
            </div>
            {q.data.canSeeMoney ? (
              <div className="oc-small">
                Books {money(o.subtotalMinor)} + shipping {money(o.shippingMinor)} = <b>{money(o.totalMinor)}</b>
              </div>
            ) : null}
            {o.providerRef ? <div className="oc-mono">ref {o.providerRef}</div> : null}
            {me.role === "admin" && q.data.payments.length ? (
              <div className="oc-small">
                {q.data.payments.map((p) => (
                  <div key={p.id}>
                    {p.status} · {money(p.amountMinor)} · via {p.source} · {when(p.createdAt)}
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </>
  );
}
