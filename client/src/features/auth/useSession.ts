/**
 * useSession — who is looking at the app right now.
 *
 * Reads GET /api/me through TanStack Query (server state lives there,
 * per project conventions) rather than better-auth's own store, so the
 * profile fields we add server-side (role, marketingOptOut, phone) come
 * through typed, and every component shares one cached answer.
 *
 * Three states callers care about:
 *   loading  → don't flash "Sign in" before we know
 *   guest    → anonymous session or no session at all (both can build)
 *   member   → verified email; may order
 *
 * `refresh()` is invoked after any auth action (magic link landing,
 * Google callback, sign-out) so the UI flips without a reload.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PublicUser } from "./client";

export const ME_QUERY_KEY = ["/api/me"] as const;

interface MeResponse {
  user: PublicUser | null;
  providers: { google: boolean };
}

export function useSession() {
  const qc = useQueryClient();
  const query = useQuery<MeResponse>({
    queryKey: ME_QUERY_KEY,
    // /api/me answers 200 {user:null} when signed out — never throws
    staleTime: 60_000,
  });
  const user = query.data?.user ?? null;
  return {
    loading: query.isLoading,
    user,
    isMember: Boolean(user && !user.isAnonymous),
    isGuest: !user || user.isAnonymous,
    isAdmin: user?.role === "admin",
    googleEnabled: query.data?.providers?.google ?? false,
    refresh: () => qc.invalidateQueries({ queryKey: ME_QUERY_KEY }),
  };
}
