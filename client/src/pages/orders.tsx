/**
 * /orders — the signed-in customer's orders, newest first.
 * Guests are offered sign-in (orders always belong to a verified email).
 */

import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";
import { formatPKR } from "@shared/pricing";
import { STATUS_LABEL } from "@shared/orders";
import { AppShell } from "@/features/account/AppShell";
import { useSession } from "@/features/auth/useSession";
import { SignInSheet } from "@/features/auth/SignInSheet";
import { bindingName, formatDate, getJSON, type PublicOrder } from "@/features/orders/api";
import "@/features/orders/orders.css";

export default function OrdersPage() {
  const { loading, isMember } = useSession();
  const q = useQuery<PublicOrder[]>({
    queryKey: ["/api/orders"],
    queryFn: () => getJSON("/api/orders"),
    enabled: isMember,
    staleTime: 0,
  });

  return (
    <AppShell>
      <div className="au-page">
        <div className="au-page-head">
          <div>
            <div className="bb-kicker">Your account</div>
            <h1>My orders</h1>
          </div>
          <Link href="/books" className="bb-btn bb-btn-secondary">
            My books
          </Link>
        </div>

        {!loading && !isMember ? (
          <SignInSheet intent="generic" callbackURL="/orders" onClose={() => history.back()} />
        ) : q.isLoading || loading ? (
          <div className="au-page" aria-busy="true" />
        ) : (q.data ?? []).length === 0 ? (
          <div className="au-empty">
            <Package size={28} />
            <h2>No orders yet</h2>
            <p style={{ margin: 0 }}>When you order a book, it shows up here with its delivery status.</p>
            <Link href="/books" className="bb-btn bb-btn-primary">
              Go to my books
            </Link>
          </div>
        ) : (
          <ul className="or-list">
            {q.data!.map((o) => (
              <li key={o.id}>
                <Link href={`/orders/${o.id}`} className="or-row">
                  <div>
                    <b>{o.title}</b>
                    <span>
                      {o.orderNumber} · {o.qty} × {bindingName(o.binding)} · {formatDate(o.createdAt)}
                    </span>
                  </div>
                  <div className="or-row-end">
                    <span className={"or-status s-" + o.status}>{STATUS_LABEL[o.status]}</span>
                    <b>{formatPKR(o.totalMinor)}</b>
                    {!o.livemode ? <span className="or-tag">TEST</span> : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
