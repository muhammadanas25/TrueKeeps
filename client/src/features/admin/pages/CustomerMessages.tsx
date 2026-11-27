/**
 * Admin › Notifications › Customer messages (owner only; canvas M5,
 * docs/adr/025). The owner's words for the messages orders get (bank reminder, confirmed, shipped, review):
 * an email subject and one message used for both WhatsApp and email.
 * [Brackets] are filled in per order; the "Insert" buttons put one at the
 * cursor. The preview fills them in with a sample order, the same way the
 * server does (shared/messages.ts fillMessage). "Back to your original
 * words" restores the text the owner sent on 28 Nov 2026.
 */

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MESSAGE_KEYS, MESSAGE_WHEN, PLACEHOLDERS, fillMessage, type MessageKey, type MessageTemplates } from "@shared/messages";
import { BANK_DETAILS, SUPPORT_WHATSAPP } from "@shared/payments";
import { adminFetch, useAdminQuery } from "../api";
import { ErrorNote, Loading } from "../parts";

const SAMPLE = {
  name: "Sara",
  orderNumber: "TK-8F2KQ7",
  courier: "TCS",
  tracking: "7712345678",
  reviewUrl: "https://thetruekeeps.com/review?order=TK-8F2KQ7",
  orderUrl: "https://thetruekeeps.com/orders/…",
  amount: "Rs 6,490",
  bankDetails: [`Bank: ${BANK_DETAILS.bankName}`, `Account title: ${BANK_DETAILS.accountTitle}`, `Account number: ${BANK_DETAILS.accountNumber}`, `IBAN: ${BANK_DETAILS.iban}`].join("\n"),
  payBy: "Sunday 30 November",
  ourWhatsapp: SUPPORT_WHATSAPP.display,
};

export function CustomerMessages() {
  const qc = useQueryClient();
  const q = useAdminQuery<{ templates: MessageTemplates; defaults: MessageTemplates; labels: Record<MessageKey, string> }>(["msg-templates"], "/api/admin/ops/messages/templates");
  const [tab, setTab] = useState<MessageKey>("confirm");
  const [draft, setDraft] = useState<MessageTemplates | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (q.data && !draft) setDraft(q.data.templates);
  }, [q.data, draft]);

  if (q.error) return <ErrorNote error={q.error} />;
  if (!q.data || !draft) return <Loading />;
  const cur = draft[tab];
  const set = (patch: Partial<{ subject: string; body: string }>) => {
    setDraft({ ...draft, [tab]: { ...cur, ...patch } });
    setMsg(null);
  };
  const changed = JSON.stringify(draft) !== JSON.stringify(q.data.templates);

  /** Put a [Bracket] where the cursor is. */
  const insert = (ph: string) => {
    const el = area.current;
    const at = el ? el.selectionStart : cur.body.length;
    const end = el ? el.selectionEnd : at;
    set({ body: cur.body.slice(0, at) + ph + cur.body.slice(end) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + ph.length, at + ph.length);
    });
  };

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await adminFetch<{ templates: MessageTemplates }>("/api/admin/ops/messages/templates", { method: "PUT", body: draft });
      setDraft(r.templates);
      await qc.invalidateQueries({ queryKey: ["msg-templates"] });
      setMsg({ ok: true, text: "Saved. Every order's messages now use these words." });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="oc-sub">
        Your words for the messages customers get: a reminder when a bank transfer is waiting, then order confirmed, shipped and a review request. Words in square brackets are filled in from the order. Every order's page and the Overview use these; when the WhatsApp API
        is connected, the same words can be sent automatically.
      </p>
      <div className="oc-row">
        {MESSAGE_KEYS.map((k) => (
          <button key={k} type="button" className="oc-btn" aria-pressed={k === tab} style={k === tab ? { background: "#F5F4F8" } : undefined} onClick={() => setTab(k)}>
            {q.data!.labels[k]}
          </button>
        ))}
      </div>
      <div className="oc-grid" style={{ ["--min" as string]: "360px", alignItems: "start" }}>
        <section className="oc-card" aria-labelledby="cm-ed" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 id="cm-ed">{q.data.labels[tab]}</h2>
          <span className="oc-small">{MESSAGE_WHEN[tab]}</span>
          <label className="oc-field">
            Email subject
            <input value={cur.subject} onChange={(e) => set({ subject: e.target.value })} maxLength={200} />
          </label>
          <label className="oc-field">
            Message (WhatsApp and email)
            <textarea ref={area} rows={14} value={cur.body} onChange={(e) => set({ body: e.target.value })} maxLength={2000} style={{ lineHeight: "21px" }} />
          </label>
          <div className="oc-row" style={{ gap: 6 }}>
            <span className="oc-small" style={{ fontWeight: 700 }}>
              Insert:
            </span>
            {PLACEHOLDERS.map((p) => (
              <button key={p} type="button" className="oc-btn sm" onClick={() => insert(p)}>
                {p}
              </button>
            ))}
          </div>
          <div className="oc-row">
            <button type="button" className="oc-btn primary" disabled={busy || !changed} onClick={() => void save()}>
              Save
            </button>
            <button type="button" className="oc-btn link" onClick={() => set({ ...q.data!.defaults[tab] })}>
              Back to your original words
            </button>
            {msg ? (
              <span className="oc-small" role="status" style={{ color: msg.ok ? "#2C847D" : "#9E1F3B", fontWeight: 600 }}>
                {msg.text}
              </span>
            ) : changed ? (
              <span className="oc-small">Not saved yet</span>
            ) : null}
          </div>
        </section>
        <section className="oc-card" aria-labelledby="cm-pv" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 id="cm-pv">Preview with a sample order</h2>
          <span className="oc-small">TK-8F2KQ7 · Sara Khan · TCS 7712345678</span>
          <div className="oc-small">
            <b>Subject:</b> {fillMessage(cur.subject, SAMPLE)}
          </div>
          <div className="oc-msg-preview">
            <div className="oc-msg-text">{fillMessage(cur.body, SAMPLE)}</div>
          </div>
          <span className="oc-small">
            [Name] is the first name on the delivery address. [Amount] is the order total, [Pay by] the last day the order is held, [Bank details] and [Our WhatsApp] come
            from the checkout's payment details. [Courier] is what was typed on the order (TCS if empty). [Tracking link] is TCS's tracking page, or for another courier the
            customer's order page, which shows the tracking number.
          </span>
        </section>
      </div>
    </>
  );
}
