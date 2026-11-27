/**
 * UploadNotices — keeps uploads alive on every page of the site, and says so
 * when it matters.
 *
 * Mounted once at the app shell (App.tsx), but only for visitors with photos
 * on their way: on any page while a book is being made, and on the first page
 * load that finds photos kept on the phone from an earlier visit (pending.ts).
 * Everyone else never downloads this code.
 *
 * What it does:
 *   - claim(): carries on with photos from an earlier visit or a closed tab
 *     (engine.ts), wherever the customer lands.
 *   - "Welcome back. We're carrying on." (design A3, owner-approved
 *     2026-11-28), once, after claim() carried photos over. It says how many
 *     and that there's nothing to choose again, then gets out of the way:
 *     the customer keeps designing with the display copies, and nothing is
 *     shown on each photo.
 *   - "Uploading again" (design C2): when the customer comes back from
 *     another app and the upload made no progress while they were away,
 *     which is what iPhones do. It also restarts the upload straight away.
 *   - Keeps the screen awake while photos upload, because a sleeping phone
 *     suspends the page.
 *   - Asks before the page closes while photos are still uploading (the
 *     browser's own "Leave site?" box; it's the only thing a page may show
 *     then). A deliberate hand-over, like Google sign-in, announces itself
 *     with a "tk:leaving" event and isn't asked about.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { RotateCw, X } from "lucide-react";
import { uploadEngine } from "./engine";
import { formatEta } from "./tips";
import "./notices.css";

/** Away at least this long before "Uploading again" is worth saying. */
const AWAY_MS = 8_000;
/** Less HD progress than this while away counts as paused. */
const PAUSED_BELOW_BYTES = 256 * 1024;
/** How long each message stays before it fades by itself. */
const WELCOME_MS = 12_000;
const AGAIN_MS = 8_000;

/** Keep the screen on while there's work to do. Quietly does nothing where unsupported. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const next = await navigator.wakeLock.request("screen");
        if (cancelled) void next.release();
        else lock = next;
      } catch {
        /* refused (low battery, background tab); uploading carries on regardless */
      }
    };
    // the browser drops the lock whenever the tab is hidden
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, [active]);
}

/** Ask before the page closes mid-upload, unless the page is leaving on purpose. */
function useLeaveWarning(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let quietUntil = 0;
    const onLeaving = () => {
      quietUntil = Date.now() + 5_000;
    };
    const warn = (e: BeforeUnloadEvent) => {
      if (Date.now() < quietUntil) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("tk:leaving", onLeaving);
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("tk:leaving", onLeaving);
      window.removeEventListener("beforeunload", warn);
    };
  }, [active]);
}

export default function UploadNotices() {
  const snapshot = useSyncExternalStore(uploadEngine.subscribe, uploadEngine.getSnapshot);
  const [welcome, setWelcome] = useState<"pending" | "showing" | "done">("pending");
  const [again, setAgain] = useState(false);

  useEffect(() => {
    void uploadEngine.claim();
  }, []);

  useWakeLock(snapshot.active);
  useLeaveWarning(snapshot.active);

  // A3: once per visit, as soon as something was carried over
  const restored = snapshot.restored;
  useEffect(() => {
    if (welcome !== "pending" || !restored?.left) return;
    setWelcome("showing");
    const t = setTimeout(() => setWelcome("done"), WELCOME_MS);
    return () => clearTimeout(t);
  }, [restored, welcome]);

  // C2: back from another app with nothing sent meanwhile
  const away = useRef<{ at: number; sent: number; active: boolean } | null>(null);
  useEffect(() => {
    const onVisibility = () => {
      const snap = uploadEngine.getSnapshot();
      if (document.visibilityState === "hidden") {
        away.current = { at: Date.now(), sent: snap.sentBytes, active: snap.active };
        return;
      }
      const was = away.current;
      away.current = null;
      if (!was?.active || !snap.active || Date.now() - was.at < AWAY_MS) return;
      uploadEngine.retryNow(); // don't wait out a backoff the phone caused
      if (snap.sentBytes - was.sent < PAUSED_BELOW_BYTES) setAgain(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  useEffect(() => {
    if (!again) return;
    const t = setTimeout(() => setAgain(false), AGAIN_MS);
    return () => clearTimeout(t);
  }, [again]);

  if (again && snapshot.active) {
    return (
      <div className="un-wrap">
        <div className="un-card un-dark" role="status">
          <RotateCw size={20} aria-hidden="true" className="un-ic" />
          <div className="un-text">
            <b>Uploading again</b>
            <span>Your phone paused it while you were in another app. Nothing was lost. Staying on this screen keeps it going.</span>
          </div>
          <button type="button" className="un-close" aria-label="Close" onClick={() => setAgain(false)}>
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  if (welcome === "showing" && restored) {
    const saved = restored.total - restored.left;
    return (
      <div className="un-wrap">
        <div className="un-card" role="status">
          <div className="un-row">
            <span className="un-badge" aria-hidden="true">
              <RotateCw size={20} />
            </span>
            <div className="un-text">
              <b>Welcome back. We're carrying on.</b>
              <span>
                {restored.total} HD {restored.total === 1 ? "copy was" : "copies were"} left when the page closed. They were saved on this phone, so there's nothing to choose again.
              </span>
            </div>
            <button type="button" className="un-close" aria-label="Close" onClick={() => setWelcome("done")}>
              <X size={16} />
            </button>
          </div>
          <span className="un-bar" aria-hidden="true">
            <span style={{ width: `${Math.round((saved / restored.total) * 100)}%` }} />
          </span>
          <span className="un-meta">
            {restored.left ? `${saved} of ${restored.total} saved` : "All saved"}
            {restored.left && snapshot.etaSeconds !== null ? ` · ${formatEta(snapshot.etaSeconds)} left` : ""}
          </span>
        </div>
      </div>
    );
  }

  return null;
}
