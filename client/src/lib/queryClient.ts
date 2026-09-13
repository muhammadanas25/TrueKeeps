/**
 * HTTP layer — one fetch wrapper (`apiRequest`) and the TanStack Query
 * client every server read goes through.
 *
 * Session handling lives here so no feature has to think about it:
 *  - Cookies always ride along (`credentials: "include"`).
 *  - A 401 `UNAUTHENTICATED` on a non-auth endpoint means "no session
 *    yet" — for a first-time visitor that is normal. We mint a guest
 *    session (better-auth anonymous) and retry once, so the builder's
 *    first "create project" just works without any sign-in step.
 *  - A successful `POST /api/projects` carries a one-time claimToken;
 *    we stash it (lib/claims.ts) so the draft can be recovered if the
 *    cookie is ever lost. Done here rather than at the call site so
 *    every project-creating screen (builder, canvas, classic) gets it.
 */

import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { rememberClaim } from "./claims";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

/** Lazy import keeps better-auth out of the entry chunk until first needed. */
async function mintGuestSession(): Promise<boolean> {
  const { ensureSession } = await import("@/features/auth/client");
  return Boolean(await ensureSession());
}

async function isUnauthenticated(res: Response): Promise<boolean> {
  if (res.status !== 401) return false;
  try {
    const body = (await res.clone().json()) as { code?: string };
    return body.code === "UNAUTHENTICATED";
  } catch {
    return false;
  }
}

/** Set once we know a session cookie exists — skips the pre-flight later. */
let sessionKnown = false;

export async function apiRequest(method: string, url: string, data?: unknown | undefined): Promise<Response> {
  // First write of the visit: make sure a (guest) session exists up
  // front so the request doesn't bounce off a 401 first.
  if (!sessionKnown && method !== "GET" && !url.startsWith("/api/auth")) {
    sessionKnown = await mintGuestSession();
  }
  const doFetch = () =>
    fetch(url, {
      method,
      headers: data ? { "Content-Type": "application/json" } : {},
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });

  let res = await doFetch();
  if (!url.startsWith("/api/auth") && (await isUnauthenticated(res))) {
    // cookie expired / cleared mid-session → new guest session, retry once
    sessionKnown = await mintGuestSession();
    if (sessionKnown) res = await doFetch();
  }

  await throwIfResNotOk(res);

  if (method === "POST" && url === "/api/projects") {
    try {
      const created = (await res.clone().json()) as { id?: string; claimToken?: string };
      if (created.id && created.claimToken) rememberClaim(created.id, created.claimToken);
    } catch {
      /* not JSON — nothing to remember */
    }
  }
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: { on401: UnauthorizedBehavior }) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
