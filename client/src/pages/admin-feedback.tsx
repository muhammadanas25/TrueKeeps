/**
 * /admin/feedback — the feedback inbox (role = admin; docs/adr/015).
 *
 * Newest first, filterable by new / read. Each message shows what the
 * customer chose and wrote, a one-tap way to reply (mailto: for an email,
 * wa.me for a Pakistani mobile number), and the order it's about. "Mark
 * read" is the only state; the server keeps the rest exactly as sent.
 */

import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Feedback } from "@shared/schema";
import { ratingLabel, topicLabel, type FeedbackStatus } from "@shared/feedback";
import { AppShell } from "@/features/account/AppShell";
import { useSession } from "@/features/auth/useSession";
import { formatDate, getJSON, postJSON } from "@/features/orders/api";
import "@/features/feedback/feedback.css";

/** A reply link for what the customer left, or null when it's neither an email nor a PK mobile. */
function replyHref(contact: string): string | null {
  const c = contact.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) return `mailto:${c}`;
  const digits = c.replace(/[^\d+]/g, "");
  const m = digits.match(/^(?:\+92|0092|0)?(3\d{9})$/);
  return m ? `https://wa.me/92${m[1]}` : null;
}

type Row = Omit<Feedback, "createdAt"> & { createdAt: string };

export default function AdminFeedbackPage() {
  const { loading, isAdmin } = useSession();
  const qc = useQueryClient();
  const [status, setStatus] = useState<FeedbackStatus | "">("new");
  const [err, setErr] = useState<string | null>(null);
  const list = useQuery<Row[]>({
    queryKey: ["/api/admin/feedback", status],
    queryFn: () => getJSON(`/api/admin/feedback${status ? `?status=${status}` : ""}`),
    enabled: isAdmin,
    staleTime: 0,
  });

  const mark = async (id: string, next: FeedbackStatus) => {
    setErr(null);
    try {
      await postJSON(`/api/admin/feedback/${id}`, { status: next }, "PATCH");
      await qc.invalidateQueries({ queryKey: ["/api/admin/feedback"] });
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  if (loading) return <AppShell><div className="au-page" aria-busy="true" /></AppShell>;
  if (!isAdmin) {
    return (
      <AppShell>
        <div className="au-page">
          <div className="au-empty">
            <h2>Admins only</h2>
            <Link href="/" className="bb-btn bb-btn-primary">Home</Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const rows = list.data ?? [];
  return (
    <AppShell>
      <div className="au-page fba" style={{ maxWidth: 860 }}>
        <div className="fba-head">
          <div>
            <div className="bb-kicker">Admin</div>
            <h1>Feedback</h1>
            <p>
              Private messages from the feedback page. <Link href="/admin/orders">Back to orders</Link>
            </p>
          </div>
          <select className="fba-filter" value={status} onChange={(e) => setStatus(e.target.value as FeedbackStatus | "")} aria-label="Show">
            <option value="new">New</option>
            <option value="read">Read</option>
            <option value="">All</option>
          </select>
        </div>
        {err ? <p className="au-error" role="alert">{err}</p> : null}
        {list.isLoading ? (
          <div className="fba-empty" aria-busy="true">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="fba-empty">{status === "new" ? "Nothing new. You're all caught up." : "No feedback here yet."}</div>
        ) : (
          <div className="fba-list">
            {rows.map((f) => {
              const href = f.contact ? replyHref(f.contact) : null;
              return (
                <article key={f.id} className={"fba-item" + (f.status === "new" ? " is-new" : "")}>
                  <div className="fba-meta">
                    {f.status === "new" ? <span className="fba-tag new">New</span> : null}
                    <span className="fba-tag">{topicLabel(f.topic)}</span>
                    {f.rating ? <span className="fba-rating">{ratingLabel(f.rating)}</span> : null}
                    <span>{formatDate(f.createdAt)}</span>
                    {f.fromPath ? <span>from {f.fromPath}</span> : null}
                  </div>
                  <p className="fba-msg">{f.message}</p>
                  <div className="fba-foot">
                    <span>
                      {f.name ? <b>{f.name}</b> : "No name"}
                      {f.contact ? (
                        <>
                          {" · "}
                          {href ? (
                            <a href={href} target="_blank" rel="noreferrer">
                              {f.contact}
                            </a>
                          ) : (
                            f.contact
                          )}
                        </>
                      ) : (
                        " · no contact left"
                      )}
                      {f.orderNumber ? ` · order ${f.orderNumber}` : ""}
                    </span>
                    <button type="button" onClick={() => mark(f.id, f.status === "new" ? "read" : "new")}>
                      {f.status === "new" ? "Mark read" : "Mark new"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
