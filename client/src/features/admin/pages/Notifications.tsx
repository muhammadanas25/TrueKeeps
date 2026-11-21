/**
 * Notifications (canvas board A4Alerts) — who gets which message, and the log
 * of everything sent.
 *
 * Owner: one card per event. Turn it on or off; add or remove staff emails
 * and WhatsApp numbers; switch the customer's email and WhatsApp on or off;
 * name the WhatsApp templates Meta approved and see which value fills each
 * {{n}}; save; send a test to the staff recipients. Everyone: the log of
 * sent messages with status (sent → delivered → read, or failed with why)
 * and Resend.
 */

import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { NOTIFY_EVENT_INFO, type NotifyEvent } from "@shared/ops";
import { adminFetch, useAdminQuery, type NotifyRule, type StaffMe } from "../api";
import { when } from "../format";
import { ErrorNote, Kpi, Loading, Pill } from "../parts";

type Log = {
  list: Array<{ id: string; event: string; channel: string; audience: string; recipient: string; orderId: string | null; orderNumber: string | null; status: string; attempts: number; error: string | null; createdAt: string }>;
  health: { total: number; ok: number; failed: number; skipped: number };
};

const STATUS_TONE: Record<string, "ok" | "warn" | "bad" | "info" | "muted"> = { read: "ok", delivered: "ok", sent: "info", queued: "muted", failed: "bad", skipped: "warn" };

function mask(r: string, channel: string) {
  if (channel === "email") {
    const [u, d] = r.split("@");
    return `${u.slice(0, 2)}•••@${d ?? ""}`;
  }
  return `${r.slice(0, 5)} ••• ${r.slice(-3)}`;
}

function ListEditor({ label, values, onChange, placeholder, type }: { label: string; values: string[]; onChange: (v: string[]) => void; placeholder: string; type: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft("");
  };
  return (
    <div className="oc-field">
      {label}
      <div className="oc-row">
        {values.map((v) => (
          <span key={v} className="oc-pill info">
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))} style={{ border: "none", background: "transparent", cursor: "pointer", color: "inherit", fontWeight: 700 }}>
              ×
            </button>
          </span>
        ))}
        {!values.length ? <span className="oc-small">nobody</span> : null}
      </div>
      <div className="oc-row" style={{ flexWrap: "nowrap" }}>
        <input
          type={type}
          className="oc-input"
          style={{ flex: 1 }}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="oc-btn sm" onClick={add} disabled={!draft.trim()}>
          Add
        </button>
      </div>
    </div>
  );
}

function RuleCard({ rule, whatsappConnected }: { rule: NotifyRule; whatsappConnected: boolean }) {
  const info = NOTIFY_EVENT_INFO[rule.event as NotifyEvent];
  const [r, setR] = useState(rule);
  // take the server's copy after a save or a refetch that changed it (not on every render)
  const serverCopy = JSON.stringify(rule);
  useEffect(() => setR(JSON.parse(serverCopy) as NotifyRule), [serverCopy]);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const dirty = JSON.stringify(r) !== JSON.stringify(rule);
  const set = (patch: Partial<NotifyRule>) => setR({ ...r, ...patch });

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await adminFetch(`/api/admin/ops/notify-rules/${rule.event}`, {
        method: "PUT",
        body: { enabled: r.enabled, staffEmails: r.staffEmails, staffWhatsapp: r.staffWhatsapp, customerEmail: r.customerEmail, customerWhatsapp: r.customerWhatsapp, staffTemplate: r.staffTemplate ?? "", customerTemplate: r.customerTemplate ?? "", templateLang: r.templateLang },
      });
      setMsg({ tone: "ok", text: "Saved" });
      void qc.invalidateQueries({ queryKey: ["notify-rules"] });
    } catch (e) {
      setMsg({ tone: "bad", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const test = async () => {
    setMsg(null);
    try {
      const x = await adminFetch<{ queued: number }>(`/api/admin/ops/notify-rules/${rule.event}/test`, { method: "POST", body: {} });
      setMsg({ tone: "ok", text: x.queued ? `Test queued to ${x.queued} staff recipient(s). See the log below.` : "Nothing to send: no staff recipients, or the event is off." });
      void qc.invalidateQueries({ queryKey: ["notify-log"] });
    } catch (e) {
      setMsg({ tone: "bad", text: (e as Error).message });
    }
  };

  return (
    <section className="oc-card" aria-labelledby={`r-${rule.event}`}>
      <div className="oc-card-head">
        <h2 id={`r-${rule.event}`}>{info.label}</h2>
        {!rule.saved ? <Pill tone="muted">default</Pill> : null}
        <label className="oc-check">
          <input type="checkbox" checked={r.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> On
        </label>
      </div>
      <p className="oc-small" style={{ margin: 0 }}>
        {info.description}
      </p>
      {r.enabled ? (
        <>
          <ListEditor label="Staff emails" values={r.staffEmails} onChange={(v) => set({ staffEmails: v.map((x) => x.toLowerCase()) })} placeholder="name@example.com" type="email" />
          <ListEditor label="Staff WhatsApp numbers" values={r.staffWhatsapp} onChange={(v) => set({ staffWhatsapp: v })} placeholder="923001234567" type="tel" />
          {info.customerCapable ? (
            <div className="oc-row">
              <label className="oc-check">
                <input type="checkbox" checked={r.customerEmail} onChange={(e) => set({ customerEmail: e.target.checked })} /> Email the customer
              </label>
              <label className="oc-check">
                <input type="checkbox" checked={r.customerWhatsapp} onChange={(e) => set({ customerWhatsapp: e.target.checked })} /> WhatsApp the customer
              </label>
            </div>
          ) : null}
          {r.staffWhatsapp.length || r.customerWhatsapp ? (
            <details open={!r.staffTemplate && !r.customerTemplate}>
              <summary className="oc-small" style={{ fontWeight: 600 }}>
                WhatsApp templates {whatsappConnected ? "" : "(WhatsApp isn't connected yet; messages will show as skipped)"}
              </summary>
              <div className="oc-grid" style={{ ["--min" as string]: "200px", marginTop: 8 }}>
                {r.staffWhatsapp.length ? (
                  <label className="oc-field">
                    Staff template name
                    <input value={r.staffTemplate ?? ""} onChange={(e) => set({ staffTemplate: e.target.value })} placeholder="e.g. new_order_alert" />
                    <span className="oc-small" style={{ fontWeight: 400 }}>
                      {info.whatsappParams.staff.map((p, i) => `{{${i + 1}}} ${p}`).join(" · ")}
                    </span>
                  </label>
                ) : null}
                {r.customerWhatsapp && info.whatsappParams.customer.length ? (
                  <label className="oc-field">
                    Customer template name
                    <input value={r.customerTemplate ?? ""} onChange={(e) => set({ customerTemplate: e.target.value })} placeholder="e.g. order_confirmed" />
                    <span className="oc-small" style={{ fontWeight: 400 }}>
                      {info.whatsappParams.customer.map((p, i) => `{{${i + 1}}} ${p}`).join(" · ")}
                    </span>
                  </label>
                ) : null}
                <label className="oc-field">
                  Template language
                  <input value={r.templateLang} onChange={(e) => set({ templateLang: e.target.value })} placeholder="en" />
                </label>
              </div>
            </details>
          ) : null}
        </>
      ) : null}
      <div className="oc-row">
        <button className="oc-btn primary sm" disabled={busy || !dirty} onClick={save}>
          Save
        </button>
        <button className="oc-btn sm" disabled={dirty || !r.enabled} onClick={test} title={dirty ? "Save first" : undefined}>
          Send a test to staff
        </button>
        {msg ? <span className={`oc-small oc-tone-${msg.tone}`}>{msg.text}</span> : null}
      </div>
    </section>
  );
}

export function NotificationsPage({ me }: { me: StaffMe }) {
  const log = useAdminQuery<Log>(["notify-log"], "/api/admin/ops/notifications", { refetchInterval: 30_000 });
  const rules = useAdminQuery<{ rules: NotifyRule[]; whatsappConnected: boolean }>(["notify-rules"], me.role === "admin" ? "/api/admin/ops/notify-rules" : null);
  const qc = useQueryClient();
  const resend = async (id: string) => {
    await adminFetch(`/api/admin/ops/notifications/${id}/resend`, { method: "POST", body: {} }).catch(() => undefined);
    void qc.invalidateQueries({ queryKey: ["notify-log"] });
  };
  const h = log.data?.health;

  return (
    <>
      <div className="oc-head">
        <h1>Notifications</h1>
      </div>
      {h ? (
        <div className="oc-grid" style={{ ["--min" as string]: "150px" }}>
          <Kpi label="Sent, last 7 days" value={h.total} />
          <Kpi label="Delivered or sent" value={h.total ? `${Math.round((h.ok / h.total) * 100)}%` : "—"} tone="ok" />
          <Kpi label="Failed" value={h.failed} tone={h.failed ? "bad" : "ok"} delta={h.failed ? "use Resend below" : "all clear"} />
          <Kpi label="Skipped" value={h.skipped} delta="e.g. WhatsApp not connected" />
        </div>
      ) : null}

      {me.role === "admin" ? (
        <>
          <h2 style={{ fontSize: 18, marginTop: 8 }}>Who gets what</h2>
          {rules.data && !rules.data.whatsappConnected ? (
            <p className="oc-note info">
              WhatsApp isn't connected yet. Email works now. To switch WhatsApp on, add the four WHATSAPP_* settings in Railway once Meta has verified the business number and approved your templates.
            </p>
          ) : null}
          {rules.error ? <ErrorNote error={rules.error} /> : null}
          {!rules.data ? <Loading /> : <div className="oc-grid" style={{ ["--min" as string]: "380px" }}>{rules.data.rules.map((r) => <RuleCard key={r.event} rule={r} whatsappConnected={rules.data!.whatsappConnected} />)}</div>}
        </>
      ) : null}

      <h2 style={{ fontSize: 18, marginTop: 8 }}>Sent messages</h2>
      {log.error ? <ErrorNote error={log.error} /> : null}
      {!log.data ? (
        <Loading />
      ) : (
        <section className="oc-card flush">
          <div className="oc-table-wrap">
            <table className="oc-table" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Channel</th>
                  <th>To</th>
                  <th>Message</th>
                  <th>Order</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {log.data.list.map((m) => (
                  <tr key={m.id}>
                    <td className="oc-small">{when(m.createdAt)}</td>
                    <td>{m.channel === "whatsapp" ? "WhatsApp" : "Email"}</td>
                    <td>
                      {m.audience === "customer" ? "Customer · " : ""}
                      {mask(m.recipient, m.channel)}
                    </td>
                    <td>{NOTIFY_EVENT_INFO[m.event as NotifyEvent]?.label ?? m.event}</td>
                    <td>{m.orderId ? <Link href={`/orders/${m.orderId}`}>{m.orderNumber}</Link> : "—"}</td>
                    <td>
                      <Pill tone={STATUS_TONE[m.status] ?? "muted"}>{m.status}</Pill>
                      {m.error ? <div className="oc-small">{m.error}</div> : null}
                    </td>
                    <td>
                      {m.status === "failed" || m.status === "skipped" ? (
                        <button className="oc-btn sm" onClick={() => resend(m.id)}>
                          Resend
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {!log.data.list.length ? (
                  <tr>
                    <td colSpan={7} className="oc-empty">
                      No messages yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
