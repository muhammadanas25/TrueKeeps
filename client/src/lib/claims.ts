/**
 * Claim tokens — per-project recovery secrets, kept in localStorage.
 *
 * When the server creates a project it returns a one-time `claimToken`
 * (only its hash is stored server-side). If this browser later loses
 * its session cookie (cleared site data, cookie expiry, private window)
 * a fresh guest session can POST the token to /api/projects/:id/claim
 * and get the book back. Tokens are per project so a leaked one only
 * ever exposes that one draft.
 */

const KEY = "tk_claims_v1";

type ClaimMap = Record<string, string>;

function read(): ClaimMap {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ClaimMap) : {};
  } catch {
    return {};
  }
}

function write(map: ClaimMap) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* quota / private mode — recovery just won't be available */
  }
}

export function rememberClaim(projectId: string, token: string) {
  const map = read();
  map[projectId] = token;
  write(map);
}

export function getClaim(projectId: string): string | null {
  return read()[projectId] ?? null;
}

export function forgetClaim(projectId: string) {
  const map = read();
  if (projectId in map) {
    delete map[projectId];
    write(map);
  }
}
