/**
 * /partners: the affiliate's own page (canvas board R6Partner, docs/adr/022).
 *
 * Who sees what: an affiliate signs in with the email the owner added them
 * with (magic link or Google). GET /api/partner/me finds their affiliate row
 * and answers their link, this month's numbers, their money and their
 * orders. Customers' names, phones and addresses are never sent, by design.
 * Anyone else signed in sees a short "not a partner account" note.
 *
 * Phone first: the link card (Copy, Share on WhatsApp) on top, because that
 * is what they come here for most.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, MessageCircle } from "lucide-react";
import { formatPKR } from "@shared/pricing";
import { AppShell } from "@/features/account/AppShell";
import { useSession } from "@/features/auth/useSession";
import { SignInSheet } from "@/features/auth/SignInSheet";
import { getJSON } from "@/features/orders/api";
import "./partners.css";

interface PartnerMe {
  affiliate: { name: string; link: string; commission: string; active: boolean; payout: string } | null;
  month?: string;
  kpis?: { visitors: number; started: number; orders: number; earned: number };
  money?: { waiting: number; due: number; nextDue: string | null; paid: number };
  orders?: Array<{ id: string; date: string; book: string; kind: string; amount: number; state: string; label: string }>;
  payouts?: Array<{ label: string; amount: number; reference: string; paidAt: string }>;
  rules?: { windowDays: number; holdDays: number; payoutDay: number };
}

const shortDay = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Karachi" }) : "");
const signed = (minor: number) => (minor < 0 ? `− ${formatPKR(-minor)}` : formatPKR(minor));
const toneOf = (state: string) => (state === "waiting" || state === "hold" ? "pt-warn" : state === "reversed" || state === "taken_back" ? "pt-bad" : state === "approved" ? "pt-ok" : "pt-ind");

function LinkCard({ link, commission, windowDays }: { link: string; commission: string; windowDays: number }) {
  const [copied, setCopied] = useState(false);
  const share = `https://wa.me/?text=${encodeURIComponent(`Make a photo book of your favourite memories with TrueKeeps: ${link}`)}`;
  return (
    <section className="pt-link" aria-labelledby="pt-ln">
      <b id="pt-ln">Your link</b>
      <code>{link}</code>
      <div className="pt-actions">
        <button
          type="button"
          onClick={() =>
            void navigator.clipboard?.writeText(link).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            })
          }
        >
          <Copy size={16} aria-hidden="true" /> {copied ? "Copied" : "Copy link"}
        </button>
        <a href={share} target="_blank" rel="noopener noreferrer">
          <MessageCircle size={16} aria-hidden="true" /> Share on WhatsApp
        </a>
      </div>
      <small>
        You earn {commission.replace(/^(\d+%) of each paid book$/, "$1 of every book")} bought within {windowDays} days of someone tapping your link. They pay the normal price.
      </small>
    </section>
  );
}

export default function PartnersPage() {
  const { loading, isMember, user } = useSession();
  const q = useQuery<PartnerMe>({
    queryKey: ["/api/partner/me"],
    queryFn: () => getJSON("/api/partner/me"),
    enabled: isMember,
    staleTime: 0,
  });

  if (!loading && !isMember) {
    return (
      <AppShell>
        <div className="pt">
          <h1>Partners</h1>
          <SignInSheet intent="partner" callbackURL="/partners" />
        </div>
      </AppShell>
    );
  }
  if (loading || q.isLoading) {
    return (
      <AppShell>
        <div className="pt" aria-busy="true" />
      </AppShell>
    );
  }
  const d = q.data;
  if (q.error || !d) {
    return (
      <AppShell>
        <div className="pt">
          <div className="pt-empty" role="alert">
            We couldn't load your page. Please refresh in a moment.
          </div>
        </div>
      </AppShell>
    );
  }
  if (!d.affiliate) {
    return (
      <AppShell>
        <div className="pt">
          <h1>Partners</h1>
          <div className="pt-empty">
            <b>This account isn't a partner account.</b>
            <span>
              You're signed in as {user?.email}. If TrueKeeps added you as a partner with a different email, sign out and sign in with that one. To become a partner, message us on WhatsApp.
            </span>
          </div>
        </div>
      </AppShell>
    );
  }

  const { affiliate: a, kpis: k, money: m, orders = [], payouts = [], rules } = d;
  return (
    <AppShell>
      <div className="pt">
        <h1>Hi {a.name.split(/\s+/)[0]}</h1>
        {!a.active ? <p className="pt-paused">Your link is paused, so new taps and orders aren't counted. Orders already credited are still paid.</p> : null}
        <LinkCard link={a.link} commission={a.commission} windowDays={rules?.windowDays ?? 30} />

        {k ? (
          <div className="pt-kpis" aria-label={`${d.month} so far`}>
            <div className="pt-kpi">
              <span>People who tapped</span>
              <b>{k.visitors.toLocaleString("en-US")}</b>
              <small>{d.month}</small>
            </div>
            <div className="pt-kpi">
              <span>Started a book</span>
              <b>{k.started.toLocaleString("en-US")}</b>
              <small>{k.visitors ? `${Math.round((k.started / k.visitors) * 100)}%` : "this month"}</small>
            </div>
            <div className="pt-kpi">
              <span>Books bought</span>
              <b>{k.orders}</b>
              <small>this month</small>
            </div>
            <div className="pt-kpi">
              <span>Earned</span>
              <b className="pt-ok">{formatPKR(k.earned)}</b>
              <small>this month</small>
            </div>
          </div>
        ) : null}

        {m ? (
          <section className="pt-card" aria-labelledby="pt-mo">
            <h2 id="pt-mo">Your money</h2>
            <div className="pt-row">
              <span>Waiting for delivery</span>
              <b className="pt-warn">{formatPKR(m.waiting)}</b>
            </div>
            <div className="pt-row">
              <span>{m.due < 0 ? "Taken back, off your next payout" : m.nextDue ? `To be paid on ${shortDay(m.nextDue)}` : "To be paid"}</span>
              <b className={m.due < 0 ? "pt-bad" : "pt-ok"}>{signed(m.due)}</b>
            </div>
            <div className="pt-row">
              <span>Paid so far</span>
              <b className="pt-ind">{formatPKR(m.paid)}</b>
            </div>
            <span className="pt-note">
              Paid to {a.payout} on the {rules?.payoutDay ?? 5}th of each month, for books delivered at least {rules?.holdDays ?? 7} days before the month ended.
            </span>
          </section>
        ) : null}

        <section className="pt-card" aria-labelledby="pt-or">
          <h2 id="pt-or">Your orders</h2>
          {!orders.length ? <span className="pt-note">No orders yet. When someone buys a book through your link, it shows here.</span> : null}
          {orders.map((o) => (
            <div className="pt-row" key={o.id} style={{ minHeight: 44 }}>
              <span className="stack">
                <b>
                  {shortDay(o.date)} · {o.book}
                </b>
                <span>{o.kind === "clawback" ? "Refunded after payout, taken back" : o.label}</span>
              </span>
              {o.state === "reversed" ? (
                <s className="pt-note" style={{ margin: 0 }} aria-label={`${formatPKR(o.amount)}, not earned`}>
                  {formatPKR(o.amount)}
                </s>
              ) : (
                <b className={o.kind === "clawback" ? "pt-bad" : toneOf(o.state)}>{signed(o.amount)}</b>
              )}
            </div>
          ))}
          <span className="pt-note">Customer names and addresses are private and never shown here.</span>
        </section>

        {payouts.length ? (
          <section className="pt-card" aria-labelledby="pt-pa">
            <h2 id="pt-pa">Payouts</h2>
            {payouts.map((p, i) => (
              <div className="pt-row" key={i}>
                <span className="stack">
                  <b>{p.label}</b>
                  <span>
                    Sent {shortDay(p.paidAt)} · ref {p.reference}
                  </span>
                </span>
                <b className="pt-ind">{formatPKR(p.amount)}</b>
              </div>
            ))}
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
