/**
 * /auth/done — where the Google sign-in tab lands (client.ts
 * signInWithGoogleInNewTab).
 *
 * It tells the tab the customer came from that sign-in finished, then closes
 * itself, so they're back on the page they left with their uploads still
 * running. Browsers only let a page close a tab that a script opened, which
 * this one was; if it stays open anyway, it says where to go.
 */

import { useEffect, useState } from "react";
import { AUTH_CHANNEL } from "@/features/auth/client";
import { TKLogo } from "@/features/landing/primitives";

export default function AuthDone() {
  const failed = new URLSearchParams(window.location.search).has("error");
  const [stayed, setStayed] = useState(false);

  useEffect(() => {
    const message = failed ? "failed" : "signed-in";
    try {
      const ch = new BroadcastChannel(AUTH_CHANNEL);
      ch.postMessage(message);
      ch.close();
    } catch {
      /* no BroadcastChannel: the other tab checks again when it's looked at */
    }
    const t = setTimeout(() => {
      window.close();
      setStayed(true); // still here: closing wasn't allowed
    }, 400);
    return () => clearTimeout(t);
  }, [failed]);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "var(--tk-paper)", color: "var(--tk-heading)", fontFamily: "var(--tk-font-body)" }}>
      <div style={{ maxWidth: 360, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <TKLogo />
        {stayed ? (
          <>
            <h1 style={{ margin: 0, fontSize: 22, lineHeight: "28px" }}>{failed ? "Sign-in didn't finish" : "You're signed in"}</h1>
            <p style={{ margin: 0, fontSize: 15, lineHeight: "22px", color: "var(--tk-ink-400)" }}>
              {failed ? "Close this tab and try again, or use your email instead." : "You can close this tab and go back to TrueKeeps. Your book is waiting there."}
            </p>
          </>
        ) : null}
      </div>
    </main>
  );
}
