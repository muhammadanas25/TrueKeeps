/**
 * /account — profile + preferences for a signed-in member.
 *
 * Guests are shown the sign-in sheet instead (there's nothing to edit
 * on a guest). Writes go through PATCH /api/me; the query cache is
 * updated from the response so the page never shows stale values.
 */

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { LogOut } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AppShell } from "@/features/account/AppShell";
import { useSession, ME_QUERY_KEY } from "@/features/auth/useSession";
import { SignInSheet } from "@/features/auth/SignInSheet";
import { signOut } from "@/features/auth/client";

export default function AccountPage() {
  const { loading, isMember, user, refresh } = useSession();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (user) {
      setName(user.name ?? "");
      setPhone(user.phone ?? "");
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: async (patch: { name?: string; phone?: string | null; marketingOptOut?: boolean }) => {
      const res = await apiRequest("PATCH", "/api/me", patch);
      return res.json();
    },
    onSuccess: (data) => {
      qc.setQueryData(ME_QUERY_KEY, (old: { user: unknown; providers: unknown } | undefined) => (old ? { ...old, user: data.user } : old));
      toast({ title: "Saved" });
    },
    onError: (e: Error) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }),
  });

  if (loading) {
    return (
      <AppShell>
        <div className="au-page" aria-busy="true" />
      </AppShell>
    );
  }

  if (!isMember || !user) {
    return (
      <AppShell>
        <div className="au-page">
          <SignInSheet intent="generic" callbackURL="/account" onClose={() => navigate("/")} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="au-page" style={{ maxWidth: 720 }}>
        <div className="au-page-head">
          <div>
            <div className="bb-kicker">Account</div>
            <h1>Your details</h1>
            <p className="au-page-sub">{user.email}</p>
          </div>
        </div>

        <section className="au-section">
          <h2>Profile</h2>
          <div className="au-form">
            <label className="au-label" htmlFor="acc-name">
              Name
            </label>
            <div className="au-field">
              <input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="How should we address you?" maxLength={80} />
            </div>
            <label className="au-label" htmlFor="acc-phone">
              Mobile number
            </label>
            <div className="au-field">
              <input id="acc-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+92 3xx xxxxxxx" inputMode="tel" />
            </div>
            <p className="au-fine">Used by the courier to reach you at delivery. Optional until you order.</p>
            <button
              className="bb-btn bb-btn-primary"
              style={{ alignSelf: "flex-start" }}
              disabled={save.isPending}
              onClick={() => save.mutate({ name: name.trim(), phone: phone.trim() || null })}
            >
              Save changes
            </button>
          </div>
        </section>

        <section className="au-section">
          <h2>Email</h2>
          <div className="au-row">
            <div className="au-row-text">
              <b>Reminders about unfinished books</b>
              <span>A nudge or two if you leave a book half-done. Order and shipping emails are always sent.</span>
            </div>
            <button
              className={"au-toggle " + (!user.marketingOptOut ? "on" : "")}
              role="switch"
              aria-checked={!user.marketingOptOut}
              aria-label="Reminder emails"
              disabled={save.isPending}
              onClick={() => save.mutate({ marketingOptOut: !user.marketingOptOut })}
            />
          </div>
        </section>

        <section className="au-section">
          <h2>Session</h2>
          <div className="au-row">
            <div className="au-row-text">
              <b>Sign out of this device</b>
              <span>Your books stay in your account.</span>
            </div>
            <button
              className="bb-btn bb-btn-secondary"
              onClick={async () => {
                await signOut();
                await refresh();
                navigate("/");
              }}
            >
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
