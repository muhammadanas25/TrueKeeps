/**
 * Overview — "what needs me right now?" (canvas board A4Overview).
 *
 * Needs action first, because a small team works an exception queue; then,
 * for the Owner only, four headline numbers against the previous period,
 * revenue per day, where books drop off; for everyone, the print pipeline.
 * Refreshes every minute while open.
 */

import { useState } from "react";
import { Link } from "wouter";
import { AlertTriangle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAdminQuery, type Overview, type StaffMe, type ToSendRow } from "../api";
import { MessageButtons } from "../Messages";
import { ACTION_KIND, ago, delta, money, pct } from "../format";
import { Bars, ErrorNote, Kpi, Legend, Line, Loading, PERIODS, Pill, Seg } from "../parts";

type Period = (typeof PERIODS)[number][0];

export function OverviewPage({ me }: { me: StaffMe }) {
  const [period, setPeriod] = useState<Period>("7d");
  const [test, setTest] = useState(false);
  const q = useAdminQuery<Overview>(["overview", period, test], `/api/admin/ops/overview?period=${period}${test ? "&test=1" : ""}`, { refetchInterval: 60_000 });
  const d = q.data;
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const pipe = (pred: (p: { state: string; status: string }) => boolean) => (d?.pipeline ?? []).filter(pred).reduce((a, p) => a + p.n, 0);
  const pipeline = [
    { label: "Building print file", n: pipe((p) => ["queued", "rendering", "composing", "verifying"].includes(p.state) && p.status === "paid"), tone: "muted" as const },
    { label: "Checked, ready to send", n: pipe((p) => p.state === "checked" && p.status === "paid"), tone: "ok" as const },
    { label: "At the printer", n: pipe((p) => p.status === "in_production"), tone: "info" as const },
    { label: "Shipped", n: pipe((p) => p.status === "shipped"), tone: "info" as const },
    { label: "Delivered (14 days)", n: pipe((p) => p.status === "delivered"), tone: "ok" as const },
    { label: "Print file failed", n: pipe((p) => p.state === "failed"), tone: "bad" as const },
  ];

  return (
    <>
      <div className="oc-head">
        <h1>
          {hello}
          {me.name ? `, ${me.name.split(" ")[0]}` : ""}
        </h1>
        {me.role === "admin" ? <Seg label="Period" value={period} options={PERIODS} onChange={setPeriod} /> : null}
        <label className="oc-check oc-small">
          <input type="checkbox" checked={test} onChange={(e) => setTest(e.target.checked)} /> Include test orders
        </label>
      </div>

      {q.error ? <ErrorNote error={q.error} /> : null}
      {!d ? (
        <Loading />
      ) : (
        <>
          <ToSend />

          <section className="oc-card flush oc-action" aria-labelledby="na">
            <div className="top">
              <AlertTriangle size={18} aria-hidden />
              <h2 id="na">Needs action ({d.actions.length})</h2>
              <span className="oc-small" style={{ marginLeft: "auto", color: "inherit" }}>
                Items drop off once they're dealt with
              </span>
            </div>
            {d.actions.length === 0 ? (
              <p className="oc-note ok" style={{ margin: 12 }}>
                All clear. Nothing is waiting on you.
              </p>
            ) : (
              d.actions.slice(0, 12).map((a, i) => (
                <div className="item" key={`${a.orderId}-${a.kind}-${i}`}>
                  <Link href={`/orders/${a.orderId}`}>
                    <b>{a.orderNumber}</b>
                  </Link>
                  <Pill tone={ACTION_KIND[a.kind][1]}>{ACTION_KIND[a.kind][0]}</Pill>
                  <span className="t">{a.text}</span>
                  <span className="oc-small">{ago(a.since)}</span>
                  <Link className="oc-btn sm" href={`/orders/${a.orderId}`}>
                    Open
                  </Link>
                </div>
              ))
            )}
          </section>

          {d.kpis ? (
            <>
              <div className="oc-grid" style={{ ["--min" as string]: "150px" }}>
                <Kpi label="Revenue" value={money(d.kpis.cur.revenueMinor)} {...tone(delta(d.kpis.cur.revenueMinor, d.kpis.prev.revenueMinor))} />
                <Kpi label="Paid orders" value={d.kpis.cur.orders} {...tone(delta(d.kpis.cur.orders, d.kpis.prev.orders))} />
                <Kpi
                  label="Average order"
                  value={money(d.kpis.cur.orders ? Math.round(d.kpis.cur.revenueMinor / d.kpis.cur.orders) : null)}
                  {...tone(delta(d.kpis.cur.orders ? d.kpis.cur.revenueMinor / d.kpis.cur.orders : 0, d.kpis.prev.orders ? d.kpis.prev.revenueMinor / d.kpis.prev.orders : 0))}
                />
                <Kpi label="Started → paid" value={pct(d.kpis.startToPaid.cur)} delta={`previous: ${pct(d.kpis.startToPaid.prev)}`} />
              </div>
              <section className="oc-card">
                <div className="oc-card-head">
                  <h2>Revenue per day</h2>
                  <Legend items={[{ label: "This period" }, { label: "Previous period", dashed: true }]} />
                </div>
                <Line cur={d.revenue!.cur} prev={d.revenue!.prev} label="Revenue per day, this period against the previous one" />
              </section>
            </>
          ) : null}

          <div className="oc-grid" style={{ ["--min" as string]: "320px" }}>
            {d.funnel ? (
              <section className="oc-card">
                <div className="oc-card-head">
                  <h2>Where books drop off</h2>
                  <Link href="/analytics" className="oc-small">
                    Full funnel
                  </Link>
                </div>
                <Bars items={d.funnel.map((f) => ({ label: f.label, value: f.n }))} />
              </section>
            ) : null}
            <section className="oc-card">
              <div className="oc-card-head">
                <h2>Print pipeline</h2>
                <Link href="/print" className="oc-small">
                  Open print queue
                </Link>
              </div>
              {pipeline.map((p) => (
                <div key={p.label} className="oc-row" style={{ minHeight: 34, borderTop: "1px solid #EAECEC", flexWrap: "nowrap" }}>
                  <Pill tone={p.tone}>{p.n}</Pill>
                  <span>{p.label}</span>
                </div>
              ))}
            </section>
          </div>
        </>
      )}
    </>
  );
}

const tone = (x: { text: string; tone: "ok" | "bad" | "muted" | "warn" | "info" }) => ({ delta: x.text, tone: x.tone });

/**
 * Messages to send (canvas M3, docs/adr/025): each customer message appears
 * here by itself when it is due (order paid, marked shipped, 3 days after
 * delivery) and leaves once someone taps WhatsApp or Email for it. Hidden
 * when there is nothing to send.
 */
function ToSend() {
  const qc = useQueryClient();
  const q = useAdminQuery<{ rows: ToSendRow[] }>(["to-send"], "/api/admin/ops/messages/to-send", { refetchInterval: 60_000 });
  const rows = q.data?.rows ?? [];
  if (!rows.length) return null;
  const refresh = () => void qc.invalidateQueries({ queryKey: ["to-send"] });
  return (
    <section className="oc-card flush oc-tosend" aria-labelledby="ts">
      <div className="oc-card-head" style={{ padding: "14px 16px 8px" }}>
        <h2 id="ts">Messages to send ({rows.length})</h2>
        <span className="oc-small">Each appears on its own: a bank transfer not received in 24 hours, an order paid, shipped, or 3 days after delivery</span>
      </div>
      {rows.map((r) => (
        <div className="oc-tosend-row" key={`${r.orderId}-${r.key}`}>
          <Link href={`/orders/${r.orderId}`}>
            <b>{r.orderNumber}</b>
          </Link>
          <span className="who">
            <b style={{ color: "#2A1E5C" }}>{r.name}</b>
            <span className="oc-small">{r.phone}</span>
          </span>
          <Pill tone={r.key === "bank" ? "bad" : r.key === "confirm" ? "warn" : r.key === "shipped" ? "info" : "ok"}>{r.label}</Pill>
          <span className="since">
            {r.since} {ago(r.sinceAt)} ago
          </span>
          <MessageButtons orderId={r.orderId} msgKey={r.key} whatsappUrl={r.whatsappUrl} mailtoUrl={r.mailtoUrl} text={r.text} name={r.name.split(/\s+/)[0] || "them"} onSent={refresh} size="sm" />
        </div>
      ))}
      <p className="oc-small" style={{ margin: 0, padding: "10px 16px 14px", borderTop: "1px solid #EAECEC" }}>
        A message leaves this list when someone taps WhatsApp or Email for it, or marks it sent on the order page.
      </p>
    </section>
  );
}
