/**
 * Promo codes (owner only) — make, change and switch off the codes customers
 * type at checkout (owner, 2026-11-22: "it will have all this configurable
 * from admin page").
 *
 * One list: each code with its discount, how many standing orders used it,
 * what it took off in total, its dates and limits, and an on/off switch. The
 * form above makes a new code or edits the one picked from the list. The
 * rules live in shared/promo.ts; the server checks every code again when an
 * order is placed.
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PROMO_CODE_RE, normalizeCode, promoLabel, type PromoKind } from "@shared/promo";
import { adminFetch, useAdminQuery } from "../api";
import { day, money } from "../format";
import { ErrorNote, Loading, Pill } from "../parts";

type Promo = {
  id: string;
  code: string;
  kind: PromoKind;
  value: number;
  startsAt: string | null;
  endsAt: string | null;
  maxUses: number | null;
  perCustomer: number | null;
  minSubtotalMinor: number | null;
  active: boolean;
  note: string | null;
  uses: number;
  discountGivenMinor: number;
};

/** The form keeps text as typed; rupees and dates are converted on save. */
type Draft = { id: string | null; code: string; kind: PromoKind; value: string; startsAt: string; endsAt: string; maxUses: string; perCustomer: string; minRupees: string; active: boolean; note: string };
const EMPTY: Draft = { id: null, code: "", kind: "percent", value: "", startsAt: "", endsAt: "", maxUses: "", perCustomer: "1", minRupees: "", active: true, note: "" };

const toDraft = (p: Promo): Draft => ({
  id: p.id,
  code: p.code,
  kind: p.kind,
  value: String(p.kind === "fixed" ? p.value / 100 : p.value),
  startsAt: p.startsAt ? p.startsAt.slice(0, 10) : "",
  endsAt: p.endsAt ? p.endsAt.slice(0, 10) : "",
  maxUses: p.maxUses === null ? "" : String(p.maxUses),
  perCustomer: p.perCustomer === null ? "" : String(p.perCustomer),
  minRupees: p.minSubtotalMinor === null ? "" : String(p.minSubtotalMinor / 100),
  active: p.active,
  note: p.note ?? "",
});

/** Draft → API body. Dates are whole days in Pakistan time: from 00:00 of the start, to the end of the end day. */
function toBody(d: Draft) {
  const n = (v: string) => (v.trim() === "" ? null : Number(v));
  const pkt = (date: string, endOfDay: boolean) => (date ? new Date(`${date}T${endOfDay ? "23:59:59" : "00:00:00"}+05:00`).toISOString() : null);
  return {
    code: normalizeCode(d.code),
    kind: d.kind,
    value: d.kind === "fixed" ? Math.round(Number(d.value) * 100) : Math.round(Number(d.value)),
    startsAt: pkt(d.startsAt, false),
    endsAt: pkt(d.endsAt, true),
    maxUses: n(d.maxUses),
    perCustomer: n(d.perCustomer),
    minSubtotalMinor: d.minRupees.trim() === "" ? null : Math.round(Number(d.minRupees) * 100),
    active: d.active,
    note: d.note.trim() || null,
  };
}

export function PromosPage() {
  const qc = useQueryClient();
  const list = useAdminQuery<Promo[]>(["admin", "promos"], "/api/admin/promos");
  const [d, setD] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  const save = async (draft: Draft) => {
    const body = toBody(draft);
    if (!PROMO_CODE_RE.test(body.code)) return setMsg({ ok: false, text: "The code needs 3 to 24 letters, digits or dashes." });
    if (!(body.value > 0)) return setMsg({ ok: false, text: draft.kind === "percent" ? "Enter a percentage." : "Enter an amount in rupees." });
    setBusy(true);
    setMsg(null);
    try {
      await adminFetch(draft.id ? `/api/admin/promos/${draft.id}` : "/api/admin/promos", { method: draft.id ? "PATCH" : "POST", body });
      await qc.invalidateQueries({ queryKey: ["admin", "promos"] });
      setMsg({ ok: true, text: `${body.code} saved.` });
      if (!draft.id) setD(EMPTY);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="oc-head">
        <h1>Promo codes</h1>
      </div>
      <p className="oc-sub">Customers type these at checkout. A code comes off the book price, never delivery, and the server checks it again on every order.</p>

      <section className="oc-card" aria-labelledby="pf">
        <div className="oc-card-head">
          <h2 id="pf">{d.id ? `Edit ${d.code}` : "New code"}</h2>
          {d.id ? (
            <button className="oc-btn sm" onClick={() => setD(EMPTY)}>
              New code instead
            </button>
          ) : null}
        </div>
        <div className="oc-grid" style={{ ["--min" as string]: "180px" }}>
          <label className="oc-field">
            Code
            <input value={d.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} placeholder="EID10" maxLength={24} />
          </label>
          <label className="oc-field">
            Discount
            <select value={d.kind} onChange={(e) => set({ kind: e.target.value as PromoKind })}>
              <option value="percent">Percent off</option>
              <option value="fixed">Rupees off</option>
            </select>
          </label>
          <label className="oc-field">
            {d.kind === "percent" ? "Percent (1 to 90)" : "Rupees"}
            <input inputMode="numeric" value={d.value} onChange={(e) => set({ value: e.target.value.replace(/[^\d.]/g, "") })} placeholder={d.kind === "percent" ? "10" : "500"} />
          </label>
          <label className="oc-field">
            Starts <span className="oc-small">(optional)</span>
            <input type="date" value={d.startsAt} onChange={(e) => set({ startsAt: e.target.value })} />
          </label>
          <label className="oc-field">
            Ends, last day <span className="oc-small">(optional)</span>
            <input type="date" value={d.endsAt} onChange={(e) => set({ endsAt: e.target.value })} />
          </label>
          <label className="oc-field">
            Total uses <span className="oc-small">(empty = no limit)</span>
            <input inputMode="numeric" value={d.maxUses} onChange={(e) => set({ maxUses: e.target.value.replace(/\D/g, "") })} placeholder="100" />
          </label>
          <label className="oc-field">
            Uses per customer <span className="oc-small">(empty = no limit)</span>
            <input inputMode="numeric" value={d.perCustomer} onChange={(e) => set({ perCustomer: e.target.value.replace(/\D/g, "") })} />
          </label>
          <label className="oc-field">
            Smallest book, Rs <span className="oc-small">(optional)</span>
            <input inputMode="numeric" value={d.minRupees} onChange={(e) => set({ minRupees: e.target.value.replace(/\D/g, "") })} placeholder="6000" />
          </label>
          <label className="oc-field">
            Note for the team <span className="oc-small">(optional)</span>
            <input value={d.note} onChange={(e) => set({ note: e.target.value })} placeholder="Eid post on Instagram" maxLength={200} />
          </label>
        </div>
        <div className="oc-row" style={{ marginTop: 12 }}>
          <label className="oc-row" style={{ gap: 8, fontWeight: 600 }}>
            <input type="checkbox" checked={d.active} onChange={(e) => set({ active: e.target.checked })} /> On (customers can use it)
          </label>
          <button className="oc-btn primary" disabled={busy} onClick={() => void save(d)}>
            {d.id ? "Save changes" : "Create code"}
          </button>
          {msg ? (
            <span className={"oc-small"} role="status" style={{ color: msg.ok ? "#2C847D" : "#9E1F3B", fontWeight: 600 }}>
              {msg.text}
            </span>
          ) : null}
        </div>
      </section>

      <section className="oc-card flush" aria-labelledby="pl">
        <div className="oc-card-head" style={{ padding: "14px 16px 0" }}>
          <h2 id="pl">All codes</h2>
        </div>
        {list.isLoading ? <Loading /> : list.error ? <ErrorNote error={list.error} /> : null}
        {list.data && !list.data.length ? <p className="oc-sub" style={{ padding: "0 16px 16px" }}>No codes yet. The first one you create appears here.</p> : null}
        {list.data?.length ? (
          <div className="oc-table-wrap">
            <table className="oc-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Discount</th>
                  <th className="num">Used</th>
                  <th className="num">Given</th>
                  <th>Dates</th>
                  <th>Limits</th>
                  <th>On</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.data.map((p) => (
                  <tr key={p.id} className={d.id === p.id ? "sel" : ""}>
                    <td>
                      <b>{p.code}</b>
                      {p.note ? <div className="oc-small">{p.note}</div> : null}
                    </td>
                    <td>{promoLabel(p)}</td>
                    <td className="num">
                      {p.uses}
                      {p.maxUses !== null ? ` / ${p.maxUses}` : ""}
                    </td>
                    <td className="num">{money(p.discountGivenMinor)}</td>
                    <td className="oc-small">
                      {p.startsAt ? `from ${day(p.startsAt)}` : "now"} · {p.endsAt ? `to ${day(p.endsAt)}` : "no end"}{" "}
                      {p.endsAt && new Date(p.endsAt) < new Date() ? <Pill tone="muted">Ended</Pill> : null}
                    </td>
                    <td className="oc-small">
                      {p.perCustomer === null ? "any number each" : `${p.perCustomer} each`}
                      {p.minSubtotalMinor !== null ? ` · book from ${money(p.minSubtotalMinor)}` : ""}
                    </td>
                    <td>
                      <button className="oc-btn sm" disabled={busy} aria-pressed={p.active} onClick={() => void save({ ...toDraft(p), active: !p.active })}>
                        {p.active ? <Pill tone="ok">On</Pill> : <Pill tone="muted">Off</Pill>}
                      </button>
                    </td>
                    <td>
                      <button className="oc-btn sm" onClick={() => setD(toDraft(p))}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </>
  );
}
