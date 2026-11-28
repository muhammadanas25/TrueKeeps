/**
 * Print queue (canvas board A4Print): every paid order by where its book is.
 *
 *   Building → Checked, ready to send → At the printer → Shipped (14 days)
 *   plus a Failed column that only appears when something failed.
 *
 * "Send to printer" is the real status change (paid → in_production), the
 * same as on the order page, and is refused for test orders by the server.
 *
 * Print settings (owner only, docs/adr/026): the resolution of the sheet
 * JPEGs for the Noritsu, 300 dpi (default) or 640 dpi, and whether the front
 * and back cover share one sheet (default, saves a print). Applies to print
 * files built from then on; "Rebuild as a new version" on an order remakes one.
 */

import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { adminFetch, useAdminQuery, type OrderRow, type StaffMe } from "../api";
import { ago, day, printTone } from "../format";
import { ErrorNote, Loading, Pill } from "../parts";

type Card = OrderRow & { column: string; courier: string | null; tracking: string | null };

const COLUMNS = [
  ["building", "Building print file", "#888F8E"],
  ["ready", "Checked, ready to send", "#1C8C80"],
  ["printer", "At the printer", "#2A1E5C"],
  ["shipped", "Shipped (last 14 days)", "#595080"],
  ["failed", "Failed, needs you", "#CA3A58"],
] as const;

export function PrintQueuePage({ me }: { me: StaffMe }) {
  const q = useAdminQuery<{ cards: Card[] }>(["print-board"], "/api/admin/ops/print", { refetchInterval: 30_000 });
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);
  const send = async (c: Card) => {
    setErr(null);
    try {
      await adminFetch(`/api/admin/orders/${c.id}`, { method: "PATCH", body: { status: "in_production", note: "Sent to printer from the print queue" } });
      void qc.invalidateQueries({ queryKey: ["print-board"] });
    } catch (e) {
      setErr(`${c.orderNumber}: ${(e as Error).message}`);
    }
  };
  const cards = q.data?.cards ?? [];
  const cols = COLUMNS.filter(([k]) => k !== "failed" || cards.some((c) => c.column === "failed"));

  return (
    <>
      <div className="oc-head">
        <h1>Print queue</h1>
        <span className="oc-sub">Live orders only. Updates every 30 seconds.</span>
      </div>
      {err ? <p className="oc-note bad">{err}</p> : null}
      {q.error ? <ErrorNote error={q.error} /> : null}
      {!q.data ? (
        <Loading />
      ) : (
        <div className="oc-table-wrap">
          <div className="oc-board" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(220px, 1fr))` }}>
            {cols.map(([key, title, dot]) => {
              const list = cards.filter((c) => c.column === key);
              return (
                <section className="oc-col" key={key} aria-label={title}>
                  <h2>
                    <span style={{ width: 10, height: 10, borderRadius: 999, background: dot }} />
                    {title} <span className="oc-sub">{list.length}</span>
                  </h2>
                  {list.length === 0 ? <p className="oc-small">Nothing here</p> : null}
                  {list.map((c) => {
                    const [pr, tone] = printTone(c.print?.state, c.print?.problems);
                    const late = c.deliverBy && new Date(c.deliverBy).getTime() < Date.now() && key !== "shipped";
                    return (
                      <div className="oc-tile" key={c.id}>
                        <div className="oc-row" style={{ flexWrap: "nowrap" }}>
                          <Link href={`/orders/${c.id}`}>
                            <b>{c.orderNumber}</b>
                          </Link>
                          <span className={`oc-small ${late ? "oc-tone-bad" : ""}`} style={{ marginLeft: "auto", fontWeight: 600 }}>
                            {c.deliverBy ? `due ${day(c.deliverBy)}` : ago(c.createdAt)}
                          </span>
                        </div>
                        <span>{c.book}</span>
                        <span className="oc-small">
                          {c.customer} · {c.city}
                        </span>
                        {key === "shipped" ? <span className="oc-small">{[c.courier, c.tracking].filter(Boolean).join(" · ") || "no tracking yet"}</span> : <Pill tone={tone}>{pr}</Pill>}
                        {c.print?.lowDpi ? <Pill tone="warn">{c.print.lowDpi} low-resolution photo(s)</Pill> : null}
                        {key === "ready" ? (
                          <button className="oc-btn primary sm" onClick={() => send(c)}>
                            Send to printer
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </section>
              );
            })}
          </div>
        </div>
      )}
      {me.role === "admin" ? <PrintSettings /> : null}
    </>
  );
}

type Settings = { sheetDpi: 300 | 640; coversTogether: boolean };

/** The printer switches (owner only): sheet resolution, and covers on one sheet or two. */
function PrintSettings() {
  const q = useAdminQuery<Settings>(["print-settings"], "/api/admin/ops/print-settings");
  const qc = useQueryClient();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const choose = async (patch: Partial<Settings>) => {
    setMsg(null);
    const next = { ...q.data!, ...patch };
    try {
      await adminFetch("/api/admin/ops/print-settings", { method: "PUT", body: next });
      await qc.invalidateQueries({ queryKey: ["print-settings"] });
      setMsg({
        ok: true,
        text: `Saved. New print files: ${next.sheetDpi} dpi, ${next.coversTogether ? "both covers on one sheet" : "each cover on its own"}. To remake an order's files, use "Rebuild as a new version" on it.`,
      });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };
  return (
    <section className="oc-card" aria-labelledby="ps" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <h2 id="ps">Print settings</h2>
      <p className="oc-sub" style={{ margin: 0 }}>
        The ZIP for the printer has one JPEG per sheet: two pages side by side, 12 in tall (the full paper width) and 24 in plus 3 mm at each end long, plus the covers.
      </p>
      {q.error ? <ErrorNote error={q.error} /> : null}
      {q.data ? (
        <div className="oc-field" role="group" aria-label="Sheet resolution">
          Sheet resolution
          <div className="oc-row">
            {(
              [
                [300, "300 dpi", "photo-lab standard, smaller files"],
                [640, "640 dpi", "the Noritsu's own resolution, files about 4 times larger"],
              ] as const
            ).map(([dpi, label, hint]) => (
              <button key={dpi} type="button" className="oc-btn" aria-pressed={q.data!.sheetDpi === dpi} style={q.data!.sheetDpi === dpi ? { background: "#2A1E5C", color: "#fff" } : undefined} onClick={() => void choose({ sheetDpi: dpi })}>
                {label}
                <span className="oc-small" style={{ fontWeight: 500, color: "inherit", opacity: 0.85 }}>
                  {hint}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {q.data ? (
        <div className="oc-field" role="group" aria-label="Covers">
          Covers
          <div className="oc-row">
            {(
              [
                [true, "Both on one sheet", "back cover left, front right: saves a print"],
                [false, "Separate", "front and back each on their own print"],
              ] as const
            ).map(([together, label, hint]) => (
              <button
                key={label}
                type="button"
                className="oc-btn"
                aria-pressed={q.data!.coversTogether === together}
                style={q.data!.coversTogether === together ? { background: "#2A1E5C", color: "#fff" } : undefined}
                onClick={() => void choose({ coversTogether: together })}
              >
                {label}
                <span className="oc-small" style={{ fontWeight: 500, color: "inherit", opacity: 0.85 }}>
                  {hint}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {msg ? (
        <p className={`oc-note ${msg.ok ? "ok" : "bad"}`} role="status">
          {msg.text}
        </p>
      ) : null}
    </section>
  );
}
