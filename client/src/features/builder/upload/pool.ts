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

import { makePrintCopy, preparePhoto, type PreparedPhoto } from "./prepare";
import type { PrepareRequest, PrepareResponse } from "./prepare.worker";

const canUseWorkers = () => typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined";

/** How many photos may prepare at once. */
export const prepareConcurrency = () => (canUseWorkers() ? 2 : 1);

const idle: Worker[] = [];

function spawn(): Worker {
  return new Worker(new URL("./prepare.worker.ts", import.meta.url), { type: "module" });
}

/** Run one job in a worker, or on the main thread where workers can't draw. */
function run<T>(request: PrepareRequest, inline: () => Promise<T>): Promise<T> {
  if (!canUseWorkers()) return inline();
  return new Promise((resolve, reject) => {
    const worker = idle.pop() ?? spawn();
    worker.onmessage = (e: MessageEvent<PrepareResponse>) => {
      idle.push(worker);
      if (e.data.ok) resolve(e.data.result as T);
      else reject(new Error(e.data.error));
    };
    worker.onerror = (e) => {
      e.preventDefault();
      worker.terminate(); // never returned to the pool
      reject(new Error("the photo was too large to open"));
    };
    worker.postMessage(request);
  });
}

/** Prepare one photo, off the main thread where possible. */
export function preparePhotoOffThread(source: Blob, makeMaster: boolean): Promise<PreparedPhoto> {
  return run({ op: "prepare", source, makeMaster }, () => preparePhoto(source, makeMaster));
}

/** Make one photo's quality 0.95 print copy (see print-copy.ts), off the main thread where possible. */
export function printCopyOffThread(source: Blob, maxShortEdge: number | null, quality: number): Promise<Blob | undefined> {
  return run({ op: "print", source, maxShortEdge, quality }, () => makePrintCopy(source, maxShortEdge, quality));
}
