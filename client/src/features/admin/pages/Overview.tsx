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
import { useAdminQuery, type Overview, type StaffMe } from "../api";
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
