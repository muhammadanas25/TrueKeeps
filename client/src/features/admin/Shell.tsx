/**
 * Admin shell + the second-step gate (docs/adr/018).
 *
 * Order of what renders:
 *   1. GET /api/staff/me. 404 → not signed in, or not staff: the same "page
 *      not found" anyone gets for a wrong URL. The admin never confirms it
 *      exists; staff sign in on the normal site first, then open /admin.
 *   2. staff without an authenticator set up → setup (QR code, first code,
 *      backup codes shown once)
 *   3. staff set up but not passed for this session → the code prompt
 *   4. the console: sidebar on desktop, bottom tabs on a phone
 *
 * If the 12-hour window ends mid-session, any admin request answers
 * STEP_UP_REQUIRED; api.ts fires STEP_UP_EVENT and this re-checks /me, which
 * brings back the prompt where the person was.
 */

import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { BarChart3, Bell, Handshake, Home, LogOut, Package, Printer, Settings, ShieldCheck, Star, Tag } from "lucide-react";
import { ROLE_LABEL } from "@shared/ops";
import { adminFetch, AdminError, STEP_UP_EVENT, useAdminQuery, type StaffMe } from "./api";
import "./admin.css";

const NAV = [
  { href: "/", label: "Overview", icon: Home, owner: false },
  { href: "/orders", label: "Orders", icon: Package, owner: false },
  { href: "/print", label: "Print queue", icon: Printer, owner: false },
  { href: "/analytics", label: "Analytics", icon: BarChart3, owner: true },
  { href: "/notifications", label: "Notifications", icon: Bell, owner: false },
  { href: "/promos", label: "Promo codes", icon: Tag, owner: true },
  { href: "/affiliates", label: "Affiliates", icon: Handshake, owner: true },
  { href: "/team", label: "Team & security", icon: ShieldCheck, owner: true },
];

export function useStaff() {
  return useAdminQuery<StaffMe>(["staff-me"], "/api/staff/me", { refetchOnWindowFocus: true });
}

function NotFoundPage() {
  return (
    <div className="oc-gate">
      <div className="oc-card" role="main">
        <h1>Page not found</h1>
        <p>This page doesn't exist.</p>
        <a className="oc-btn" href="/">
          Go to TrueKeeps
        </a>
      </div>
    </div>
  );
}

/** Setup (first time) or the code prompt. */
function StepUp({ me, onDone }: { me: StaffMe; onDone: () => void }) {
  const [setup, setSetup] = useState<{ qrSvg: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [backup, setBackup] = useState<string[] | null>(null);
  const [useBackup, setUseBackup] = useState(false);

  useEffect(() => {
    if (me.enrolled) return;
    adminFetch<{ qrSvg: string; secret: string }>("/api/staff/2fa/setup", { method: "POST", body: {} })
      .then(setSetup)
      .catch((e: Error) => setErr(e.message));
  }, [me.enrolled]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      if (me.enrolled) {
        await adminFetch("/api/staff/2fa/verify", { method: "POST", body: { code } });
        onDone();
      } else {
        const r = await adminFetch<{ backupCodes: string[] }>("/api/staff/2fa/enroll", { method: "POST", body: { code } });
        setBackup(r.backupCodes);
      }
    } catch (e2) {
      setErr((e2 as Error).message);
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  if (backup) {
    return (
      <div className="oc-gate">
        <div className="oc-card" role="main">
          <h1>Save your backup codes</h1>
          <p>If your phone is lost, each of these lets you in once. Keep them somewhere safe, not on the same phone. They won't be shown again.</p>
          <div className="oc-codes oc-mono" aria-label="Backup codes">
            {backup.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <button className="oc-btn primary" onClick={onDone}>
            I've saved them, open the admin
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="oc-gate">
      <form className="oc-card" onSubmit={submit} role="main" aria-labelledby="su-title">
        <img src="/email-logo.png" alt="TrueKeeps" style={{ height: 24, width: "auto", alignSelf: "flex-start" }} />
        <h1 id="su-title">{me.enrolled ? "Enter your admin code" : "Set up your admin code"}</h1>
        {me.enrolled ? (
          <p className="oc-sub">
            Signed in as {me.email} ({ROLE_LABEL[me.role]}). Open your authenticator app and type the 6-digit code for TrueKeeps Admin.
          </p>
        ) : (
          <>
            <p className="oc-sub">
              The admin needs a second step. Scan this with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password), then type the code it shows.
            </p>
            {setup ? (
              <>
                <div className="oc-qr" dangerouslySetInnerHTML={{ __html: setup.qrSvg }} aria-label="QR code for your authenticator app" role="img" />
                <details>
                  <summary className="oc-small">Can't scan? Type this key instead</summary>
                  <p className="oc-mono" style={{ wordBreak: "break-all" }}>
                    {setup.secret}
                  </p>
                </details>
              </>
            ) : (
              <div className="oc-skel" style={{ height: 200 }} />
            )}
          </>
        )}
        {me.lockedUntil ? <p className="oc-note bad">Too many wrong codes. Try again after {new Date(me.lockedUntil).toLocaleTimeString("en-PK")}.</p> : null}
        <label className="oc-field">
          {useBackup ? "Backup code" : "6-digit code"}
          <input
            className={useBackup ? "" : "oc-code"}
            inputMode={useBackup ? "text" : "numeric"}
            autoComplete="one-time-code"
            autoFocus
            value={code}
            onChange={(e) => setCode(useBackup ? e.target.value.toUpperCase().slice(0, 9) : e.target.value.replace(/\D/g, "").slice(0, 6))}
            required
          />
        </label>
        {err ? (
          <p className="oc-err" role="alert">
            {err}
          </p>
        ) : null}
        <button className="oc-btn primary" disabled={busy || (useBackup ? code.length < 8 : code.length !== 6)}>
          {busy ? "Checking…" : me.enrolled ? "Open the admin" : "Finish setup"}
        </button>
        {me.enrolled ? (
          <button type="button" className="oc-btn link" onClick={() => (setUseBackup(!useBackup), setCode(""))}>
            {useBackup ? "Use the app code instead" : "Lost your phone? Use a backup code"}
          </button>
        ) : null}
        <p className="oc-small">Admin access lasts 12 hours on this device, then asks again.</p>
      </form>
    </div>
  );
}

function Nav({ me, path }: { me: StaffMe; path: string }) {
  const qc = useQueryClient();
  const items = NAV.filter((n) => !n.owner || me.role === "admin");
  const active = (href: string) => (href === "/" ? path === "/" || path === "" : path.startsWith(href));
  const lock = async () => {
    await adminFetch("/api/staff/lock", { method: "POST", body: {} }).catch(() => undefined);
    qc.clear();
    window.location.href = "/";
  };
  return (
    <>
      <nav className="oc-nav" aria-label="Admin">
        <img className="oc-logo" src="/email-logo.png" alt="TrueKeeps" />
        {items.map((n) => (
          <Link key={n.href} href={n.href} className={active(n.href) ? "on" : ""} aria-current={active(n.href) ? "page" : undefined}>
            <n.icon size={18} aria-hidden />
            {n.label}
          </Link>
        ))}
        <a href="/admin/reviews">
          <Star size={18} aria-hidden />
          Reviews
        </a>
        <div className="oc-who">
          <b>{me.name || me.email}</b>
          <span>
            {ROLE_LABEL[me.role]} · code passed until {me.elevatedUntil ? new Date(me.elevatedUntil).toLocaleTimeString("en-PK", { hour: "numeric", minute: "2-digit" }) : "—"}
          </span>
          <button className="oc-btn link" onClick={lock} style={{ alignSelf: "flex-start", paddingLeft: 0 }}>
            <LogOut size={14} aria-hidden /> Lock the admin
          </button>
        </div>
      </nav>
      <nav className="oc-tabbar" aria-label="Admin">
        {[items[0], items[1], items[2], items.find((i) => i.href === "/notifications")!, { href: "/more", label: "More", icon: Settings, owner: false }].map((n) => (
          <Link key={n.href} href={n.href} className={active(n.href) ? "on" : ""}>
            <n.icon size={22} aria-hidden />
            {n.label}
          </Link>
        ))}
      </nav>
    </>
  );
}

export function Shell({ children }: { children: (me: StaffMe) => ReactNode }) {
  const [path] = useLocation();
  const me = useStaff();
  const qc = useQueryClient();

  useEffect(() => {
    const again = () => void qc.invalidateQueries({ queryKey: ["staff-me"] });
    window.addEventListener(STEP_UP_EVENT, again);
    return () => window.removeEventListener(STEP_UP_EVENT, again);
  }, [qc]);

  useEffect(() => {
    const prev = document.title;
    document.title = "Admin · TrueKeeps";
    return () => void (document.title = prev);
  }, []);

  if (me.isLoading) return <div className="oc-gate" aria-busy="true" />;
  if (me.error) {
    const e = me.error as AdminError;
    if (e.code === "NO_DATABASE") return <div className="oc-gate"><div className="oc-card"><h1>Admin unavailable</h1><p>{e.message}</p></div></div>;
    return <NotFoundPage />;
  }
  const staff = me.data!;
  if (!staff.elevatedUntil) return <StepUp me={staff} onDone={() => void qc.invalidateQueries()} />;

  return (
    <div className="oc">
      <Nav me={staff} path={path} />
      <main className="oc-main" id="admin-main">
        {children(staff)}
      </main>
    </div>
  );
}

/** Phone "More" sheet: the pages that don't fit in the bottom bar. */
export function MorePage({ me }: { me: StaffMe }) {
  return (
    <>
      <div className="oc-head">
        <h1>More</h1>
      </div>
      <div className="oc-card">
        {NAV.filter((n) => !n.owner || me.role === "admin").map((n) => (
          <Link key={n.href} href={n.href} className="oc-btn" style={{ justifyContent: "flex-start" }}>
            <n.icon size={18} aria-hidden /> {n.label}
          </Link>
        ))}
        <a className="oc-btn" href="/admin/reviews" style={{ justifyContent: "flex-start" }}>
          <Star size={18} aria-hidden /> Reviews
        </a>
      </div>
    </>
  );
}
