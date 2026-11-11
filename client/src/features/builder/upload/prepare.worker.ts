/**
 * Web Worker wrapper around preparePhoto, so decoding a batch of huge photos
 * never stutters the page the customer is using. One request at a time per
 * worker; the pool lives in pool.ts.
 */

import { preparePhoto, type PreparedPhoto } from "./prepare";

export interface PrepareRequest {
  source: Blob;
  makeMaster: boolean;
}

export type PrepareResponse = { ok: true; result: PreparedPhoto } | { ok: false; error: string };

self.onmessage = async (e: MessageEvent<PrepareRequest>) => {
  let reply: PrepareResponse;
  try {
    reply = { ok: true, result: await preparePhoto(e.data.source, e.data.makeMaster) };
  } catch (err) {
    reply = { ok: false, error: err instanceof Error ? err.message : "prepare failed" };
  }
  self.postMessage(reply);
};
