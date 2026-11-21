/**
 * Team & security, Owner only (canvas board A4Team).
 *
 *  - Staff: name, email, role (Owner / Ops), whether their authenticator is
 *    set up, last admin sign-in and IP. Change role, remove (their admin access
 *    ends immediately), reset a lost phone's authenticator.
 *  - Invite by email: applied now if they have an account, otherwise at their
 *    first sign-in.
 *  - Activity log: every admin change, download, sign-in and failed code.
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ROLE_LABEL } from "@shared/ops";
import { adminFetch, useAdminQuery, type StaffMe } from "../api";
import { when } from "../format";
import { ErrorNote, Loading, Pill } from "../parts";

type TeamData = {
  staff: Array<{ id: string; name: string; email: string; role: string; enrolledAt: string | null; lockedUntil: string | null; lastStepUp: string | null; lastIp: string | null }>;
  invites: Array<{ email: string; role: string; createdAt: string }>;
};
type Audit = { list: Array<{ id: string; actorEmail: string | null; actorRole: string | null; action: string; targetType: string | null; targetId: string | null; detail: unknown; ip: string | null; createdAt: string }> };

const ACTION_TEXT: Record<string, string> = {
  "staff.step_up": "Signed in to the admin",
  "staff.step_up_backup_code": "Signed in with a backup code",
  "staff.2fa_enrolled": "Set up their authenticator",
  "staff.2fa_wrong_code": "Wrong admin code",
  "staff.2fa_locked": "Locked after wrong codes",
  "staff.2fa_reset": "Reset an authenticator",
  "staff.role_set": "Changed a role",
  "staff.invited": "Invited someone",
  "staff.forbidden": "Tried an Owner-only page",
  "staff.ip_blocked": "Blocked: not an allowed IP",
  "staff.locked_session": "Locked the admin",
  "print.download": "Downloaded a print file",
  "print.rebuild": "Rebuilt a print file",
  "order.status": "Changed an order's status",
  "order.update": "Edited an order",
  "notify.rule_saved": "Changed who gets a notification",
  "notify.test": "Sent a test notification",
  "notify.resend": "Resent a message",
  "export.orders_csv": "Exported orders (CSV)",
};

export function TeamPage({ me }: { me: StaffMe }) {
  const team = useAdminQuery<TeamData>(["team"], "/api/admin/ops/team");
  const audit = useAdminQuery<Audit>(["audit"], "/api/admin/ops/audit?limit=200");
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"ops" | "admin">("ops");
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: "ok", text: ok });
      void qc.invalidateQueries({ queryKey: ["team"] });
      void qc.invalidateQueries({ queryKey: ["audit"] });
    } catch (e) {
      setMsg({ tone: "bad", text: (e as Error).message });
    }
  };

  return (
    <>
      <div className="oc-head">
        <h1>Team & security</h1>
      </div>
      {msg ? <p className={`oc-note ${msg.tone}`}>{msg.text}</p> : null}

      <section className="oc-card flush" aria-labelledby="st">
        <div className="oc-card-head" style={{ padding: "14px 16px 0" }}>
          <h2 id="st">Staff</h2>
        </div>
        {team.error ? <ErrorNote error={team.error} /> : null}
        {!team.data ? (
          <Loading />
        ) : (
          <div className="oc-table-wrap">
            <table className="oc-table" style={{ minWidth: 820 }}>
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Role</th>
                  <th>Authenticator</th>
                  <th>Last admin sign-in</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {team.data.staff.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="stack">
                        <b style={{ color: "#2A1E5C" }}>{s.name || s.email}</b>
                        <span className="oc-small">{s.email}</span>
                      </div>
                    </td>
                    <td>
                      <label className="oc-sr" htmlFor={`role-${s.id}`}>
                        Role for {s.email}
                      </label>
                      <select
                        id={`role-${s.id}`}
                        className="oc-input"
                        value={s.role}
                        disabled={s.id === meId(team.data, me)}
                        onChange={(e) => run(() => adminFetch(`/api/admin/ops/team/${s.id}`, { method: "PATCH", body: { role: e.target.value } }), "Role changed")}
                      >
                        <option value="admin">Owner</option>
                        <option value="ops">Ops</option>
                      </select>
                    </td>
                    <td>
                      {s.enrolledAt ? <Pill tone="ok">Set up</Pill> : <Pill tone="warn">Not set up yet</Pill>}
                      {s.lockedUntil && new Date(s.lockedUntil) > new Date() ? <Pill tone="bad">Locked</Pill> : null}
                    </td>
                    <td className="oc-small">
                      {when(s.lastStepUp)}
                      {s.lastIp ? ` · ${s.lastIp}` : ""}
                    </td>
                    <td>
                      <div className="oc-row">
                        {s.enrolledAt ? (
                          <button className="oc-btn sm" onClick={() => window.confirm(`Reset ${s.email}'s authenticator? They'll set it up again at their next admin sign-in.`) && run(() => adminFetch(`/api/admin/ops/team/${s.id}/reset-2fa`, { method: "POST", body: {} }), "Authenticator reset")}>
                            Reset authenticator
                          </button>
                        ) : null}
                        {s.id !== meId(team.data, me) ? (
                          <button className="oc-btn danger sm" onClick={() => window.confirm(`Remove ${s.email} from the admin? Their access ends now.`) && run(() => adminFetch(`/api/admin/ops/team/${s.id}`, { method: "PATCH", body: { role: "customer" } }), "Removed")}>
                            Remove
                          </button>
                        ) : (
                          <span className="oc-small">you</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form
          className="oc-row"
          style={{ padding: 16, borderTop: "1px solid #EAECEC" }}
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const r = await adminFetch<{ applied: boolean }>("/api/admin/ops/team/invite", { method: "POST", body: { email, role } });
              setEmail("");
              return r;
            }, "Done. If they already have an account the role applies now; otherwise at their first sign-in.");
          }}
        >
          <label className="oc-field" style={{ flex: "1 1 240px" }}>
            Add someone by email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="name@example.com" />
          </label>
          <label className="oc-field">
            Role
            <select value={role} onChange={(e) => setRole(e.target.value as "ops" | "admin")}>
              <option value="ops">Ops: orders and printing</option>
              <option value="admin">Owner: everything</option>
            </select>
          </label>
          <button className="oc-btn primary" style={{ alignSelf: "flex-end" }}>
            Add
          </button>
        </form>
        {team.data?.invites.length ? (
          <div style={{ padding: "0 16px 16px" }}>
            <span className="oc-small">Waiting for first sign-in: </span>
            {team.data.invites.map((i) => (
              <span key={i.email} className="oc-pill info" style={{ marginRight: 6 }}>
                {i.email} · {ROLE_LABEL[i.role]}
                <button type="button" aria-label={`Cancel invite for ${i.email}`} onClick={() => run(() => adminFetch(`/api/admin/ops/team/invite/${encodeURIComponent(i.email)}`, { method: "DELETE" }), "Invite cancelled")} style={{ border: "none", background: "transparent", cursor: "pointer", color: "inherit" }}>
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </section>

      <section className="oc-card">
        <div className="oc-card-head">
          <h2>Payment methods</h2>
          <a className="oc-btn sm" href="/admin/legacy-orders">
            Card / bank transfer switches
          </a>
        </div>
        <p className="oc-small" style={{ margin: 0 }}>Which ways to pay checkout offers. These switches still live on the previous orders page while they move here.</p>
      </section>

      <section className="oc-card">
        <h2>How the admin is protected</h2>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: "24px" }}>
          <li>Anyone who isn't staff gets "page not found", from the pages and from the API.</li>
          <li>Staff must enter a code from an authenticator app; it lasts 12 hours on one device.</li>
          <li>Five wrong codes lock that person for 15 minutes. Every sign-in emails the Owner (Notifications → Staff signed in).</li>
          <li>Roles are re-read on every request: removing someone ends their access at once.</li>
          <li>Print files download through 15-minute links, and each download is logged below.</li>
          <li>Optional: limit the admin to your office or home IPs with ADMIN_IP_ALLOWLIST in Railway.</li>
        </ul>
      </section>

      <section className="oc-card flush" aria-labelledby="au">
        <h2 id="au" style={{ padding: "14px 16px 0" }}>
          Activity log
        </h2>
        {audit.error ? <ErrorNote error={audit.error} /> : null}
        {!audit.data ? (
          <Loading />
        ) : (
          <div className="oc-table-wrap">
            <table className="oc-table" style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>What</th>
                  <th>Detail</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {audit.data.list.map((a) => (
                  <tr key={a.id}>
                    <td className="oc-small">{when(a.createdAt)}</td>
                    <td>{a.actorEmail ?? "system"}</td>
                    <td className={/wrong|locked|blocked|forbidden/.test(a.action) ? "oc-tone-bad" : ""}>{ACTION_TEXT[a.action] ?? a.action}</td>
                    <td className="oc-small oc-mono" style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.targetType ? `${a.targetType} ${String(a.targetId ?? "").slice(0, 12)}` : ""} {a.detail ? JSON.stringify(a.detail).slice(0, 120) : ""}
                    </td>
                    <td className="oc-small">{a.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

const meId = (data: TeamData, me: StaffMe) => data.staff.find((s) => s.email === me.email)?.id;
