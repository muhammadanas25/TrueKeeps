/**
 * Affiliates (owner only): canvas boards R6Affiliates and R6Affiliate,
 * docs/adr/022.
 *
 *  - AffiliatesPage: KPIs across all affiliates, "Add affiliate" (name, sign-in
 *    email, link name, % or fixed commission, how they're paid), and a table
 *    of everyone with visitors, orders, sales, money waiting and to pay.
 *  - AffiliatePage: one affiliate. Their link, 30-day numbers, every credited
 *    order with its commission state, and monthly payouts with "Mark paid".
 *
 * The rules (30-day window, hold after delivery, payout day) live in
 * shared/affiliates.ts; the server works out every number.
 */

import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { AFFILIATE_CODE_RE, PAYOUT_METHOD_LABEL, PAYOUT_METHODS, commissionFor, normalizeRef, type CommissionKind, type PayoutMethod } from "@shared/affiliates";
import { adminFetch, useAdminQuery } from "../api";
import { day, money } from "../format";
import { ErrorNote, Kpi, Loading, Pill } from "../parts";

/* ── types ─────────────────────────────────────────────────────── */

interface AffiliateRow {
  id: string;
  code: string;
  name: string;
  email: string;
  channel: string | null;
  commissionKind: CommissionKind;
  commissionValue: number;
  commission: string;
  payoutMethod: PayoutMethod;
  payoutAccount: string | null;
  active: boolean;
  note: string | null;
  link: string;
  signedIn: boolean;
  createdAt: string;
}

interface ListResponse {
  kpis: { orders30: number; allOrders30: number; sales30: number; waiting: number; toPay: number; toPayCount: number; nextDue: string | null; paidOut: number };
  rows: Array<AffiliateRow & { visitors30: number; orders: number; sales: number; waiting: number; toPay: number }>;
}

interface DetailResponse {
  affiliate: AffiliateRow;
  kpis: { visitors30: number; started30: number; orders30: number; sales30: number; waiting: number; toPay: number; nextDue: string | null; paidOut: number };
  lines: Array<{ id: string; orderId: string; orderNumber: string; kind: string; paidAt: string | null; book: string; status: string; base: number; amount: number; state: string; label: string }>;
  due: Array<{ period: string; label: string; amount: number; ownAmount: number; lines: number; due: string; canPay: boolean }>;
  payouts: Array<{ id: string; period: string; label: string; amount: number; lines: number; method: string; reference: string; paidBy: string | null; paidAt: string }>;
  rules: { holdDays: number; payoutDay: number; windowDays: number };
}

const STATE_TONE: Record<string, "ok" | "warn" | "bad" | "info" | "muted"> = {
  waiting: "warn",
  hold: "info",
  approved: "ok",
  paid: "muted",
  reversed: "bad",
  taken_back: "bad",
};

const signedMoney = (minor: number) => (minor < 0 ? `− ${money(-minor)}` : money(minor));
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 1000) / 10}%` : "—");

/* ── the form (add and edit) ───────────────────────────────────── */

type Draft = { name: string; email: string; code: string; channel: string; kind: CommissionKind; value: string; method: PayoutMethod; account: string; note: string; active: boolean };
const EMPTY: Draft = { name: "", email: "", code: "", channel: "", kind: "percent", value: "10", method: "jazzcash", account: "", note: "", active: true };

const toDraft = (a: AffiliateRow): Draft => ({
  name: a.name,
  email: a.email,
  code: a.code,
  channel: a.channel ?? "",
  kind: a.commissionKind,
  value: String(a.commissionKind === "fixed" ? a.commissionValue / 100 : a.commissionValue),
  method: a.payoutMethod,
  account: a.payoutAccount ?? "",
  note: a.note ?? "",
  active: a.active,
});

const toBody = (d: Draft) => ({
  name: d.name.trim(),
  email: d.email.trim().toLowerCase(),
  code: normalizeRef(d.code),
  channel: d.channel.trim() || null,
  commissionKind: d.kind,
  commissionValue: d.kind === "fixed" ? Math.round(Number(d.value) * 100) : Math.round(Number(d.value)),
  payoutMethod: d.method,
  payoutAccount: d.account.trim() || null,
  note: d.note.trim() || null,
  active: d.active,
});

/** Example earnings under the form, on a typical Rs 7,340 book. */
function example(d: Draft) {
  const body = toBody(d);
  if (!(body.commissionValue > 0)) return "";
  if (d.kind === "fixed") return `They earn ${money(body.commissionValue)} for every paid book, whatever its size.`;
  return `On a Rs 7,340 book they earn ${money(commissionFor(body, 734000))}. Shipping is never counted.`;
}

function AffiliateForm({ initial, id, onDone, onCancel }: { initial: Draft; id?: string; onDone: (a: AffiliateRow) => void; onCancel: () => void }) {
  const [d, setD] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));

  const save = async () => {
    const body = toBody(d);
    if (body.name.length < 2) return setErr("Enter their name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return setErr("Enter the email they will sign in with.");
    if (!AFFILIATE_CODE_RE.test(body.code)) return setErr("The link name needs 2 to 32 lower-case letters, digits or dashes.");
    if (!(body.commissionValue > 0)) return setErr(d.kind === "percent" ? "Enter a percentage." : "Enter an amount in rupees.");
    setBusy(true);
    setErr(null);
    try {
      const a = await adminFetch<AffiliateRow>(id ? `/api/admin/affiliates/${id}` : "/api/admin/affiliates", { method: id ? "PATCH" : "POST", body: id ? body : { ...body, sendWelcome: true } });
      onDone(a);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="oc-card" aria-labelledby="af-form" style={{ borderColor: "#2A1E5C" }}>
      <h2 id="af-form">{id ? `Edit ${initial.name}` : "New affiliate"}</h2>
      <div className="oc-grid" style={{ ["--min" as string]: "220px", marginTop: 10 }}>
        <label className="oc-field">
          Name
          <input value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="Mahnoor Khan" maxLength={80} />
        </label>
        <label className="oc-field">
          Email (they sign in with this)
          <input type="email" value={d.email} onChange={(e) => set({ email: e.target.value })} placeholder="name@gmail.com" maxLength={120} />
        </label>
        <label className="oc-field">
          Link name
          <input value={d.code} onChange={(e) => set({ code: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} placeholder="mahnoor" maxLength={32} />
          <span className="oc-small" style={{ fontWeight: 400 }}>
            thetruekeeps.com/?ref=<b>{d.code || "name"}</b>
          </span>
        </label>
        <label className="oc-field">
          Where they post <span className="oc-small">(optional)</span>
          <input value={d.channel} onChange={(e) => set({ channel: e.target.value })} placeholder="Instagram · 41k" maxLength={80} />
        </label>
      </div>
      <div className="oc-row" style={{ marginTop: 12, alignItems: "flex-end", gap: 12 }}>
        <div className="oc-field" role="group" aria-label="Commission type">
          Commission
          <span className="oc-seg">
            {(
              [
                ["percent", "% of order"],
                ["fixed", "Fixed per order"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={d.kind === k} onClick={() => set({ kind: k, value: k === "percent" ? "10" : "500" })}>
                {l}
              </button>
            ))}
          </span>
        </div>
        <label className="oc-field">
          {d.kind === "percent" ? "Percent (1 to 50)" : "Rupees per order"}
          <input inputMode="numeric" style={{ width: 140 }} value={d.value} onChange={(e) => set({ value: e.target.value.replace(/[^\d.]/g, "") })} />
        </label>
        <label className="oc-field">
          Paid by
          <select value={d.method} onChange={(e) => set({ method: e.target.value as PayoutMethod })}>
            {PAYOUT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYOUT_METHOD_LABEL[m]}
              </option>
            ))}
          </select>
        </label>
        <label className="oc-field">
          {d.method === "bank" ? "Bank, account name and IBAN" : "Wallet number"}
          <input value={d.account} onChange={(e) => set({ account: e.target.value })} placeholder={d.method === "bank" ? "Meezan · M Khan · PK36…" : "0300 1234567"} maxLength={120} />
        </label>
      </div>
      <p className="oc-sub" style={{ margin: "10px 0 0" }}>
        {example(d)}
      </p>
      <label className="oc-field" style={{ marginTop: 10 }}>
        Note for the team <span className="oc-small">(optional)</span>
        <input value={d.note} onChange={(e) => set({ note: e.target.value })} maxLength={300} />
      </label>
      <div className="oc-row" style={{ marginTop: 12 }}>
        <button className="oc-btn primary" disabled={busy} onClick={() => void save()}>
          {id ? "Save changes" : "Create and email them their link"}
        </button>
        <button className="oc-btn link" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {err ? (
        <p className="oc-note bad" role="alert" style={{ marginTop: 10 }}>
          {err}
        </p>
      ) : null}
    </section>
  );
}

function CopyLink({ link }: { link: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="oc-btn sm"
      onClick={() => {
        void navigator.clipboard?.writeText(link).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      <Copy size={14} aria-hidden="true" /> {done ? "Copied" : "Copy link"}
    </button>
  );
}

/* ── list ──────────────────────────────────────────────────────── */

export function AffiliatesPage() {
  const qc = useQueryClient();
  const q = useAdminQuery<ListResponse>(["admin", "affiliates"], "/api/admin/affiliates");
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<AffiliateRow | null>(null);
  const k = q.data?.kpis;

  return (
    <>
      <div className="oc-head">
        <h1>Affiliates</h1>
        {!adding ? (
          <button className="oc-btn primary" onClick={() => setAdding(true)}>
            Add affiliate
          </button>
        ) : null}
      </div>
      <p className="oc-sub">People who share a TrueKeeps link and earn on the books it brings. Customers pay the normal price.</p>

      {k ? (
        <div className="oc-grid" style={{ ["--min" as string]: "170px" }}>
          <Kpi label="Orders from affiliates, 30 days" value={k.orders30} delta={`${pct(k.orders30, k.allOrders30)} of all paid orders`} />
          <Kpi label="Sales from affiliates, 30 days" value={money(k.sales30)} delta="book totals, live orders" />
          <Kpi label="Commission waiting" value={money(k.waiting)} delta="not yet delivered + hold" tone="warn" />
          <Kpi label={k.nextDue ? `To pay on ${day(k.nextDue)}` : "To pay"} value={signedMoney(k.toPay)} delta={`${k.toPayCount} ${k.toPayCount === 1 ? "affiliate" : "affiliates"}`} tone="ok" />
          <Kpi label="Paid out so far" value={money(k.paidOut)} delta="since launch" />
        </div>
      ) : null}

      {adding ? (
        <AffiliateForm
          initial={EMPTY}
          onCancel={() => setAdding(false)}
          onDone={(a) => {
            setAdding(false);
            setCreated(a);
            void qc.invalidateQueries({ queryKey: ["admin", "affiliates"] });
          }}
        />
      ) : null}
      {created ? (
        <p className="oc-note ok" role="status">
          {created.name} added. We emailed their link to {created.email}: <b>{created.link}</b>
        </p>
      ) : null}

      <section className="oc-card flush" aria-labelledby="af-list">
        <div className="oc-card-head" style={{ padding: "14px 16px 0" }}>
          <h2 id="af-list">Everyone</h2>
        </div>
        {q.isLoading ? <Loading /> : q.error ? <ErrorNote error={q.error} /> : null}
        {q.data && !q.data.rows.length ? <p className="oc-sub" style={{ padding: "0 16px 16px" }}>No affiliates yet. Add the first one above.</p> : null}
        {q.data?.rows.length ? (
          <div className="oc-table-wrap">
            <table className="oc-table">
              <thead>
                <tr>
                  <th>Affiliate</th>
                  <th>Link</th>
                  <th>Commission</th>
                  <th className="num">Visitors, 30 d</th>
                  <th className="num">Orders</th>
                  <th className="num">Sales</th>
                  <th className="num">Waiting</th>
                  <th className="num">To pay</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {q.data.rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/affiliates/${r.id}`}>
                        <b>{r.name}</b>
                      </Link>
                      {r.channel ? <div className="oc-small">{r.channel}</div> : null}
                    </td>
                    <td className="oc-mono" style={{ whiteSpace: "nowrap" }}>?ref={r.code}</td>
                    <td>{r.commissionKind === "percent" ? `${r.commissionValue}%` : `${money(r.commissionValue)} / order`}</td>
                    <td className="num">{r.visitors30.toLocaleString("en-US")}</td>
                    <td className="num">{r.orders}</td>
                    <td className="num">
                      <b>{money(r.sales)}</b>
                    </td>
                    <td className="num oc-tone-warn">{money(r.waiting)}</td>
                    <td className="num oc-tone-ok">
                      <b>{signedMoney(r.toPay)}</b>
                    </td>
                    <td>{r.active ? <Pill tone="ok">Active</Pill> : <Pill tone="muted">Paused</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      <p className="oc-small">“Waiting” is commission on orders not yet delivered, or delivered within the hold. “To pay” is approved and goes into the next monthly payout.</p>
    </>
  );
}

/* ── one affiliate ─────────────────────────────────────────────── */

function PayoutRow({ affiliateId, row, method, onPaid }: { affiliateId: string; row: DetailResponse["due"][number]; method: string; onPaid: () => void }) {
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pay = async () => {
    setBusy(true);
    setErr(null);
    try {
      await adminFetch(`/api/admin/affiliates/${affiliateId}/payouts`, { method: "POST", body: { period: row.period, reference: ref.trim() } });
      onPaid();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="oc-row" style={{ padding: "12px 16px", borderTop: "1px solid #EAECEC", gap: 12 }}>
      <b style={{ width: 130, color: "#2A1E5C" }}>{row.label}</b>
      <span style={{ width: 90 }}>{row.lines === 1 ? "1 line" : `${row.lines} lines`}</span>
      <b style={{ width: 110, color: (row.canPay ? row.amount : row.ownAmount) < 0 ? "#9E1F3B" : "#2A1E5C" }}>{signedMoney(row.canPay ? row.amount : row.ownAmount)}</b>
      {row.canPay ? (
        <>
          <span className="oc-small" style={{ flex: "1 1 160px" }}>
            Due {day(row.due)}
            {row.amount !== row.ownAmount ? `, includes ${money(row.amount - row.ownAmount)} carried from earlier months` : ""}
          </span>
          <label className="oc-field" style={{ fontSize: 12 }}>
            {method} reference
            <input value={ref} onChange={(e) => setRef(e.target.value)} style={{ minHeight: 36 }} maxLength={80} />
          </label>
          <button className="oc-btn primary" disabled={busy || ref.trim().length < 2} onClick={() => void pay()}>
            Mark paid
          </button>
        </>
      ) : (
        <span className="oc-small" style={{ flex: "1 1 200px" }}>
          {row.ownAmount < 0 ? "Taken back after a refund; comes off the next payout." : row.amount <= 0 ? "Nothing to pay: refunds taken back are larger. The balance carries over." : `Still building up this month. Due ${day(row.due)}.`}
        </span>
      )}
      {err ? (
        <p className="oc-note bad" style={{ flexBasis: "100%" }}>
          {err}
        </p>
      ) : null}
    </div>
  );
}

export function AffiliatePage({ id }: { id: string }) {
  const qc = useQueryClient();
  const q = useAdminQuery<DetailResponse>(["admin", "affiliate", id], `/api/admin/affiliates/${id}`);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin", "affiliate", id] });
    void qc.invalidateQueries({ queryKey: ["admin", "affiliates"] });
  };

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorNote error={q.error} />;
  const { affiliate: a, kpis: k, lines, due, payouts, rules } = q.data;
  const method = PAYOUT_METHOD_LABEL[a.payoutMethod] ?? a.payoutMethod;

  const togglePause = async () => {
    setBusy(true);
    try {
      await adminFetch(`/api/admin/affiliates/${a.id}`, { method: "PATCH", body: { ...toBody(toDraft(a)), active: !a.active } });
      refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Link href="/affiliates" className="oc-small" style={{ fontWeight: 600 }}>
        ← Affiliates
      </Link>
      <div className="oc-head">
        <h1 style={{ flex: "0 1 auto" }}>{a.name}</h1>
        {a.active ? <Pill tone="ok">Active</Pill> : <Pill tone="muted">Paused</Pill>}
        <span className="oc-sub">
          {a.commission} · paid by {method} {a.payoutAccount ?? ""} · since {day(a.createdAt)}
          {a.signedIn ? " · has signed in" : ""}
        </span>
        <span style={{ flex: 1 }} />
        <button className="oc-btn" onClick={() => setEditing((e) => !e)}>
          Edit
        </button>
        <button className={`oc-btn ${a.active ? "danger" : ""}`} disabled={busy} onClick={() => void togglePause()}>
          {a.active ? "Pause" : "Resume"}
        </button>
      </div>
      {!a.active ? <p className="oc-note warn">Paused: their link no longer credits new taps or orders. Orders already credited still pay out.</p> : null}

      {editing ? (
        <AffiliateForm
          id={a.id}
          initial={toDraft(a)}
          onCancel={() => setEditing(false)}
          onDone={() => {
            setEditing(false);
            refresh();
          }}
        />
      ) : null}

      <div className="oc-row" style={{ padding: "12px 16px", borderRadius: 14, background: "#EEEDF2", gap: 10 }}>
        <b style={{ color: "#2A1E5C" }}>Their link</b>
        <code style={{ flex: "1 1 260px", color: "#2A1E5C", wordBreak: "break-all" }}>{a.link}</code>
        <CopyLink link={a.link} />
        <span className="oc-small">Works on any page, e.g. /photo-books?ref={a.code}</span>
      </div>

      <div className="oc-grid" style={{ ["--min" as string]: "160px" }}>
        <Kpi label="Visitors from the link" value={k.visitors30.toLocaleString("en-US")} delta={`last ${rules.windowDays} days`} />
        <Kpi label="Started a book" value={k.started30} delta={`${pct(k.started30, k.visitors30)} of visitors`} />
        <Kpi label="Paid orders" value={k.orders30} delta={`${pct(k.orders30, k.visitors30)} of visitors`} />
        <Kpi label="Sales" value={money(k.sales30)} delta="book totals, 30 days" />
        <Kpi label="Waiting" value={money(k.waiting)} delta="not yet payable" tone="warn" />
        <Kpi label={k.nextDue ? `To pay on ${day(k.nextDue)}` : "To pay"} value={signedMoney(k.toPay)} delta="approved" tone="ok" />
      </div>

      <section className="oc-card flush" aria-labelledby="af-orders">
        <div className="oc-card-head" style={{ padding: "14px 16px 0" }}>
          <h2 id="af-orders">Orders credited to {a.name.split(/\s+/)[0]}</h2>
        </div>
        {!lines.length ? <p className="oc-sub" style={{ padding: "0 16px 16px" }}>No orders yet. Paid orders through their link appear here.</p> : null}
        {lines.length ? (
          <div className="oc-table-wrap">
            <table className="oc-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Paid</th>
                  <th>Book</th>
                  <th>Order status</th>
                  <th className="num">Book total</th>
                  <th className="num">Commission</th>
                  <th>Commission status</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <Link href={`/orders/${l.orderId}`}>
                        <b>{l.orderNumber}</b>
                      </Link>
                    </td>
                    <td className="oc-small">{day(l.paidAt)}</td>
                    <td>{l.book}</td>
                    <td>{l.status.replace(/_/g, " ")}</td>
                    <td className="num">{money(l.base)}</td>
                    <td className="num">
                      {l.state === "reversed" ? <s className="oc-small">{money(l.amount)}</s> : <b>{signedMoney(l.amount)}</b>}
                    </td>
                    <td>
                      <Pill tone={STATE_TONE[l.state] ?? "muted"}>{l.label}</Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <p className="oc-small" style={{ padding: "10px 16px 14px", margin: 0, borderTop: "1px solid #EAECEC" }}>
          Commission is on the book total before shipping, after any promo code. It becomes payable {rules.holdDays} days after delivery. A cancelled or refunded order takes it back, even if it
          was already paid out: it comes off the next payout.
        </p>
      </section>

      <section className="oc-card flush" aria-labelledby="af-pay">
        <div className="oc-card-head" style={{ padding: "14px 16px 6px" }}>
          <h2 id="af-pay">Monthly payouts</h2>
          <span className="oc-small">Made on the {rules.payoutDay}th for everything approved by the end of last month</span>
        </div>
        {!due.length && !payouts.length ? <p className="oc-sub" style={{ padding: "0 16px 16px" }}>Nothing approved yet.</p> : null}
        {due.map((d) => (
          <PayoutRow key={d.period} affiliateId={a.id} row={d} method={method} onPaid={refresh} />
        ))}
        {payouts.map((p) => (
          <div key={p.id} className="oc-row" style={{ padding: "12px 16px", borderTop: "1px solid #EAECEC", gap: 12 }}>
            <b style={{ width: 130, color: "#2A1E5C" }}>{p.label}</b>
            <span style={{ width: 90 }}>{p.lines === 1 ? "1 line" : `${p.lines} lines`}</span>
            <b style={{ width: 110, color: "#2A1E5C" }}>{money(p.amount)}</b>
            <span className="oc-small" style={{ flex: "1 1 200px" }}>
              Paid {day(p.paidAt)} by {p.method} · ref {p.reference}
              {p.paidBy ? ` · ${p.paidBy}` : ""}
            </span>
            <Pill tone="ok">Paid</Pill>
          </div>
        ))}
      </section>
    </>
  );
}
