/**
 * CORS policy.
 *
 * The app is same-origin (Express serves the built client), so CORS
 * exists only for the Vite dev server and any future separate frontend.
 * With session cookies in play the rule is strict: in production only
 * the configured APP_URL may make credentialed requests — and if it is
 * not configured we allow NO cross-origin requests rather than
 * reflecting every Origin (the previous behaviour, which paired with
 * `credentials: true` would have let any site read a user's data).
 */

import type { CorsOptions } from "cors";
import { config } from "./config";

const allowed = new Set<string>([config.appUrl]);
if (!config.isProd) {
  allowed.add(`http://localhost:${config.port}`);
  allowed.add(`http://127.0.0.1:${config.port}`);
  allowed.add("http://localhost:5173"); // vite standalone
}

export const corsConfig: CorsOptions = {
  origin: (origin, cb) => {
    // same-origin / non-browser requests carry no Origin header → allow
    if (!origin) return cb(null, true);
    cb(null, allowed.has(origin));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 600,
};
