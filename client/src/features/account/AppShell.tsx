/**
 * AppShell — the light chrome shared by account pages (/books, /account).
 *
 * Same sticky nav as the builder (wordmark + account menu) so moving
 * between "my books" and the builder feels like one app, without
 * dragging the whole builder shell along. Reuses builder.css tokens.
 */

import type { ReactNode } from "react";
import { Link } from "wouter";
import { TKMark } from "@/features/landing/primitives";
import { AccountMenu } from "@/features/auth/AccountMenu";
import "@/features/builder/builder.css";
import "@/features/auth/auth.css";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="bb-shell">
      <header className="bb-nav">
        <Link href="/" className="bb-wordmark" aria-label="TrueKeep home">
          <TKMark size={26} />
          <span>
            True<em>Keep</em>
          </span>
        </Link>
        <div className="bb-nav-right">
          <Link href="/wizard" className="bb-btn bb-btn-ghost">
            New book
          </Link>
          <AccountMenu />
        </div>
      </header>
      <main className="bb-main">{children}</main>
    </div>
  );
}
