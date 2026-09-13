/**
 * better-auth browser client — the single instance the app talks to
 * /api/auth through. Same-origin, cookie-based; no tokens in JS.
 *
 * Plugins mirror the server (server/auth.ts):
 *  - anonymousClient: `signIn.anonymous()` mints a guest session so a
 *    visitor can save a draft before ever signing in
 *  - magicLinkClient: `signIn.magicLink({email})` sends the link
 *
 * Google needs no client plugin: `signIn.social({provider:"google"})`
 * is core and redirects through the server-side OAuth dance.
 */

import { createAuthClient } from "better-auth/react";
import { anonymousClient, magicLinkClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [anonymousClient(), magicLinkClient()],
});

/** Public user shape as served by GET /api/me (never the raw DB row). */
export interface PublicUser {
  id: string;
  /** null for guests */
  email: string | null;
  name: string;
  image: string | null;
  isAnonymous: boolean;
  role: "customer" | "admin";
  marketingOptOut: boolean;
  phone: string | null;
}

/**
 * Guarantee a session exists (guest if necessary) and return its user
 * id. Called before the first server write of a visit — a project row
 * needs an owner, and a guest row is an owner.
 */
export async function ensureSession(): Promise<string | null> {
  const { data } = await authClient.getSession();
  if (data?.user?.id) return data.user.id;
  const anon = await authClient.signIn.anonymous();
  return anon.data?.user?.id ?? null;
}

export function signInWithGoogle(callbackURL = window.location.pathname + window.location.search) {
  return authClient.signIn.social({ provider: "google", callbackURL });
}

export function sendMagicLink(email: string, callbackURL = window.location.pathname + window.location.search) {
  return authClient.signIn.magicLink({ email, callbackURL });
}

export async function signOut() {
  await authClient.signOut();
}
