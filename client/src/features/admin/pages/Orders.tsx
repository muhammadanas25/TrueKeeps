/**
 * Orders — an exception-first list (canvas board A4Orders).
 *
 * Opens on "Needs action". Search matches order number, name, email, city and
 * phone (any 4+ digits, so "0300 1234567", "+92 300…" and "1234567" all find
 * the same customer). Every row shows the full phone and where it ships,
 * because "where is my order?" arrives on WhatsApp with nothing but a number.
 * Tick rows to send several paid orders to the printer at once.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { adminFetch, useAdminQuery, type OrderList, type StaffMe } from "../api";
import { ago, day, money, printTone, STATUS } from "../format";
import { ErrorNote, Loading, Pill } from "../parts";

const VIEWS = [
  ["action", "Needs action"],
  ["transfer", "Awaiting transfer"],
  ["ready", "Paid, to print"],
  ["printer", "At printer"],
  ["shipped", "Shipped"],
  ["all", "All"],
] as const;
type View = (typeof VIEWS)[number][0];

export function OrdersPage({ me }: { me: StaffMe }) {
  const [view, setView] = useState<View>("action");
  const [typed, setTyped] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [test, setTest] = useState(false);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(typed.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [typed]);

  const url = `/api/admin/ops/orders?view=${q ? "all" : view}&page=${page}${q ? `&q=${encodeURIComponent(q)}` : ""}${test ? "&test=1" : ""}`;
  const list = useAdminQuery<OrderList>(["orders", view, q, page, test], url);
  const rows = list.data?.rows ?? [];
  const chosen = useMemo(() => rows.filter((r) => sel[r.id]), [rows, sel]);
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;

  const sendToPrinter = async () => {
    setBusy(true);
    setMsg(null);
    let ok = 0;
    const failed: string[] = [];
    for (const r of chosen) {
      try {
        await adminFetch(`/api/admin/orders/${r.id}`, { method: "PATCH", body: { status: "in_production", note: "Sent to printer (bulk)" } });
        ok++;
      } catch (e) {
        failed.push(`${r.orderNumber}: ${(e as Error).message}`);
      }
    }
    setBusy(false);
    setSel({});
    setMsg(`${ok} sent to the printer.${failed.length ? ` Not sent: ${failed.join("; ")}` : ""}`);
    void qc.invalidateQueries({ queryKey: ["orders"] });
  };

  return (
    <>
      <div className="oc-head">
        <h1>Orders</h1>
        <label className="oc-check oc-small">
          <input type="checkbox" checked={test} onChange={(e) => setTest(e.target.checked)} /> Include test orders
        </label>
        {me.role === "admin" ? (
          <a className="oc-btn" href={`/api/admin/ops/export/orders.csv?period=90d${test ? "&test=1" : ""}`}>
            Export CSV (90 days)
          </a>
        ) : null}
      </div>

      <div className="oc-tabs" role="tablist" aria-label="Saved views">
        {VIEWS.map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={!q && view === k}
            onClick={() => {
              setView(k);
              setTyped("");
              setPage(1);
              setSel({});
            }}
          >
            {label}
            {list.data?.counts?.[k] !== undefined ? <span className="n">{list.data.counts[k]}</span> : null}
          </button>
        ))}
      </div>

      <label className="oc-row" style={{ minHeight: 44, padding: "0 12px", border: "1.5px solid #888F8E", borderRadius: 10, background: "#fff", flexWrap: "nowrap" }}>
        <Search size={16} aria-hidden color="#595080" />
        <span className="oc-sr">Search orders</span>
        <input
          type="search"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Order number, name, phone, email or city"
          style={{ flex: 1, border: "none", outline: "none", background: "transparent", minHeight: 40, minWidth: 0 }}
        />
      </label>

      {chosen.length ? (
        <div className="oc-row" style={{ padding: "10px 14px", borderRadius: 12, background: "#2A1E5C", color: "#fff" }}>
          <b>{chosen.length} selected</b>
          <button className="oc-btn primary sm" disabled={busy} onClick={sendToPrinter}>
            Send to printer
          </button>
          <button className="oc-btn link sm" style={{ color: "#fff", marginLeft: "auto" }} onClick={() => setSel({})}>
            Clear
          </button>
        </div>
      ) : null}
      {msg ? <p className="oc-note info">{msg}</p> : null}

      {list.error ? <ErrorNote error={list.error} /> : null}
      {!list.data ? (
        <Loading />
      ) : (
        <section className="oc-card flush">
          <div className="oc-table-wrap">
            <table className="oc-table" style={{ minWidth: 1080 }}>
              <thead>
                <tr>
                  <th>
                    <span className="oc-sr">Select</span>
                  </th>
                  <th>Order</th>
                  <th>Deliver by</th>
                  <th>Customer</th>
                  <th>Ship to</th>
                  <th>Book</th>
                  <th className="num">Total</th>
                  <th>Status</th>
                  <th>Print file</th>
                  <th>Age</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="oc-empty">
                      {q ? "No orders match." : view === "action" ? "Nothing needs action. Nice." : "No orders here."}
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const [st, stTone] = STATUS[r.status] ?? [r.status, "muted"];
                    const [pr, prTone] = printTone(r.print?.state, r.print?.problems);
                    const late = r.deliverBy && new Date(r.deliverBy).getTime() < Date.now() + 86400_000 && ["paid", "in_production"].includes(r.status);
                    return (
                      <tr key={r.id} className={sel[r.id] ? "sel" : ""}>
                        <td>
                          <input type="checkbox" aria-label={`Select ${r.orderNumber}`} checked={Boolean(sel[r.id])} onChange={() => setSel({ ...sel, [r.id]: !sel[r.id] })} style={{ width: 18, height: 18, accentColor: "#2A1E5C" }} />
                        </td>
                        <td>
                          <Link href={`/orders/${r.id}`}>
                            <b>{r.orderNumber}</b>
                          </Link>
                          {!r.livemode ? <div><Pill tone="warn">TEST</Pill></div> : null}
                        </td>
                        <td className={late ? "oc-tone-bad" : ""} style={{ fontWeight: 600 }}>
                          {r.deliverBy ? day(r.deliverBy) : "once paid"}
                        </td>
                        <td>
                          <div className="stack">
                            <b style={{ color: "#2A1E5C", fontWeight: 600 }}>
                              {r.customer || "—"}
                              {r.gift ? (
                                <span className="oc-small" style={{ marginLeft: 6, fontWeight: 700, color: "#A5324A" }}>
                                  GIFT
                                </span>
                              ) : null}
                            </b>
                            <a href={`tel:${r.phone}`} className="oc-small" style={{ color: "#404442" }}>
                              {r.phone}
                            </a>
                          </div>
                        </td>
                        <td>
                          <div className="stack">
                            <span>{r.city}</span>
                            <span className="oc-small">{r.area}</span>
                          </div>
                        </td>
                        <td>{r.book}</td>
                        <td className="num">
                          <b style={{ color: "#2A1E5C" }}>{money(r.total)}</b>
                        </td>
                        <td>
                          <Pill tone={stTone}>{st}</Pill>
                          {r.paymentProvider === "bank_transfer" ? <div className="oc-small">bank transfer</div> : null}
                        </td>
                        <td>
                          <Pill tone={prTone}>{pr}</Pill>
                        </td>
                        <td className="oc-small">{ago(r.paidAt ?? r.createdAt)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <div className="oc-row oc-small" style={{ justifyContent: "space-between" }}>
        <span>
          {list.data?.total ?? 0} orders · page {page} of {pages}
        </span>
        <span className="oc-row">
          <button className="oc-btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <button className="oc-btn sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Next
          </button>
        </span>
      </div>
    </>
  );
}
