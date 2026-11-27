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

/** Where the Google tab lands when it's done (pages/auth-done.tsx). */
export const AUTH_DONE_PATH = "/auth/done";
/** The channel the Google tab uses to tell this one it has signed in. */
export const AUTH_CHANNEL = "tk-auth";

/**
 * Google sign-in in a new tab, so this page, and the photos it's uploading,
 * stay exactly where they are (owner, 2026-11-28; docs/adr/023).
 *
 * Step by step:
 *   1. Open an empty tab straight away, inside the tap, or the browser's
 *      pop-up blocker refuses it.
 *   2. Ask the server for Google's address without being sent there.
 *   3. Point the new tab at it. Google sends it back to /auth/done, which
 *      tells this tab over a BroadcastChannel and closes itself.
 * If the tab couldn't be opened, sign in the usual way in this tab instead.
 * Uploads survive that too, since photos are kept on the phone (stash.ts).
 */
export async function signInWithGoogleInNewTab(callbackURL = window.location.pathname + window.location.search): Promise<{ newTab: boolean; error?: string }> {
  let tab: Window | null = null;
  try {
    tab = window.open("", "tk-google");
    if (tab) tab.opener = null; // Google's page gets no handle on this one
  } catch {
    tab = null;
  }
  if (!tab) {
    window.dispatchEvent(new Event("tk:leaving")); // a deliberate hand-over: no "Leave site?" box
    const res = await signInWithGoogle(callbackURL);
    return { newTab: false, error: res.error?.message };
  }
  const res = await authClient.signIn.social({
    provider: "google",
    callbackURL: AUTH_DONE_PATH,
    errorCallbackURL: `${AUTH_DONE_PATH}?error=1`,
    disableRedirect: true,
  });
  const url = (res.data as { url?: string } | null)?.url;
  if (res.error || !url) {
    tab.close();
    return { newTab: true, error: res.error?.message ?? "Google sign-in failed. Try email instead." };
  }
  tab.location.href = url;
  return { newTab: true };
}

export function sendMagicLink(email: string, callbackURL = window.location.pathname + window.location.search) {
  return authClient.signIn.magicLink({ email, callbackURL });
}

export async function signOut() {
  await authClient.signOut();
}
