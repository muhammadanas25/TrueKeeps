/**
 * Analytics, Owner only (canvas boards A4Analytics, A4Funnel, A4Experience,
 * A4Audience). One page, six tabs, each reading its own endpoint under
 * /api/admin/ops/analytics. Test orders are left out unless asked for.
 *
 *  Sales       revenue and orders vs the previous period, by binding,
 *              payment method, city, page count, occasion; refunds; repeat buyers
 *  Funnel      builder steps as bars (Mixpanel-style): % of starters left at
 *              each step, step-to-step conversion, median active time, a
 *              breakdown by device / OS / browser / source / first visit, and
 *              a click on any step to see who was lost there
 *  Audience    device, OS (Android vs iPhone vs Windows vs Mac), browser,
 *              screen size, sources — each with how many went on to start
 *  Internet    connection types; download speed measured on the page;
 *              upload speed from real photo uploads; slowest 1 in 10
 *  Speed       server p50 / p90 / p95 / p99 per request (red past its limit),
 *              Google's speed scores per device
 *  Experience  time on each page, where people leave, errors, rage taps
 */

import { useState } from "react";
import { FUNNEL_STEPS } from "@shared/ops";
import { useAdminQuery } from "../api";
import { delta, money, ms, pct, secs } from "../format";
import { Bars, ErrorNote, Kpi, Legend, Line, Loading, PERIODS, Pill, Seg } from "../parts";

type Period = (typeof PERIODS)[number][0];
type R = Record<string, unknown>;
const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

const TABS = [
  ["sales", "Sales"],
  ["funnel", "Funnel"],
  ["audience", "Audience"],
  ["network", "Internet speed"],
  ["speed", "Server speed"],
  ["experience", "Experience"],
] as const;
type Tab = (typeof TABS)[number][0];

export function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>("sales");
  const [period, setPeriod] = useState<Period>("30d");
  const [test, setTest] = useState(false);
  const qs = `period=${period}${test ? "&test=1" : ""}`;
  return (
    <>
      <div className="oc-head">
        <h1>Analytics</h1>
        <Seg label="Period" value={period} options={PERIODS} onChange={setPeriod} />
        <label className="oc-check oc-small">
          <input type="checkbox" checked={test} onChange={(e) => setTest(e.target.checked)} /> Include test orders
        </label>
      </div>
      <div className="oc-utabs" role="tablist" aria-label="Reports">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      {tab === "sales" ? <Sales qs={qs} /> : null}
      {tab === "funnel" ? <Funnel qs={qs} /> : null}
      {tab === "audience" ? <Audience qs={qs} /> : null}
      {tab === "network" ? <Network qs={qs} /> : null}
      {tab === "speed" ? <Speed qs={qs} /> : null}
      {tab === "experience" ? <Experience qs={qs} /> : null}
    </>
  );
}

function useReport<T = R>(name: string, qs: string) {
  return useAdminQuery<T>(["analytics", name, qs], `/api/admin/ops/analytics/${name}?${qs}`);
}

const groupBars = (list: R[] | undefined, value: (r: R) => number, shown: (r: R) => string) =>
  (list ?? []).map((r) => ({ label: String(r.k ?? "—"), value: value(r), shown: shown(r) }));

/* ── Sales ─────────────────────────────────────────────────────── */

function Sales({ qs }: { qs: string }) {
  const q = useReport<R & { cur: { orders: number; revenueMinor: number }; prev: { orders: number; revenueMinor: number }; daily: { cur: number[]; prev: number[] } }>("sales", qs);
  if (q.error) return <ErrorNote error={q.error} />;
  if (!q.data) return <Loading />;
  const d = q.data;
  const aov = (x: { orders: number; revenueMinor: number }) => (x.orders ? x.revenueMinor / x.orders : 0);
  const rep = d.repeat as { repeat: number; buyers: number } | undefined;
  const ref = d.refunds as { n: number; minor: number };
  const money_ = (r: R) => money(n(r.revenue));
  return (
    <>
      <p className="oc-sub">Paid live orders only (test orders when ticked). Refunded and cancelled orders are not counted as revenue.</p>
      <div className="oc-grid" style={{ ["--min" as string]: "150px" }}>
        <Kpi label="Revenue" value={money(d.cur.revenueMinor)} delta={delta(d.cur.revenueMinor, d.prev.revenueMinor).text} tone={delta(d.cur.revenueMinor, d.prev.revenueMinor).tone} />
        <Kpi label="Paid orders" value={d.cur.orders} delta={delta(d.cur.orders, d.prev.orders).text} tone={delta(d.cur.orders, d.prev.orders).tone} />
        <Kpi label="Average order" value={money(Math.round(aov(d.cur)))} delta={delta(aov(d.cur), aov(d.prev)).text} tone={delta(aov(d.cur), aov(d.prev)).tone} />
        <Kpi label="Refunded" value={money(ref.minor)} delta={`${ref.n} order(s)`} />
        <Kpi label="Buyers who came back" value={rep && rep.buyers ? pct(rep.repeat / rep.buyers, 0) : "—"} delta={rep ? `${rep.repeat} of ${rep.buyers} buyers, all time` : ""} />
      </div>
      <section className="oc-card">
        <div className="oc-card-head">
          <h2>Revenue per day</h2>
          <Legend items={[{ label: "This period" }, { label: "Previous period", dashed: true }]} />
        </div>
        <Line cur={d.daily.cur} prev={d.daily.prev} label="Revenue per day against the previous period" height={200} />
      </section>
      <div className="oc-grid" style={{ ["--min" as string]: "340px" }}>
        <section className="oc-card">
          <h2>By binding</h2>
          <Bars items={groupBars(d.byBinding as R[], (r) => n(r.revenue), money_)} />
        </section>
        <section className="oc-card">
          <h2>By payment method</h2>
          <Bars items={groupBars(d.byPayment as R[], (r) => n(r.n), (r) => `${n(r.n)} · ${money_(r)}`)} />
        </section>
        <section className="oc-card">
          <h2>By city</h2>
          <Bars items={groupBars((d.byCity as R[]).slice(0, 8), (r) => n(r.n), (r) => `${n(r.n)} orders`)} />
        </section>
        <section className="oc-card">
          <h2>By book size</h2>
          <Bars items={groupBars(d.byPages as R[], (r) => n(r.n), (r) => `${n(r.n)} orders`)} />
        </section>
        <section className="oc-card">
          <h2>By occasion</h2>
          <Bars items={groupBars(d.byOccasion as R[], (r) => n(r.n), (r) => `${n(r.n)} orders`)} />
        </section>
        <section className="oc-card">
          <h2>How books were made</h2>
          <Bars items={groupBars((d.byMade as R[]) ?? [], (r) => n(r.n), (r) => `${n(r.n)} orders · ${money_(r)}`)} />
          <p className="oc-small">"Customised" means at least one change in the editor: layout, photos, text, colour or framing.</p>
        </section>
      </div>
    </>
  );
}

/* ── Funnel ────────────────────────────────────────────────────── */

const SPLITS = [
  ["none", "Nothing"],
  ["device", "Device"],
  ["os", "Android / iPhone / …"],
  ["browser", "Browser"],
  ["source", "Where they came from"],
  ["visitor", "First visit or back"],
] as const;
const SERIES = ["#2A1E5C", "#5E4FA8", "#9C8FD0", "#C9C1EA"];
const TTP_LABELS = ["under 10 min", "10–30 min", "30–60 min", "1–6 h", "6–24 h", "1–3 days", "3+ days"];

function Funnel({ qs }: { qs: string }) {
  const [split, setSplit] = useState<(typeof SPLITS)[number][0]>("none");
  const [step, setStep] = useState(1);
  const q = useReport<{ steps: typeof FUNNEL_STEPS; groups: Array<{ name: string; counts: number[] }>; time: R[]; timeToPaid: R[]; books: Array<{ label: string; n: number }>; trend: R[] }>("funnel", `${qs}&split=${split}`);
  if (q.error) return <ErrorNote error={q.error} />;
  if (!q.data) return <Loading />;
  const d = q.data;
  const total = d.steps.map((_, i) => d.groups.reduce((a, g) => a + (g.counts[i] ?? 0), 0));
  const timeOf = (id: string) => d.time.find((t) => t.step === id);
  const sel = Math.min(Math.max(step, 1), d.steps.length - 1);
  const lost = total[sel - 1] - total[sel];
  const biggest = d.steps.slice(1).reduce((b, _, i) => (total[i] - total[i + 1] > total[b] - total[b + 1] ? i : b), 0);

  return (
    <>
      <div className="oc-row">
        <span className="oc-sub" style={{ fontWeight: 700 }}>
          Break down by
        </span>
        <Seg label="Break down by" value={split} options={SPLITS} onChange={setSplit} />
      </div>
      <div className="oc-grid" style={{ ["--min" as string]: "150px" }}>
        <Kpi label="Started a book" value={total[0].toLocaleString()} delta="visitors who reached step 1" />
        <Kpi label="Started → paid" value={total[0] ? pct(total[total.length - 1] / total[0]) : "—"} />
        <Kpi label="Biggest leak" value={d.steps[biggest + 1]?.label ?? "—"} delta={total[biggest] ? `${pct((total[biggest] - total[biggest + 1]) / total[biggest], 0)} leave before it` : ""} tone="bad" />
      </div>

      <section className="oc-card">
        <div className="oc-card-head">
          <h2>Out of everyone who started a book</h2>
          <Legend items={d.groups.map((g, i) => ({ label: g.name, colour: SERIES[i] }))} />
        </div>
        {total[0] === 0 ? (
          <p className="oc-empty">No builder visits in this period yet. Steps are recorded from this release on.</p>
        ) : (
          <div className="oc-table-wrap">
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${d.steps.length}, minmax(96px, 1fr))`, gap: 8, minWidth: 880 }}>
              {d.steps.map((s, i) => {
                const conv = i ? (total[i - 1] ? total[i] / total[i - 1] : 0) : 1;
                const t = timeOf(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => i && setStep(i)}
                    aria-pressed={sel === i}
                    style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 6px", border: `2px solid ${sel === i ? "#CA3A58" : "transparent"}`, borderRadius: 12, background: "#fff", textAlign: "left", cursor: i ? "pointer" : "default" }}
                  >
                    <b style={{ fontSize: 15, color: "#2A1E5C" }}>{total[0] ? pct(total[i] / total[0], 0) : "—"}</b>
                    <span style={{ height: 200, display: "flex", alignItems: "flex-end", gap: 3, borderRadius: 6, background: "#EEEDF2", padding: "0 3px" }}>
                      {d.groups.map((g, gi) => (
                        <span key={g.name} title={`${g.name}: ${g.counts[i]}`} style={{ flex: 1, minHeight: 3, height: `${g.counts[0] ? (g.counts[i] / g.counts[0]) * 100 : 0}%`, borderRadius: "4px 4px 0 0", background: SERIES[gi] }} />
                      ))}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#2A1E5C", minHeight: 32, lineHeight: "16px" }}>{s.label}</span>
                    <span className="oc-small">{total[i].toLocaleString()} people</span>
                    {i ? <span className={`oc-small ${conv < 0.5 ? "oc-tone-bad" : "oc-tone-ok"}`} style={{ fontWeight: 600 }}>{pct(conv, 0)} from previous</span> : <span className="oc-small">start</span>}
                    {t ? <span className="oc-small">median {secs(n(t.p50))}</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {total[0] ? (
        <section className="oc-card" style={{ borderColor: "#2A1E5C" }}>
          <div className="oc-card-head">
            <h2>Lost before “{d.steps[sel].label}”</h2>
            <span className="oc-sub">
              {lost.toLocaleString()} people · {total[sel - 1] ? pct(lost / total[sel - 1], 0) : "—"} of those who reached the step before
            </span>
          </div>
          <div className="oc-grid" style={{ ["--min" as string]: "150px" }}>
            {d.groups.map((g) => (
              <div key={g.name} className="oc-kpi">
                <span>{g.name}</span>
                <b>{g.counts[sel - 1] ? pct((g.counts[sel - 1] - g.counts[sel]) / g.counts[sel - 1], 0) : "—"}</b>
                <span className="d oc-tone-muted">left ({g.counts[sel - 1] - g.counts[sel]} of {g.counts[sel - 1]})</span>
              </div>
            ))}
            {timeOf(d.steps[sel - 1].id) ? (
              <div className="oc-kpi">
                <span>Time on the step before</span>
                <b>{secs(n(timeOf(d.steps[sel - 1].id)!.p50))}</b>
                <span className="d oc-tone-muted">slowest 1 in 10: {secs(n(timeOf(d.steps[sel - 1].id)!.p90))}</span>
              </div>
            ) : null}
          </div>
          <p className="oc-small">Watch sessions of people who left here in your session-recording tool (Clarity or PostHog, once connected).</p>
        </section>
      ) : null}

      <div className="oc-grid" style={{ ["--min" as string]: "380px" }}>
        <section className="oc-card">
          <h2>Books → paid (counted in books started)</h2>
          <Bars items={d.books.map((b) => ({ label: b.label, value: b.n }))} />
        </section>
        <section className="oc-card">
          <h2>How long from starting a book to paying</h2>
          <Bars items={TTP_LABELS.map((l, i) => ({ label: l, value: n(d.timeToPaid.find((x) => n(x.b) === i)?.n) }))} empty="No paid orders yet" />
        </section>
        <section className="oc-card">
          <h2>Started → paid, week by week</h2>
          <Line cur={d.trend.map((w) => (n(w.started) ? (n(w.paid) / n(w.started)) * 100 : 0))} label="Weekly conversion from starting a book to paying" />
          <span className="oc-small">Last 12 weeks, as % of books started each week.</span>
        </section>
      </div>
    </>
  );
}

/* ── Audience ──────────────────────────────────────────────────── */

function Audience({ qs }: { qs: string }) {
  const q = useReport<Record<string, R[]>>("audience", qs);
  if (q.error) return <ErrorNote error={q.error} />;
  if (!q.data) return <Loading />;
  const d = q.data;
  const panel = (title: string, list: R[]) => {
    const tot = list.reduce((a, r) => a + n(r.visitors), 0) || 1;
    return (
      <section className="oc-card">
        <h2>{title}</h2>
        <Bars
          items={list.map((r) => ({
            label: String(r.k ?? "unknown"),
            value: n(r.visitors),
            shown: `${pct(n(r.visitors) / tot, 0)}${r.started !== undefined ? ` · ${n(r.visitors) ? pct(n(r.started) / n(r.visitors), 0) : "—"} start` : ""}`,
          }))}
        />
      </section>
    );
  };
  return (
    <>
      <p className="oc-sub">Share of visitors, and how many of them started a book. From this release on; nothing personal is stored.</p>
      <div className="oc-grid" style={{ ["--min" as string]: "340px" }}>
        {panel("Device", d.device)}
        {panel("Operating system", d.os)}
        {panel("Browser", d.browser)}
        {panel("Screen size", d.screens)}
        {panel("Where they came from", d.sources)}
      </div>
    </>
  );
}

/* ── Internet speed ────────────────────────────────────────────── */

function Network({ qs }: { qs: string }) {
  const q = useReport<{ visits: R[]; uploads: R[] }>("network", qs);
  if (q.error) return <ErrorNote error={q.error} />;
  if (!q.data) return <Loading />;
  const mbps = (v: unknown) => (v === null || v === undefined ? "—" : `${Number(v).toFixed(1)} Mbps`);
  return (
    <>
      <p className="oc-sub">
        Download speed is measured from the page's own files on each visit. Upload speed comes from real photo uploads. Connection type is reported by Chrome on Android; iPhones show as unknown.
      </p>
      <section className="oc-card flush">
        <div className="oc-table-wrap">
          <table className="oc-table">
            <thead>
              <tr>
                <th>Connection</th>
                <th className="num">Visits</th>
                <th className="num">Download, median</th>
                <th className="num">Slowest 1 in 10</th>
                <th className="num">Phone's estimate</th>
                <th className="num">Round trip</th>
              </tr>
            </thead>
            <tbody>
              {q.data.visits.map((r) => (
                <tr key={String(r.k)}>
                  <td>{String(r.k)}</td>
                  <td className="num">{n(r.visits)}</td>
                  <td className="num">{mbps(r.down_p50)}</td>
                  <td className="num oc-tone-warn">{mbps(r.down_p10)}</td>
                  <td className="num">{mbps(r.hint_p50)}</td>
                  <td className="num">{r.rtt_p50 ? `${Math.round(n(r.rtt_p50))} ms` : "—"}</td>
                </tr>
              ))}
              {!q.data.visits.length ? (
                <tr>
                  <td colSpan={6} className="oc-empty">
                    No visits recorded yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      <section className="oc-card flush">
        <h2 style={{ padding: "14px 16px 0" }}>Photo uploads</h2>
        <div className="oc-table-wrap">
          <table className="oc-table">
            <thead>
              <tr>
                <th>Connection</th>
                <th className="num">Batches</th>
                <th className="num">Upload, median</th>
                <th className="num">Slowest 1 in 10</th>
                <th className="num">All HD photos up</th>
                <th className="num">Batches that stalled</th>
              </tr>
            </thead>
            <tbody>
              {q.data.uploads.map((r) => (
                <tr key={String(r.k)}>
                  <td>{String(r.k)}</td>
                  <td className="num">{n(r.batches)}</td>
                  <td className="num">{mbps(r.up_p50)}</td>
                  <td className="num oc-tone-warn">{mbps(r.up_p10)}</td>
                  <td className="num">{secs(n(r.all_hd_ms_p50))}</td>
                  <td className="num">{pct(n(r.stalled_share), 0)}</td>
                </tr>
              ))}
              {!q.data.uploads.length ? (
                <tr>
                  <td colSpan={6} className="oc-empty">
                    No upload measurements in this period.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/* ── Server speed ──────────────────────────────────────────────── */

/** Limits for "slow" (ms) — past these the cell turns red. */
const LIMIT = (route: string) => (route.startsWith("JOB ") ? 15 * 60_000 : /payments\/return|POST \/api\/orders\b/.test(route) ? 2000 : 800);

function Speed({ qs }: { qs: string }) {
  const q = useReport<{ routes: Array<{ route: string; count: number; errors: number; meanMs: number | null; maxMs: number; p50: number | null; p90: number | null; p95: number | null; p99: number | null }>; vitals: R[] }>("speed", qs);
  if (q.error) return <ErrorNote error={q.error} />;
  if (!q.data) return <Loading />;
  const red = (route: string, v: number | null) => (v !== null && v > LIMIT(route) ? "oc-tone-bad" : "");
  const VITAL: Record<string, [string, number, number, string]> = {
    LCP: ["Loading (main picture shows)", 2500, 4000, "ms"],
    INP: ["Responding to a tap", 200, 500, "ms"],
    CLS: ["Stability (things jumping)", 0.1, 0.25, ""],
    FCP: ["First paint", 1800, 3000, "ms"],
    TTFB: ["Server first byte", 800, 1800, "ms"],
  };
  return (
    <>
      <p className="oc-sub">
        p50 = half are faster · p90 / p95 / p99 = all but the slowest 10 / 5 / 1 in 100 · red = past its limit. “JOB” rows are background work (print files, messages).
      </p>
      <section className="oc-card flush">
        <div className="oc-table-wrap">
          <table className="oc-table" style={{ minWidth: 860 }}>
            <thead>
              <tr>
                <th>Request</th>
                <th className="num">Calls</th>
                <th className="num">Errors</th>
                <th className="num">p50</th>
                <th className="num">p90</th>
                <th className="num">p95</th>
                <th className="num">p99</th>
                <th className="num">Slowest</th>
              </tr>
            </thead>
            <tbody>
              {q.data.routes.map((r) => (
                <tr key={r.route}>
                  <td className="oc-mono">{r.route}</td>
                  <td className="num">{r.count.toLocaleString()}</td>
                  <td className={`num ${r.errors ? "oc-tone-bad" : ""}`}>{r.errors}</td>
                  <td className="num">≤ {ms(r.p50)}</td>
                  <td className={`num ${red(r.route, r.p90)}`}>≤ {ms(r.p90)}</td>
                  <td className={`num ${red(r.route, r.p95)}`} style={{ fontWeight: 700 }}>≤ {ms(r.p95)}</td>
                  <td className={`num ${red(r.route, r.p99)}`} style={{ fontWeight: 700 }}>≤ {ms(r.p99)}</td>
                  <td className="num oc-small">{ms(r.maxMs)}</td>
                </tr>
              ))}
              {!q.data.routes.length ? (
                <tr>
                  <td colSpan={8} className="oc-empty">
                    Timings are written once a minute; check back shortly.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      <section className="oc-card">
        <h2>Speed as customers feel it (Google's Web Vitals, 3 in 4 visits)</h2>
        {!q.data.vitals.length ? <p className="oc-small">No readings yet.</p> : null}
        <div className="oc-grid" style={{ ["--min" as string]: "220px" }}>
          {q.data.vitals.map((v) => {
            const meta = VITAL[String(v.metric)];
            if (!meta) return null;
            const p75 = n(v.p75);
            const tone = p75 <= meta[1] ? "ok" : p75 <= meta[2] ? "warn" : "bad";
            return (
              <div className="oc-kpi" key={`${v.metric}-${v.device}`}>
                <span>
                  {meta[0]} · {String(v.device)}
                </span>
                <b>{meta[3] === "ms" ? ms(p75) : p75.toFixed(2)}</b>
                <Pill tone={tone}>{tone === "ok" ? "Good" : tone === "warn" ? "Needs work" : "Poor"}</Pill>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

/* ── Experience ────────────────────────────────────────────────── */

function Experience({ qs }: { qs: string }) {
  const q = useReport<{ pages: R[]; rage: R[]; errors: R[]; visits: R }>("experience", qs);
  if (q.error) return <ErrorNote error={q.error} />;
  if (!q.data) return <Loading />;
  const d = q.data;
  const visits = n(d.visits?.visits);
  return (
    <>
      <div className="oc-grid" style={{ ["--min" as string]: "150px" }}>
        <Kpi label="Visits" value={visits.toLocaleString()} />
        <Kpi label="Visits with an error" value={visits ? pct(n(d.visits?.with_error) / visits) : "—"} tone={n(d.visits?.with_error) ? "bad" : "ok"} delta={`${n(d.visits?.with_error)} visits`} />
      </div>
      <section className="oc-card flush">
        <h2 style={{ padding: "14px 16px 0" }}>Time on each page (active time only)</h2>
        <div className="oc-table-wrap">
          <table className="oc-table">
            <thead>
              <tr>
                <th>Page</th>
                <th className="num">Views</th>
                <th className="num">Median time</th>
                <th className="num">Slowest 1 in 10</th>
                <th className="num">Left the site here</th>
              </tr>
            </thead>
            <tbody>
              {d.pages.map((p) => (
                <tr key={String(p.path)}>
                  <td className="oc-mono">{String(p.path)}</td>
                  <td className="num">{n(p.views)}</td>
                  <td className="num">{p.p50 ? secs(n(p.p50)) : "—"}</td>
                  <td className="num">{p.p90 ? secs(n(p.p90)) : "—"}</td>
                  <td className="num">{n(p.views) ? pct(n(p.exits) / n(p.views), 0) : "—"}</td>
                </tr>
              ))}
              {!d.pages.length ? (
                <tr>
                  <td colSpan={5} className="oc-empty">
                    No page views recorded yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      <div className="oc-grid" style={{ ["--min" as string]: "380px" }}>
        <section className="oc-card">
          <h2>Rage taps (3+ taps in a second)</h2>
          <Bars items={d.rage.map((r) => ({ label: `${r.target} (${r.path})`, value: n(r.n) }))} empty="None recorded. Good." />
        </section>
        <section className="oc-card">
          <h2>Errors people hit</h2>
          <Bars items={d.errors.map((r) => ({ label: `${String(r.message).slice(0, 80)} (${r.path})`, value: n(r.n), shown: `${n(r.n)} · ${n(r.visits)} visits` }))} empty="No errors recorded." />
        </section>
      </div>
    </>
  );
}
