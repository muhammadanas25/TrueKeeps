/**
 * Worker pool for photo preparation.
 *
 * Two workers at most. Decoding a 12MP photo holds about 48 MB of pixels, and
 * on a phone that is what eventually kills the tab, so more parallelism here
 * trades a little speed for a real chance of a crash. A worker that dies
 * (usually out of memory on a very large photo) is replaced and that one photo
 * fails on its own, without taking the queue with it.
 *
 * Browsers with no worker canvas support (Safari before 16.4) run the same
 * code on the main thread, one photo at a time.
 */

import { preparePhoto, type PreparedPhoto } from "./prepare";
import type { PrepareRequest, PrepareResponse } from "./prepare.worker";

const canUseWorkers = () => typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined";

/** How many photos may prepare at once. */
export const prepareConcurrency = () => (canUseWorkers() ? 2 : 1);

const idle: Worker[] = [];

function spawn(): Worker {
  return new Worker(new URL("./prepare.worker.ts", import.meta.url), { type: "module" });
}

/** Prepare one photo, off the main thread where possible. */
export function preparePhotoOffThread(source: Blob, makeMaster: boolean): Promise<PreparedPhoto> {
  if (!canUseWorkers()) return preparePhoto(source, makeMaster);
  return new Promise((resolve, reject) => {
    const worker = idle.pop() ?? spawn();
    worker.onmessage = (e: MessageEvent<PrepareResponse>) => {
      idle.push(worker);
      if (e.data.ok) resolve(e.data.result);
      else reject(new Error(e.data.error));
    };
    worker.onerror = (e) => {
      e.preventDefault();
      worker.terminate(); // never returned to the pool
      reject(new Error("the photo was too large to open"));
    };
    const request: PrepareRequest = { source, makeMaster };
    worker.postMessage(request);
  });
}
