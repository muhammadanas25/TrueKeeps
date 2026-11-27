/**
 * Stash: keeps a copy of each photo on the customer's phone until its HD copy
 * has uploaded, so a closed tab, a reload or a sign-in never means choosing
 * photos again (owner, 2026-11-27: "it was very hard to upload the exact
 * remaining images"; docs/adr/023).
 *
 * Where: the browser's private file storage (Origin Private File System). It
 * belongs to this site only, the customer never sees it, and it is not the
 * photo gallery. Each photo is one file named by its photo id; pending.ts
 * holds the list that says what each file is.
 *
 * Writes go through a worker (stash.worker.ts); reads happen here, because
 * getFile() works on the main thread in every browser.
 *
 * Every call is best effort. Where the storage is missing, full or blocked
 * (private browsing, very old browsers), stashing quietly stops and the
 * customer gets the re-add list instead (RepickSheet), exactly as before.
 */

/** must match STASH_DIR in stash.worker.ts */
const STASH_DIR = "tk-pending";

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, { resolve: () => void; reject: (err: Error) => void }>();
/** set after a write fails for a reason that won't go away (no support, blocked) */
let broken = false;

const available = () => !broken && typeof Worker !== "undefined" && typeof navigator !== "undefined" && typeof navigator.storage?.getDirectory === "function";

function call(message: Record<string, unknown>, transfer?: Blob): Promise<void> {
  if (!worker) {
    worker = new Worker(new URL("./stash.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ reqId: number; ok: boolean; error?: string }>) => {
      const w = waiting.get(e.data.reqId);
      waiting.delete(e.data.reqId);
      if (!w) return;
      if (e.data.ok) w.resolve();
      else w.reject(new Error(e.data.error ?? "stash failed"));
    };
    worker.onerror = (e) => {
      e.preventDefault();
      broken = true;
      waiting.forEach((w) => w.reject(new Error("stash worker failed")));
      waiting.clear();
    };
  }
  const reqId = nextId++;
  return new Promise((resolve, reject) => {
    waiting.set(reqId, { resolve, reject });
    worker!.postMessage({ ...message, reqId, ...(transfer ? { blob: transfer } : null) });
  });
}

/** Is there room for this many more bytes? Leaves a margin, since other sites share the quota. */
async function hasRoom(bytes: number): Promise<boolean> {
  try {
    const { quota, usage } = await navigator.storage.estimate();
    if (!quota) return true; // unknown: let the write itself decide
    return (usage ?? 0) + bytes * 1.1 < quota * 0.9;
  } catch {
    return true;
  }
}

/** Keep a copy of this photo. Resolves true once it's safely written. */
export async function stashPut(id: string, file: Blob): Promise<boolean> {
  if (!available()) return false;
  if (!(await hasRoom(file.size))) return false;
  try {
    await call({ op: "put", name: id }, file);
    return true;
  } catch (err) {
    // no support at all, or storage blocked: stop trying for this visit
    if (err instanceof Error && /NotSupported|Security|NotAllowed|InvalidState|not a function|stash worker/i.test(err.message)) broken = true;
    return false;
  }
}

/** The stashed copy of a photo, or null when the browser no longer has it. */
export async function stashGet(id: string): Promise<File | null> {
  if (typeof navigator === "undefined" || typeof navigator.storage?.getDirectory !== "function") return null;
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(STASH_DIR);
    const handle = await dir.getFileHandle(id);
    const file = await handle.getFile();
    return file.size > 0 ? file : null;
  } catch {
    return null;
  }
}

export function stashRemove(id: string) {
  if (!available()) return;
  void call({ op: "delete", name: id }).catch(() => undefined);
}

export function stashClear() {
  if (!available()) return;
  void call({ op: "clear" }).catch(() => undefined);
}
