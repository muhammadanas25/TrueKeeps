/**
 * Small shared helpers for route modules.
 *
 * - `parse(schema, body, res)`: zod-validate a request body and, on
 *   failure, answer 400 with a compact field → message map. Returns
 *   undefined when it has already responded, so handlers read as
 *   `const body = parse(...); if (!body) return;`.
 * - `asyncHandler`: routes are async; without this a rejected promise
 *   becomes an unhandled rejection instead of reaching the Express
 *   error handler.
 */

import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodTypeAny, z } from "zod";

export function parse<S extends ZodTypeAny>(schema: S, body: unknown, res: Response): z.infer<S> | undefined {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    fields[issue.path.join(".") || "_"] = issue.message;
  }
  res.status(400).json({ error: "Invalid request", fields });
  return undefined;
}

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
