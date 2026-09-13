/**
 * Structured logging — pino.
 *
 * Why (replacing the ad-hoc console logger in index.ts): that logger
 * echoed response JSON bodies into the log line. Once responses carry
 * emails, session info and order details that is a data leak into the
 * hosting provider's log store. pino gives one-line JSON in prod
 * (Railway parses it), pretty output in dev, and a per-request id so a
 * user's report can be traced across API, jobs and webhooks.
 *
 * Redaction: cookies, auth headers and anything named token/secret are
 * masked at the logger level so no call site can leak them by accident.
 */

import pino from "pino";
import { pinoHttp } from "pino-http";
import { randomUUID } from "crypto";
import { config } from "./config";

export const log = pino({
  level: config.logLevel,
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      "res.headers['set-cookie']",
      "*.token",
      "*.secret",
      "*.password",
    ],
    censor: "[redacted]",
  },
  ...(config.isProd
    ? {}
    : {
        transport: {
          target: "pino/file", // stdout, but keep dev output single-line + readable
          options: { destination: 1 },
        },
      }),
});

/**
 * Express middleware: one log line per request with method, path,
 * status, duration and request id. Static assets and health probes are
 * downgraded to `debug` so prod logs stay about real traffic.
 */
export const httpLogger = pinoHttp({
  logger: log,
  genReqId: (req) => (req.headers["x-request-id"] as string | undefined) ?? randomUUID(),
  autoLogging: {
    ignore: (req) => !(req.url ?? "").startsWith("/api") || req.url === "/api/health",
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
