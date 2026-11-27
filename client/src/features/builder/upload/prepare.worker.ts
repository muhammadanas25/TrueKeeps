/**
 * Web Worker wrapper around the photo work in prepare.ts, so decoding a batch
 * of huge photos never stutters the page the customer is using. One request
 * at a time per worker; the pool lives in pool.ts.
 *
 * Two jobs: "prepare" (the display copy and thumbnail, when a photo is picked)
 * and "print" (the quality 0.95 print copy, just before its HD upload).
 */

import { makePrintCopy, preparePhoto, type PreparedPhoto } from "./prepare";

export type PrepareRequest =
  | { op: "prepare"; source: Blob; makeMaster: boolean }
  | { op: "print"; source: Blob; maxShortEdge: number | null; quality: number };

export type PrepareResponse = { ok: true; result: PreparedPhoto | Blob | undefined } | { ok: false; error: string };

self.onmessage = async (e: MessageEvent<PrepareRequest>) => {
  let reply: PrepareResponse;
  try {
    const req = e.data;
    const result = req.op === "print" ? await makePrintCopy(req.source, req.maxShortEdge, req.quality) : await preparePhoto(req.source, req.makeMaster);
    reply = { ok: true, result };
  } catch (err) {
    reply = { ok: false, error: err instanceof Error ? err.message : "prepare failed" };
  }
  self.postMessage(reply);
};
