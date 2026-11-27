/**
 * Customer messages sent by hand (docs/adr/025; canvas M1–M3).
 *
 *  - MessageButtons: "Open WhatsApp", "Copy", "Email" for one filled-in
 *    message. WhatsApp and Email open the app with the message typed in and
 *    then record the message as sent (POST …/messages/:key), so it leaves the
 *    Overview's list. Copy only copies: pasting somewhere else isn't proof it
 *    was sent; the order card has "Mark sent" for that.
 *  - MessagesCard: the order page's card. One tab per message (Order
 *    confirmed, Shipped, Ask for a review) with its state, a preview as the
 *    customer will see it, the buttons, and "Sent … Undo".
 *
 * The server fills the messages in (server/notify/manual.ts), so the order
 * page, the Overview and the new-order email send exactly the same words.
 */

import { useState } from "react";
import { Check, Copy, Mail, MessageCircle } from "lucide-react";
import { adminFetch, type OrderMessageView } from "./api";
import { when } from "./format";
import { Pill } from "./parts";

const CHANNEL_LABEL: Record<string, string> = { whatsapp: "on WhatsApp", email: "by email", other: "" };

/** Record that a message went out; resolves when stored. */
export const markSent = (orderId: string, key: string, channel: "whatsapp" | "email" | "other") =>
  adminFetch(`/api/admin/ops/orders/${orderId}/messages/${key}`, { method: "POST", body: { channel } });

export function MessageButtons({
  orderId,
  msgKey,
  whatsappUrl,
  mailtoUrl,
  text,
  name,
  onSent,
  size = "",
}: {
  orderId: string;
  msgKey: string;
  whatsappUrl: string | null;
  mailtoUrl: string;
  text: string;
  name: string;
  onSent: () => void;
  size?: "" | "sm";
}) {
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const send = (channel: "whatsapp" | "email", url: string) => {
    // open first, synchronously, so the browser doesn't block it as a pop-up
    if (channel === "whatsapp") window.open(url, "_blank", "noopener");
    else window.location.href = url;
    markSent(orderId, msgKey, channel)
      .then(onSent)
      .catch((e: Error) => setErr(e.message));
  };
  const copy = () =>
    void navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => setErr("Couldn't copy. Select the message and copy it by hand."));
  return (
    <div className="oc-row">
      {whatsappUrl ? (
        <button type="button" className={`oc-btn primary ${size}`} onClick={() => send("whatsapp", whatsappUrl)}>
          <MessageCircle size={16} aria-hidden /> {size ? "WhatsApp" : `Open WhatsApp to ${name}`}
        </button>
      ) : (
        <span className="oc-small">No WhatsApp number on this order</span>
      )}
      <button type="button" className={`oc-btn ${size}`} onClick={copy}>
        {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />} {copied ? "Copied" : size ? "Copy" : "Copy message"}
      </button>
      <button type="button" className={`oc-btn ${size}`} onClick={() => send("email", mailtoUrl)}>
        <Mail size={15} aria-hidden /> {size ? "Email" : "Email it"}
      </button>
      {err ? (
        <span className="oc-small oc-tone-bad" role="alert">
          {err}
        </span>
      ) : null}
    </div>
  );
}

export function MessagesCard({ orderId, name, contact, messages, onChanged }: { orderId: string; name: string; contact: string; messages: OrderMessageView[]; onChanged: () => void }) {
  // open on the first message that is due and not sent, else the first one
  const [tab, setTab] = useState(() => (messages.find((m) => m.ready && !m.sent) ?? messages[0])?.key);
  const [busy, setBusy] = useState(false);
  const cur = messages.find((m) => m.key === tab) ?? messages[0];
  if (!cur) return null;
  const stateOf = (m: OrderMessageView) => (m.sent ? { text: `Sent ${when(m.sent.at)}`, tone: "ok" as const } : m.ready ? { text: "Ready to send", tone: "bad" as const } : { text: "Not yet", tone: "muted" as const });

  const undo = async () => {
    setBusy(true);
    await adminFetch(`/api/admin/ops/orders/${orderId}/messages/${cur.key}`, { method: "DELETE" }).catch(() => undefined);
    setBusy(false);
    onChanged();
  };
  const tick = async () => {
    setBusy(true);
    await markSent(orderId, cur.key, "other").catch(() => undefined);
    setBusy(false);
    onChanged();
  };

  return (
    <section className="oc-card oc-msgs" aria-labelledby="msgs">
      <div className="oc-card-head">
        <h2 id="msgs">Messages to {name}</h2>
        <span className="oc-small">{contact}</span>
      </div>
      <div role="tablist" aria-label="Message" className="oc-msg-tabs">
        {messages.map((m) => {
          const st = stateOf(m);
          return (
            <button key={m.key} type="button" role="tab" aria-selected={m.key === cur.key} onClick={() => setTab(m.key)}>
              <b>{m.label}</b>
              <span className={`oc-tone-${st.tone}`}>{st.text}</span>
            </button>
          );
        })}
      </div>
      {!cur.sent ? <p className={`oc-note ${cur.ready ? "warn" : "info"}`}>{cur.ready ? `Ready now. ${cur.when}` : `${cur.when} You can still copy it now.`}</p> : null}
      <div className="oc-msg-preview">
        <div className="oc-small" style={{ fontWeight: 700, color: "#1C4D48" }}>
          Preview, as {name} will see it
        </div>
        <div className="oc-msg-text">{cur.text}</div>
      </div>
      <MessageButtons orderId={orderId} msgKey={cur.key} whatsappUrl={cur.whatsappUrl} mailtoUrl={cur.mailtoUrl} text={cur.text} name={name} onSent={onChanged} />
      {cur.sent ? (
        <div className="oc-note ok oc-row" role="status">
          <Check size={16} aria-hidden />
          <span style={{ flex: 1 }}>
            Sent {CHANNEL_LABEL[cur.sent.channel] ?? ""} by {cur.sent.by ?? "staff"}, {when(cur.sent.at)}.
          </span>
          <button type="button" className="oc-btn link" disabled={busy} onClick={() => void undo()}>
            Undo
          </button>
        </div>
      ) : (
        <div className="oc-row">
          <button type="button" className="oc-btn link" disabled={busy} onClick={() => void tick()}>
            Already sent another way? Mark sent
          </button>
          {!cur.ready ? <Pill tone="muted">Not due yet</Pill> : null}
        </div>
      )}
      <p className="oc-small" style={{ margin: 0 }}>
        WhatsApp opens on this phone or WhatsApp Web with the message typed in; you only press send. Email opens your email app with the subject and message filled in.
      </p>
    </section>
  );
}
