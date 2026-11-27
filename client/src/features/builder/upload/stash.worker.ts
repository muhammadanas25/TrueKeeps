/**
 * Writes photos into the browser's private file storage (the Origin Private
 * File System), for stash.ts.
 *
 * Why a worker: the one write API every current browser has for this storage,
 * including Safari, is the synchronous access handle, and browsers only allow
 * it inside a worker. Writing 4 MB at a time keeps memory flat however big
 * the photo is.
 */

interface SyncHandle {
  truncate(size: number): void;
  write(buffer: Uint8Array, options: { at: number }): number;
  flush(): void;
  close(): void;
}

type StashRequest = { reqId: number; op: "put"; name: string; blob: Blob } | { reqId: number; op: "delete"; name: string } | { reqId: number; op: "clear" };

const CHUNK = 4 * 1024 * 1024;
/** must match STASH_DIR in stash.ts */
const STASH_DIR = "tk-pending";

async function folder(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(STASH_DIR, { create: true });
}

self.onmessage = async (e: MessageEvent<StashRequest>) => {
  const req = e.data;
  try {
    const dir = await folder();
    if (req.op === "put") {
      const file = await dir.getFileHandle(req.name, { create: true });
      const handle = (await (file as unknown as { createSyncAccessHandle(): Promise<SyncHandle> }).createSyncAccessHandle()) as SyncHandle;
      try {
        handle.truncate(0);
        for (let at = 0; at < req.blob.size; at += CHUNK) {
          handle.write(new Uint8Array(await req.blob.slice(at, at + CHUNK).arrayBuffer()), { at });
        }
        handle.flush();
      } catch (err) {
        handle.close();
        await dir.removeEntry(req.name).catch(() => undefined); // never leave half a photo behind
        throw err;
      }
      handle.close();
    } else if (req.op === "delete") {
      await dir.removeEntry(req.name).catch(() => undefined);
    } else {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(STASH_DIR, { recursive: true }).catch(() => undefined);
    }
    self.postMessage({ reqId: req.reqId, ok: true });
  } catch (err) {
    self.postMessage({ reqId: req.reqId, ok: false, error: err instanceof Error ? err.name || err.message : "stash failed" });
  }
};

// a module, so its names stay out of the global scope
export {};
