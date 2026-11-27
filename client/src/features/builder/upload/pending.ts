/**
 * The list of photos still waiting to upload, kept in localStorage so a new
 * page load can carry on (stash.ts keeps the files themselves).
 *
 * One key per photo ("tk_pending:<id>") rather than one list, so two tabs
 * adding photos at the same time can't overwrite each other's entries.
 *
 * Kept deliberately tiny, with no imports: the app shell calls hasPending()
 * on every page load to decide whether to load the upload engine at all, and
 * that check must cost nothing for the visitors who have no uploads.
 */

const PREFIX = "tk_pending:";
/** Entries older than this are dropped: the browser may have cleared the file, and the book has likely moved on. */
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export interface PendingEntry {
  id: string;
  /** fingerprint (engine.ts fingerprint), to match a re-picked file */
  fp: string;
  name: string;
  type: string;
  lastModified: number;
  size: number;
  /** the book's project, once it has one */
  projectId: string | null;
  /** media key once the display copies are on the server; then only the HD copy is left */
  key: string | null;
  /** when it was added, for MAX_AGE_MS */
  at: number;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // blocked storage throws on access
  }
}

/** Any photos left over from an earlier visit (or another tab)? */
export function hasPending(): boolean {
  const ls = storage();
  if (!ls) return false;
  for (let i = 0; i < ls.length; i++) if (ls.key(i)?.startsWith(PREFIX)) return true;
  return false;
}

/** Every entry still young enough to resume. Stale or broken ones are removed on the way. */
export function listPending(): PendingEntry[] {
  const ls = storage();
  if (!ls) return [];
  const out: PendingEntry[] = [];
  const stale: string[] = [];
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (!k?.startsWith(PREFIX)) continue;
    try {
      const e = JSON.parse(ls.getItem(k) ?? "") as PendingEntry;
      if (e?.id && Date.now() - e.at < MAX_AGE_MS) out.push(e);
      else stale.push(k);
    } catch {
      stale.push(k);
    }
  }
  stale.forEach((k) => ls.removeItem(k));
  return out.sort((a, b) => a.at - b.at);
}

/** Is a copy of this photo listed as kept on the phone? */
export function isPending(id: string): boolean {
  try {
    return Boolean(storage()?.getItem(PREFIX + id));
  } catch {
    return false;
  }
}

export function writePending(entry: PendingEntry) {
  try {
    storage()?.setItem(PREFIX + entry.id, JSON.stringify(entry));
  } catch {
    /* full or blocked: the photo just won't resume on its own */
  }
}

export function updatePending(id: string, patch: Partial<PendingEntry>) {
  const ls = storage();
  const raw = ls?.getItem(PREFIX + id);
  if (!raw) return;
  try {
    writePending({ ...(JSON.parse(raw) as PendingEntry), ...patch });
  } catch {
    ls?.removeItem(PREFIX + id);
  }
}

export function removePending(id: string) {
  storage()?.removeItem(PREFIX + id);
}

export function clearPending() {
  const ls = storage();
  if (!ls) return;
  const keys: string[] = [];
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (k?.startsWith(PREFIX)) keys.push(k);
  }
  keys.forEach((k) => ls.removeItem(k));
}
