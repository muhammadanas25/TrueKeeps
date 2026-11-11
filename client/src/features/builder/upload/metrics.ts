/**
 * Upload measurements — how long each batch of photos took, to compare by
 * batch size, photo size and connection (docs/adr/014).
 *
 * One tracker per batch (each time the customer picks photos). The engine
 * calls `mark` as each photo moves through its stages; when every photo in
 * the batch has settled, one report goes to POST /api/uploads/metrics.
 *
 * If the page closes first, whatever was measured so far goes as an
 * `unfinished` report, sent with `keepalive` so the browser delivers it even
 * though the page is going away. The finished report reuses the batch id, so
 * it replaces the unfinished one if the customer comes back.
 *
 * Measurements only: sizes, pixel counts, times, connection type. No file
 * names, no photos, nothing typed by the customer.
 */

type Stage = "prepared" | "inBook" | "hd";

interface PhotoTiming {
  sourceBytes: number;
  type: string;
  megapixels?: number;
  prepareStart?: number;
  prepared?: number;
  displayStart?: number;
  inBook?: number;
  originalStart?: number;
  hd?: number;
  originalBytes?: number;
  displayBytes?: number;
  settled: boolean;
}

/** What the browser will tell us about the device and connection. All optional. */
function environment() {
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; downlink?: number };
    deviceMemory?: number;
    userAgentData?: { mobile?: boolean };
  };
  const ua = nav.userAgent;
  const browser = /Edg\//.test(ua)
    ? "edge"
    : /SamsungBrowser/.test(ua)
      ? "samsung"
      : /Chrome\//.test(ua)
        ? "chrome"
        : /Firefox\//.test(ua)
          ? "firefox"
          : /Safari\//.test(ua)
            ? "safari"
            : "other";
  return {
    connection: nav.connection?.effectiveType ?? null,
    downlinkMbps: nav.connection?.downlink ?? null,
    deviceMemoryGb: nav.deviceMemory ?? null,
    cpuCores: nav.hardwareConcurrency ?? null,
    mobile: nav.userAgentData?.mobile ?? (window.matchMedia?.("(pointer: coarse)").matches || /Mobi/.test(ua)),
    browser,
  };
}

const typeOf = (file: File) => (/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name) ? "heic" : file.type.replace("image/", "").slice(0, 8) || "other");

export class BatchTracker {
  readonly id: string;
  private readonly started = performance.now();
  private readonly photos = new Map<string, PhotoTiming>();
  private rejected = 0;
  private duplicates = 0;
  private retries = 0;
  private stalls = 0;
  private reportedFinal = false;

  constructor(
    id: string,
    private readonly kind: "new" | "resume",
    private readonly projectId: () => string | null,
  ) {
    this.id = id;
  }

  add(photoId: string, file: File) {
    this.photos.set(photoId, { sourceBytes: file.size, type: typeOf(file), settled: false });
  }

  duplicate() {
    this.duplicates++;
  }

  retry(stalled: boolean) {
    this.retries++;
    if (stalled) this.stalls++;
  }

  /** Record that a photo reached `stage` (or started on it, with `start`). */
  mark(photoId: string, stage: Stage | "prepareStart" | "displayStart" | "originalStart", extra: Partial<PhotoTiming> = {}) {
    const p = this.photos.get(photoId);
    if (!p) return;
    p[stage] = performance.now();
    Object.assign(p, extra);
    if (stage === "hd") p.settled = true;
  }

  /** A photo left the batch without finishing: unreadable, or refused by the server. */
  reject(photoId: string) {
    const p = this.photos.get(photoId);
    if (p) this.photos.delete(photoId);
    this.rejected++;
  }

  /** photos in this batch still being tracked */
  get size(): number {
    return this.photos.size;
  }

  get settled(): boolean {
    return Array.from(this.photos.values()).every((p) => p.settled);
  }

  has(photoId: string): boolean {
    return this.photos.has(photoId);
  }

  /** Build the report. Times are ms since the photos were picked. */
  private report(status: "complete" | "unfinished") {
    const list = Array.from(this.photos.values());
    const since = (t?: number) => (t === undefined ? null : Math.round(t - this.started));
    const latest = (pick: (p: PhotoTiming) => number | undefined) => {
      const ts = list.map(pick);
      return ts.length && ts.every((t) => t !== undefined) ? since(Math.max(...(ts as number[]))) : null;
    };
    const inBooks = list.map((p) => p.inBook).filter((t): t is number => t !== undefined);
    const hdStarts = list.map((p) => p.originalStart).filter((t): t is number => t !== undefined);
    const hdEnds = list.map((p) => p.hd).filter((t): t is number => t !== undefined);
    const originalBytes = list.reduce((a, p) => a + (p.hd ? (p.originalBytes ?? 0) : 0), 0);
    // speed of the HD phase only: from the first original starting to the last finishing
    const hdSeconds = hdStarts.length && hdEnds.length ? (Math.max(...hdEnds) - Math.min(...hdStarts)) / 1000 : 0;
    const dur = (a?: number, b?: number) => (a !== undefined && b !== undefined ? Math.round(b - a) : null);
    return {
      id: this.id,
      projectId: this.projectId(),
      status,
      kind: this.kind,
      photoCount: list.length,
      rejectedCount: this.rejected,
      duplicateCount: this.duplicates,
      heicCount: list.filter((p) => p.type === "heic").length,
      sourceBytes: list.reduce((a, p) => a + p.sourceBytes, 0),
      originalBytes,
      displayBytes: list.reduce((a, p) => a + (p.displayBytes ?? 0), 0),
      firstInBookMs: inBooks.length ? since(Math.min(...inBooks)) : null,
      allInBookMs: latest((p) => p.inBook),
      allHdMs: latest((p) => p.hd),
      hdMbps: hdSeconds > 0.5 ? Math.round(((originalBytes * 8) / 1e6 / hdSeconds) * 100) / 100 : null,
      retries: this.retries,
      stalls: this.stalls,
      ...environment(),
      photos: list.map((p) => [
        Math.round(p.sourceBytes / 1024),
        Math.round((p.megapixels ?? 0) * 10) / 10,
        dur(p.prepareStart, p.prepared),
        dur(p.displayStart, p.inBook),
        dur(p.originalStart, p.hd),
        p.type,
      ]),
    };
  }

  /** Send the report. `final` once everything settled; otherwise an interim one as the page closes. */
  send(final: boolean) {
    if (this.reportedFinal || !this.photos.size) return;
    if (final) this.reportedFinal = true;
    const body = JSON.stringify(this.report(final ? "complete" : "unfinished"));
    // Measurements are a nice-to-have: never let them get in the customer's way.
    try {
      void fetch("/api/uploads/metrics", {
        method: "POST",
        credentials: "include",
        keepalive: body.length < 60_000,
        headers: { "Content-Type": "application/json" },
        body,
      }).catch(() => undefined);
    } catch {
      /* ignore */
    }
  }
}
