/**
 * AccountMenu — nav-corner identity control.
 *
 * Renders one of:
 *  - nothing while the session is loading (no "Sign in" flash for members)
 *  - a "Sign in" button for guests (opens SignInSheet)
 *  - an avatar for members with a small popover: My books, Account, Sign out
 *
 * Kept dependency-free (no Radix) so it drops into both the landing nav
 * and the builder nav without pulling extra chunks into the entry bundle.
 */

import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { BookOpen, LogOut, Settings } from "lucide-react";
import { useSession } from "./useSession";
import "./auth.css";

// The sheet (and better-auth's client behind it) only loads on demand,
// so the landing page's entry chunk stays free of auth code.
const SignInSheet = lazy(() => import("./SignInSheet").then((m) => ({ default: m.SignInSheet })));

function initials(name: string, email: string | null): string {
  const src = name.trim() || email || "";
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").toUpperCase() + (parts[1]?.[0] ?? "").toUpperCase();
}

export function AccountMenu({ signInClassName = "bb-btn bb-btn-ghost" }: { signInClassName?: string }) {
  const { loading, user, isMember, refresh } = useSession();
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [, navigate] = useLocation();
  const ref = useRef<HTMLDivElement>(null);

  // close popover on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (loading) return null;

  if (!isMember || !user) {
    return (
      <>
        <button className={signInClassName} onClick={() => setSheet(true)}>
          Sign in
        </button>
        {sheet ? (
          <Suspense fallback={null}>
            <SignInSheet intent="generic" onClose={() => setSheet(false)} />
          </Suspense>
        ) : null}
      </>
    );
  }

  const onSignOut = async () => {
    setOpen(false);
    const { signOut } = await import("./client");
    await signOut();
    await refresh();
    navigate("/");
  };

  return (
    <div className="au-menu" ref={ref}>
      <button className="au-avatar" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Account">
        {user.image ? <img src={user.image} alt="" referrerPolicy="no-referrer" /> : initials(user.name, user.email)}
      </button>
      {open ? (
        <div className="au-menu-pop" role="menu">
          <div className="au-menu-email">{user.email}</div>
          <Link href="/books" onClick={() => setOpen(false)} role="menuitem">
            <BookOpen size={16} /> My books
          </Link>
          <Link href="/account" onClick={() => setOpen(false)} role="menuitem">
            <Settings size={16} /> Account
          </Link>
          <button onClick={onSignOut} role="menuitem">
            <LogOut size={16} /> Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
