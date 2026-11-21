/**
 * First-party analytics tracker (docs/adr/018) → POST /api/events.
 *
 * What it sends, batched and via sendBeacon so closing the tab doesn't lose it:
 *  - page_view on every route change
 *  - page_time: ACTIVE milliseconds on a page or builder step. The clock runs
 *    only while the tab is visible and someone touched, typed, scrolled or
 *    moved the mouse in the last 30 s, so a tab left open overnight doesn't
 *    count as 8 hours "on the photos step".
 *  - step when the builder moves to a new step (trackStep)
 *  - vital: Google's Web Vitals (LCP, INP, CLS, FCP, TTFB) via `web-vitals`
 *  - error: uncaught errors and promise rejections (message only)
 *  - rage: 3+ taps on the same element within a second
 *  - once per visit: screen width, touch, connection type and Chrome's
 *    downlink estimate, a download speed measured from the page's own files,
 *    UTM tags and the referring site
 *
 * What it never sends: names, emails, photos, typed text, full URLs with
 * query strings (the server strips ids too). `anonId` is a random id in
 * localStorage; `visitId` lives for the tab.
 *
 * Off on /admin (staff browsing isn't customer behaviour) and when the
 * browser sends Do Not Track / Global Privacy Control.
 */

import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from "web-vitals";

type Ev = Record<string, unknown> & { name: string; path: string };

const IDLE_MS = 30_000;
const FLUSH_MS = 10_000;

const queue: Ev[] = [];
let context: Record<string, unknown> | null = null;
let started = false;
let anonId = "";
let visitId = "";

let currentPath = "";
let currentStep: string | null = null;
let activeMs = 0;
let lastTick = 0;
let lastInput = 0;

const rid = () => (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
const off = () => {
  const n = navigator as Navigator & { globalPrivacyControl?: boolean };
  return n.doNotTrack === "1" || n.globalPrivacyControl === true || location.pathname.startsWith("/admin");
};

function storedId(key: string, store: Storage): string {
  try {
    let v = store.getItem(key);
    if (!v) {
      v = rid();
      store.setItem(key, v);
    }
    return v;
  } catch {
    return rid();
  }
}

/** Accrue active time up to now (only counts while visible and recently used). */
function tick() {
  const now = performance.now();
  if (lastTick && document.visibilityState === "visible" && now - lastInput < IDLE_MS) activeMs += now - lastTick;
  lastTick = now;
}

function closeTimer() {
  tick();
  if (currentPath && activeMs >= 500) {
    queue.push({ name: "page_time", path: currentPath, activeMs: Math.round(activeMs), ...(currentStep ? { step: currentStep } : {}) });
  }
  activeMs = 0;
}

function flush() {
  if (!queue.length || off()) {
    queue.length = 0;
    return;
  }
  const events = queue.splice(0, 40);
  const body = JSON.stringify({ anonId, visitId, ...(context ? { context } : {}), events });
  context = null;
  const blob = new Blob([body], { type: "application/json" });
  if (!(navigator.sendBeacon && navigator.sendBeacon("/api/events", blob))) {
    void fetch("/api/events", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true, credentials: "include" }).catch(() => undefined);
  }
  if (queue.length) flush();
}

/** Download speed from the page's own resources (bytes / time), in Mbps. */
function measuredMbps(): number | undefined {
  const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
  const big = entries.filter((e) => e.transferSize > 30_000 && e.responseEnd > e.responseStart);
  if (!big.length) return undefined;
  const bytes = big.reduce((a, e) => a + e.transferSize, 0);
  const ms = big.reduce((a, e) => a + (e.responseEnd - e.responseStart), 0);
  return ms > 0 ? Math.round(((bytes * 8) / (ms / 1000) / 1e6) * 10) / 10 : undefined;
}

function buildContext() {
  const c = (navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number; rtt?: number } }).connection;
  const params = new URLSearchParams(location.search);
  const utm = {
    source: params.get("utm_source") ?? undefined,
    medium: params.get("utm_medium") ?? undefined,
    campaign: params.get("utm_campaign") ?? undefined,
  };
  let referrerHost: string | undefined;
  try {
    const r = document.referrer ? new URL(document.referrer).hostname : "";
    referrerHost = r && r !== location.hostname ? r.slice(0, 120) : undefined;
  } catch {
    /* ignore */
  }
  return {
    screenW: Math.round(screen.width),
    touch: "ontouchstart" in window || navigator.maxTouchPoints > 0,
    connection: c?.effectiveType,
    downlinkMbps: c?.downlink,
    rttMs: c?.rtt,
    measuredMbps: measuredMbps(),
    ...(utm.source || utm.medium || utm.campaign ? { utm } : {}),
    referrerHost,
  };
}

function onVital(m: Metric) {
  queue.push({ name: "vital", path: currentPath || location.pathname, vital: { metric: m.name, value: Math.round(m.value * (m.name === "CLS" ? 1000 : 1)) / (m.name === "CLS" ? 1000 : 1), rating: m.rating } });
}

/** Call once at app start. */
export function startTracking() {
  if (started || typeof window === "undefined") return;
  started = true;
  anonId = storedId("tk_aid", localStorage);
  visitId = storedId("tk_vid", sessionStorage);
  lastInput = performance.now();

  const input = () => (lastInput = performance.now());
  for (const t of ["pointerdown", "keydown", "scroll", "touchstart", "mousemove"]) addEventListener(t, input, { passive: true, capture: true });
  setInterval(tick, 1000);
  setInterval(flush, FLUSH_MS);

  addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      closeTimer();
      flush();
    } else {
      lastTick = performance.now();
    }
  });
  addEventListener("pagehide", () => {
    closeTimer();
    flush();
  });

  addEventListener("error", (e) => {
    if (queue.length < 200) queue.push({ name: "error", path: currentPath, message: String(e.message || "error").slice(0, 300), source: e.filename ? String(e.filename).slice(0, 200) : undefined });
  });
  addEventListener("unhandledrejection", (e) => {
    if (queue.length < 200) queue.push({ name: "error", path: currentPath, message: String((e.reason as Error)?.message ?? e.reason ?? "rejection").slice(0, 300) });
  });

  // rage taps: 3 on the same element within a second
  let taps: Array<{ t: number; el: EventTarget | null }> = [];
  addEventListener(
    "pointerdown",
    (e) => {
      const now = performance.now();
      taps = [...taps.filter((x) => now - x.t < 1000), { t: now, el: e.target }];
      if (taps.length >= 3 && taps.every((x) => x.el === e.target)) {
        const el = e.target as HTMLElement;
        const label = (el.getAttribute?.("aria-label") || el.textContent || el.tagName || "").trim().slice(0, 60);
        queue.push({ name: "rage", path: currentPath, target: `${el.tagName?.toLowerCase() ?? "?"}: ${label}`.slice(0, 120) });
        taps = [];
      }
    },
    { passive: true, capture: true },
  );

  for (const on of [onLCP, onINP, onCLS, onFCP, onTTFB]) on(onVital);

  // context once the page's own files have loaded, so the speed sample is fair
  const ready = () => setTimeout(() => (context = buildContext()), 3000);
  if (document.readyState === "complete") ready();
  else addEventListener("load", ready, { once: true });
}

/** Route changed (called from App on every location change). */
export function trackPage(path: string) {
  if (!started || path === currentPath) return;
  closeTimer();
  currentPath = path;
  currentStep = null;
  lastTick = performance.now();
  if (!off()) queue.push({ name: "page_view", path });
}

/** The builder moved to a step (ids in FUNNEL_STEPS, shared/ops.ts). */
export function trackStep(step: string) {
  if (!started || step === currentStep) return;
  closeTimer();
  currentStep = step;
  lastTick = performance.now();
  if (!off()) queue.push({ name: "step", path: currentPath || location.pathname, step });
}
