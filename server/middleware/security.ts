/**
 * Security middleware — headers, proxy trust, CSRF-by-origin.
 *
 * Threat model this addresses (see plan, "Security hardening"):
 *  - Session cookies now exist → a cross-site page must not be able to
 *    make the browser send state-changing requests with them. Cookies
 *    are SameSite=Lax (auth.ts) AND every mutating /api request must
 *    carry an Origin/Referer matching our own origin. Webhooks (Phase
 *    2B) are exempt by path because they authenticate with signatures.
 *  - Clickjacking / MIME sniffing / downgrade → helmet defaults + HSTS.
 *  - CSP is REPORT-ONLY to start: the app loads Google Fonts and (later)
 *    redirects to Safepay; we enforce once the report stream is clean.
 *  - Railway terminates TLS at its edge → `trust proxy` so Express sees
 *    https (Secure cookies) and the real client IP (rate limiting).
 */

import helmet from "helmet";
import type { Express, NextFunction, Request, Response } from "express";
import { config } from "../config";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Paths that authenticate by signature instead of cookie+origin. */
const ORIGIN_CHECK_EXEMPT = [/^\/api\/payments\/webhook\//];

/**
 * Reject cross-origin state changes. Browsers always send `Origin` on
 * cross-site POSTs (and on same-site ones from fetch), and
 * `Sec-Fetch-Site` on modern engines; a missing Origin with a
 * same-origin Referer is accepted for older clients. Non-browser
 * clients (curl, jobs) send neither → allowed only if they also present
 * no cookie, i.e. they cannot be riding a user's session.
 */
export function originCheck(req: Request, res: Response, next: NextFunction) {
  if (!MUTATING.has(req.method) || !req.path.startsWith("/api")) return next();
  if (ORIGIN_CHECK_EXEMPT.some((re) => re.test(req.path))) return next();

  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const fetchSite = req.headers["sec-fetch-site"];
  const hasCookie = Boolean(req.headers.cookie);

  const allowed = new Set([config.appUrl]);
  if (!config.isProd) {
    // Vite dev server / localhost variants
    allowed.add(`http://localhost:${config.port}`);
    allowed.add(`http://127.0.0.1:${config.port}`);
  }

  if (fetchSite === "same-origin" || fetchSite === "none") return next();
  if (origin) return allowed.has(origin) ? next() : res.status(403).json({ error: "Cross-origin request blocked" });
  if (referer) {
    try {
      return allowed.has(new URL(referer).origin) ? next() : res.status(403).json({ error: "Cross-origin request blocked" });
    } catch {
      return res.status(403).json({ error: "Cross-origin request blocked" });
    }
  }
  // No browser provenance headers at all: fine for cookie-less API
  // clients, suspicious if a session cookie is attached.
  return hasCookie ? res.status(403).json({ error: "Missing origin" }) : next();
}

export function applySecurity(app: Express) {
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  const mediaOrigin = config.s3.publicBaseUrl ? new URL(config.s3.publicBaseUrl).origin : null;

  app.use(
    helmet({
      // CSP is report-only until we've watched it in prod for a while
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false, // photos from R2 are cross-origin
      crossOriginResourcePolicy: { policy: "cross-origin" },
      hsts: config.isProd ? { maxAge: 60 * 60 * 24 * 180, includeSubDomains: true } : false,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    }),
  );

  app.use(
    helmet.contentSecurityPolicy({
      reportOnly: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        // Archivo via Google Fonts, Clash Display via Fontshare (index.css)
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://api.fontshare.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.fontshare.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "https:", ...(mediaOrigin ? [mediaOrigin] : [])],
        connectSrc: ["'self'", ...(mediaOrigin ? [mediaOrigin] : [])],
        frameAncestors: ["'none'"],
        formAction: ["'self'", "https://accounts.google.com"],
        // meaningless in report-only mode and Chrome logs an error for it
        upgradeInsecureRequests: null,
      },
    }),
  );

  app.use(originCheck);
}
