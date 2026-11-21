/**
 * WhatsApp help — one tap to message the team, with the customer's context
 * already typed (owner, 2026-11-21).
 *
 * What: a "Help" button that opens WhatsApp (shared/payments.ts
 * SUPPORT_WHATSAPP) with a message like
 *
 *   Hi Truekeeps, I need help.
 *   Order: TK-7F3K9Q
 *   Book: 3f2a91c0
 *   Where: Step 5 of 7
 *
 * so whoever answers can find the customer's book or order without asking.
 * The customer sees the text before sending and can change it.
 *
 * Where it shows:
 *  - `WhatsAppHelpFloating` (mounted once in App.tsx): bottom-right on the
 *    public pages and the order pages. Not on the builder, whose phone
 *    screens have their own bottom sheets it would cover, and not in admin.
 *  - `WhatsAppHelpButton`: an inline header button, used by the builder.
 *
 * Context: a page that knows something useful (the builder's book and step,
 * an order page's number) calls `useSupportContext(...)`; the latest one
 * wins and is cleared when that page unmounts. A tiny module store rather
 * than React context, because the floating button sits outside the pages.
 */

import { useEffect, useSyncExternalStore } from "react";
import { useLocation } from "wouter";
import { MessageCircle } from "lucide-react";
import { SUPPORT_WHATSAPP, whatsappLink } from "@shared/payments";
import "./support.css";

export interface SupportContext {
  orderNumber?: string | null;
  /** the book (project) id; the first 8 characters are enough to find it */
  bookId?: string | null;
  /** where they are, e.g. "Step 5 of 7" */
  where?: string | null;
}

let current: SupportContext | null = null;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const emit = () => listeners.forEach((fn) => fn());

/** Tell the help button what this page is about, while it is on screen. */
export function useSupportContext(ctx: SupportContext | null) {
  const key = JSON.stringify(ctx);
  useEffect(() => {
    current = ctx;
    emit();
    return () => {
      current = null;
      emit();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** The prefilled message. Only facts the customer can see themselves. */
export function supportMessage(ctx: SupportContext | null, path: string): string {
  const lines = ["Hi Truekeeps, I need help."];
  if (ctx?.orderNumber) lines.push(`Order: ${ctx.orderNumber}`);
  if (ctx?.bookId) lines.push(`Book: ${ctx.bookId.slice(0, 8)}`);
  lines.push(`Where: ${ctx?.where || path || "/"}`);
  return lines.join("\n");
}

function useHelpHref(): string {
  const [path] = useLocation();
  const ctx = useSyncExternalStore(subscribe, () => current, () => null);
  return whatsappLink(supportMessage(ctx, path));
}

/** Header button for the builder. */
export function WhatsAppHelpButton({ className = "" }: { className?: string }) {
  const href = useHelpHref();
  return (
    <a className={"wa-help-inline " + className} href={href} target="_blank" rel="noopener noreferrer" aria-label={`Help on WhatsApp, ${SUPPORT_WHATSAPP.display}`} title="Help on WhatsApp">
      <MessageCircle size={17} />
      <span className="wa-help-label">Help</span>
    </a>
  );
}

/** Bottom-right button on public and order pages. */
export function WhatsAppHelpFloating() {
  const [path] = useLocation();
  const href = useHelpHref();
  if (path.startsWith("/wizard") || path.startsWith("/admin") || path.startsWith("/create")) return null;
  return (
    <a className="wa-help-float" href={href} target="_blank" rel="noopener noreferrer" aria-label={`Help on WhatsApp, ${SUPPORT_WHATSAPP.display}`}>
      <MessageCircle size={20} />
      <span>Help</span>
    </a>
  );
}
