/**
 * Admin console client API — fetch helpers and response types.
 *
 * Every call goes through `adminFetch`, which turns error responses into an
 * AdminError carrying the server's `code`. When any admin request answers
 * STEP_UP_REQUIRED (the 12-hour second-step window ran out mid-session), it
 * fires a window event the shell listens for, so the code prompt comes back
 * wherever the person was, instead of a page of broken requests.
 *
 * Server state lives in TanStack Query (project convention); pages call
 * `useAdminQuery` which sets the admin's freshness rules (always refetch on
 * open; no caching across people).
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import type { ActionKind } from "./format";

export class AdminError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export const STEP_UP_EVENT = "tk-admin-step-up";

export async function adminFetch<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    credentials: "include",
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : {},
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!res.ok) {
    if (data.code === "STEP_UP_REQUIRED") window.dispatchEvent(new Event(STEP_UP_EVENT));
    throw new AdminError(data.error ?? `Request failed (${res.status})`, res.status, data.code);
  }
  return data;
}

export function useAdminQuery<T>(key: unknown[], url: string | null, opts: Partial<UseQueryOptions<T>> = {}) {
  return useQuery<T>({
    queryKey: key,
    queryFn: () => adminFetch<T>(url!),
    enabled: Boolean(url),
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: false,
    ...opts,
  });
}

/* ── response shapes ───────────────────────────────────────────── */

export interface StaffMe {
  email: string;
  name: string;
  role: "admin" | "ops";
  enrolled: boolean;
  elevatedUntil: string | null;
  lockedUntil: string | null;
  backupCodesLeft: number;
}

export interface ActionItem {
  orderId: string;
  orderNumber: string;
  kind: ActionKind;
  text: string;
  since: string;
}

export interface Overview {
  role: "admin" | "ops";
  actions: ActionItem[];
  pipeline: Array<{ state: string; status: string; n: number }>;
  kpis?: {
    cur: { orders: number; revenueMinor: number };
    prev: { orders: number; revenueMinor: number };
    startToPaid: { cur: number | null; prev: number | null };
  };
  revenue?: { cur: number[]; prev: number[] };
  funnel?: Array<{ label: string; n: number }>;
}

export interface PrintSummary {
  state: string;
  version: number;
  problems: number;
  lowDpi: number;
}

export interface OrderRow {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  paidAt: string | null;
  deliverBy: string | null;
  customer: string;
  phone: string;
  email: string;
  city: string;
  area: string;
  book: string;
  total: number;
  paymentProvider: string;
  livemode: boolean;
  print: PrintSummary | null;
}

export interface OrderList {
  rows: OrderRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<string, number>;
}

export interface PrintJobFile {
  kind: string;
  key: string;
  bytes: number;
  sha256: string;
  pages: number;
  backupKey?: string | null;
}

export interface PrintJob {
  id: string;
  version: number;
  state: string;
  attempts: number;
  lastError: string | null;
  files: PrintJobFile[] | null;
  pageCount: number | null;
  lowDpiCount: number;
  problems: Array<{ page: number; slot: number; reason: string }> | null;
  checkedAt: string | null;
  requestedBy: string;
  createdAt: string;
}

export interface OrderDetail {
  order: {
    id: string;
    orderNumber: string;
    status: string;
    title: string;
    binding: string;
    finish: string;
    qty: number;
    pageCount: number;
    totalMinor: number;
    subtotalMinor: number;
    shippingMinor: number;
    /** promo code applied (upper case) and what it took off; totalMinor is net of it */
    promoCode?: string | null;
    discountMinor?: number;
    contactEmail: string;
    contactPhone: string;
    shippingAddress: { fullName: string; phone: string; line1: string; line2?: string; city: string; province: string; postalCode?: string };
    courier: string | null;
    trackingNumber: string | null;
    livemode: boolean;
    paymentProvider: string;
    providerRef: string | null;
    paidAt: string | null;
    createdAt: string;
    deliverBy: string | null;
  };
  /** flagged = photos the customer kept after the low-quality warning (refund policy) */
  book: { pages: number; photos: number; flagged?: number };
  events: Array<{ id: string; kind: string; actor: string; fromStatus: string | null; toStatus: string | null; note: string | null; createdAt: string }>;
  printJobs: PrintJob[];
  notifications: Array<{ id: string; event: string; channel: string; audience: string; recipient: string; status: string; error: string | null; createdAt: string }>;
  payments: Array<{ id: string; provider: string; amountMinor: number; status: string; source: string; createdAt: string }>;
  customer: { orders: number; spentMinor: number | null; since: string | null };
  canSeeMoney: boolean;
}

export interface NotifyRule {
  event: string;
  saved: boolean;
  enabled: boolean;
  staffEmails: string[];
  staffWhatsapp: string[];
  customerEmail: boolean;
  customerWhatsapp: boolean;
  staffTemplate: string | null;
  customerTemplate: string | null;
  templateLang: string;
}
