/**
 * SignInSheet — the one sign-in UI, used everywhere a session is asked for.
 *
 * Two intents share it (copy differs, mechanics don't):
 *  - "save": soft prompt from the builder — dismissible, book keeps working
 *  - "order": hard gate before checkout — we need a verified email
 *
 * Methods: Google (one tap, if configured server-side) and email magic
 * link (works for everyone, no password to remember or leak). After
 * sending a link we stay open showing "check your inbox" — the link
 * lands the user back on `callbackURL` with the session cookie set and
 * their guest draft already merged (server/auth.ts onLinkAccount).
 *
 * Styling reuses the builder's modal tokens so it feels native there;
 * own classes are prefixed `au-` (client/src/features/auth/auth.css).
 */

import { useState, type FormEvent } from "react";
import { Mail, X, Check, ArrowRight } from "lucide-react";
import { sendMagicLink, signInWithGoogle } from "./client";
import { useSession } from "./useSession";
import "./auth.css";

export type SignInIntent = "save" | "order" | "generic";

const COPY: Record<SignInIntent, { title: string; sub: string }> = {
  save: {
    title: "Save this book to your account",
    sub: "Pick up on any device, and we'll keep it safe until you're ready to order.",
  },
  order: {
    title: "Sign in to place your order",
    sub: "We'll send your order confirmation and shipping updates to this email.",
  },
  generic: {
    title: "Sign in to TrueKeep",
    sub: "Your books, your orders, on any device.",
  },
};

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.4 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z" />
      <path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.3 0 11.7-2.1 15.6-5.7l-7.7-6c-2.1 1.4-4.8 2.3-7.9 2.3-6.3 0-11.6-3.9-13.5-9.3l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

export function SignInSheet({
  intent = "generic",
  onClose,
  callbackURL,
}: {
  intent?: SignInIntent;
  /** omit to make the sheet non-dismissible (hard gate) */
  onClose?: () => void;
  /** where the magic link / Google callback should land */
  callbackURL?: string;
}) {
  const { googleEnabled } = useSession();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[intent];

  const onGoogle = async () => {
    setBusy(true);
    setError(null);
    const res = await signInWithGoogle(callbackURL);
    if (res.error) {
      setError(res.error.message ?? "Google sign-in failed. Try email instead.");
      setBusy(false);
    }
    // success = browser navigates away to Google
  };

  const onEmail = async (e: FormEvent) => {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("Enter a valid email address");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await sendMagicLink(value, callbackURL);
    setBusy(false);
    if (res.error) {
      setError(res.error.status === 429 ? "Too many attempts — try again in a minute." : res.error.message ?? "Couldn't send the link.");
      return;
    }
    setSent(value);
  };

  return (
    <div className="bb-modal-veil au-veil" role="dialog" aria-modal="true" aria-labelledby="au-title">
      <div className="bb-modal au-sheet">
        <div className="bb-modal-head">
          <h3 id="au-title">{sent ? "Check your inbox" : copy.title}</h3>
          {onClose ? (
            <button className="bb-btn bb-btn-ghost au-close" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          ) : null}
        </div>
        <div className="bb-modal-body">
          {sent ? (
            <div className="au-sent">
              <span className="au-sent-ic">
                <Check size={22} strokeWidth={2.5} />
              </span>
              <p>
                We sent a sign-in link to <b>{sent}</b>. Open it on this device and your book comes with you.
              </p>
              <button className="bb-btn bb-btn-ghost" onClick={() => setSent(null)}>
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <p className="au-sub">{copy.sub}</p>
              {googleEnabled ? (
                <>
                  <button className="au-google" onClick={onGoogle} disabled={busy}>
                    <GoogleMark /> Continue with Google
                  </button>
                  <div className="au-or">
                    <span>or</span>
                  </div>
                </>
              ) : null}
              <form onSubmit={onEmail} className="au-form">
                <label className="au-label" htmlFor="au-email">
                  Email
                </label>
                <div className="au-field">
                  <Mail size={16} />
                  <input
                    id="au-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={busy}
                  />
                </div>
                <button className="bb-btn bb-btn-primary bb-btn-lg au-submit" type="submit" disabled={busy}>
                  Send me a sign-in link <ArrowRight size={17} />
                </button>
                {error ? <p className="au-error">{error}</p> : null}
                <p className="au-fine">No password needed. The link works once and expires in 15 minutes.</p>
              </form>
              {intent === "save" && onClose ? (
                <button className="bb-btn bb-btn-ghost au-later" onClick={onClose}>
                  Maybe later
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
