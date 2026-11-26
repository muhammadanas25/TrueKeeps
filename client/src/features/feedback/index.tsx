/**
 * /review — a private line from customers to the TrueKeeps team.
 *
 * Called "Leave a review" for customers (owner, 2026-11-16) but private:
 * nothing is published, and the page says so. /feedback, its first address,
 * redirects here (App.tsx). Code and data keep the name "feedback".
 *
 * What: one short form (what it's about, how it went, the message, and an
 * optional way to reply), saved by POST /api/feedback and emailed to the
 * team (server/routes/feedback.ts, docs/adr/015).
 *
 * Approach:
 *  - Public-page chrome (landing Nav + Footer, Paper ground, Indigo headings,
 *    one Rose action) so it reads as part of the site, not the app.
 *  - Only the topic and the message are required; the rating, name, contact
 *    and order number are optional and say so.
 *  - Links can prefill it: `?order=TK-…` fills the order number and picks
 *    "My order or delivery"; `?topic=` picks a topic; `?from=` records where
 *    the visitor came from (else the same-site referrer).
 *  - Errors show next to their field and in one summary with an icon and
 *    words (the kit has no error colour; Rose 50 + Rose 800, ADR 010).
 *  - Honest copy: nothing here promises a reply time or claims reviews.
 *
 * Styles: feedback.css (`.fb-*`). Buttons use the landing's `.lp-btn` classes
 * on their own, never mixed with another file's class on the same element
 * (see memory: CSS load order differs in production).
 */

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { AlertCircle, ArrowRight, Check } from "lucide-react";
import {
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_MESSAGE_MIN,
  FEEDBACK_RATINGS,
  FEEDBACK_TOPICS,
  type FeedbackRating,
  type FeedbackTopic,
} from "@shared/feedback";
import { BUILDER_PATH, Footer, Nav } from "@/features/landing/sections";
import "@/features/landing/landing.css";
import "./feedback.css";

type FieldErrors = Partial<Record<"topic" | "message" | "contact" | "name" | "orderNumber" | "_", string>>;

/** Read the prefill parameters once, in the browser. */
function usePrefill() {
  return useMemo(() => {
    if (typeof window === "undefined") return { order: "", topic: null as FeedbackTopic | null, from: "" };
    const q = new URLSearchParams(window.location.search);
    const order = (q.get("order") ?? "").slice(0, 32);
    const t = q.get("topic");
    const topic = FEEDBACK_TOPICS.some((x) => x.id === t) ? (t as FeedbackTopic) : order ? "order" : null;
    let from = q.get("from") ?? "";
    if (!from && document.referrer) {
      try {
        const r = new URL(document.referrer);
        if (r.origin === window.location.origin) from = r.pathname;
      } catch {
        /* not a URL */
      }
    }
    return { order, topic, from: from.slice(0, 200) };
  }, []);
}

export default function FeedbackPage() {
  const prefill = usePrefill();
  const [topic, setTopic] = useState<FeedbackTopic | null>(prefill.topic);
  const [rating, setRating] = useState<FeedbackRating | null>(null);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [orderNumber, setOrderNumber] = useState(prefill.order);
  const [website, setWebsite] = useState(""); // honeypot
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = "Leave a review | TrueKeeps";
  }, []);

  const showOrder = topic === "order" || topic === "print" || Boolean(orderNumber);
  const left = FEEDBACK_MESSAGE_MAX - message.length;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // The same rules the server applies, checked here first so people see them at once.
    const fe: FieldErrors = {};
    if (!topic) fe.topic = "Choose what it's about";
    if (message.trim().length < FEEDBACK_MESSAGE_MIN) fe.message = "Write a few words, so we know what happened";
    setErrors(fe);
    if (Object.keys(fe).length) {
      // take keyboard and screen-reader users straight to the first thing to fix
      const first = fe.topic ? document.querySelector<HTMLInputElement>(".fb-chips input") : document.querySelector<HTMLTextAreaElement>(".fb-field textarea");
      first?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, rating, message, name, contact, orderNumber, from: prefill.from, website }),
      });
      if (res.ok) {
        setSent(true);
        window.scrollTo(0, 0);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string; fields?: Record<string, string> };
      if (data.code === "RATE_LIMITED") setErrors({ _: "You've sent a few messages just now. Please try again in a few minutes." });
      else if (data.fields) setErrors({ ...(data.fields as FieldErrors), _: "Please check the highlighted fields." });
      else setErrors({ _: "Your message didn't send. Please try again." });
    } catch {
      setErrors({ _: "Your message didn't send. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lp lp-page fb">
      <Nav />
      <main className="lp-wrap fb-wrap">
        <header className="fb-intro">
          <div className="lp-eyebrow">Leave a review</div>
          <h1>Tell us how it went</h1>
          <p className="fb-lede">Something you loved, something that went wrong, or an idea for us. Every review comes straight to the TrueKeeps team.</p>
          <ul className="fb-promises">
            <li>
              <Check size={16} strokeWidth={2.4} aria-hidden="true" /> It only takes a minute, and only two answers are needed.
            </li>
            <li>
              <Check size={16} strokeWidth={2.4} aria-hidden="true" /> Leave an email or WhatsApp number if you'd like us to get back to you.
            </li>
            <li>
              <Check size={16} strokeWidth={2.4} aria-hidden="true" /> Your review stays private. We don't publish what you write.
            </li>
          </ul>
        </header>

        {sent ? (
          <section className="fb-card fb-thanks" aria-live="polite">
            <span className="fb-thanks-mark" aria-hidden="true">
              <Check size={22} strokeWidth={2.6} />
            </span>
            <h2>Thank you for your review</h2>
            <p>It reached us.{contact.trim() ? " We'll use the details you left if we need to get back to you." : ""}</p>
            <div className="fb-thanks-actions">
              <Link href={BUILDER_PATH} className="lp-btn lp-btn-main">
                Start my album <ArrowRight size={17} />
              </Link>
              <Link href="/" className="lp-link">
                Back to home
              </Link>
            </div>
          </section>
        ) : (
          <form className="fb-card" onSubmit={submit} noValidate>
            {errors._ ? (
              <p className="fb-alert" role="alert">
                <AlertCircle size={17} aria-hidden="true" /> {errors._}
              </p>
            ) : null}

            <fieldset className="fb-group" aria-describedby={errors.topic ? "fb-topic-err" : undefined}>
              <legend>What's it about?</legend>
              <div className="fb-chips">
                {FEEDBACK_TOPICS.map((t) => (
                  <label key={t.id} className={"fb-chip" + (topic === t.id ? " on" : "")}>
                    <input type="radio" name="topic" value={t.id} checked={topic === t.id} onChange={() => setTopic(t.id)} />
                    {topic === t.id ? <Check size={14} strokeWidth={2.6} aria-hidden="true" /> : null}
                    {t.label}
                  </label>
                ))}
              </div>
              {errors.topic ? (
                <em className="fb-err" id="fb-topic-err">
                  {errors.topic}
                </em>
              ) : null}
            </fieldset>

            <fieldset className="fb-group">
              <legend>
                How did it go? <i>(optional)</i>
              </legend>
              <div className="fb-chips fb-rating">
                {FEEDBACK_RATINGS.map((r) => (
                  <label key={r.id} className={"fb-chip" + (rating === r.id ? " on" : "")}>
                    <input
                      type="radio"
                      name="rating"
                      value={r.id}
                      checked={rating === r.id}
                      onChange={() => setRating(r.id)}
                      // a second tap on the chosen answer clears it, since this one is optional
                      onClick={() => rating === r.id && setRating(null)}
                    />
                    {r.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="fb-field">
              <span>Your message</span>
              <textarea
                rows={6}
                maxLength={FEEDBACK_MESSAGE_MAX}
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  if (errors.message) setErrors((x) => ({ ...x, message: undefined }));
                }}
                placeholder="What happened, what you liked, or what we could do better"
                aria-invalid={Boolean(errors.message) || undefined}
                aria-describedby="fb-msg-help"
              />
              {errors.message ? (
                <em className="fb-err" id="fb-msg-help">
                  {errors.message}
                </em>
              ) : (
                <small id="fb-msg-help" className={left < 100 ? "fb-near" : undefined}>
                  {left < 300 ? `${left} characters left` : "As long or as short as you like."}
                </small>
              )}
            </label>

            <div className="fb-row">
              <label className="fb-field">
                <span>
                  Your name <i>(optional)</i>
                </span>
                <input autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="fb-field">
                <span>
                  Email or WhatsApp <i>(optional)</i>
                </span>
                <input
                  autoComplete="email"
                  maxLength={120}
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="you@example.com or 0300 1234567"
                  aria-describedby="fb-contact-help"
                />
                <small id="fb-contact-help">Only if you'd like a reply.</small>
              </label>
            </div>

            {showOrder ? (
              <label className="fb-field fb-order">
                <span>
                  Order number <i>(optional)</i>
                </span>
                <input maxLength={32} value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="TK-XXXXXX" />
                <small>It's on your order confirmation email.</small>
              </label>
            ) : null}

            {/* Honeypot: hidden from people and screen readers; bots fill it in. */}
            <label className="fb-hp" aria-hidden="true">
              Website
              <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </label>

            <div className="fb-submit">
              <button type="submit" className="lp-btn lp-btn-main lp-btn-lg" disabled={busy}>
                {busy ? "Sending…" : "Send review"}
                {busy ? null : <ArrowRight size={18} />}
              </button>
            </div>
          </form>
        )}
      </main>
      <Footer />
    </div>
  );
}
