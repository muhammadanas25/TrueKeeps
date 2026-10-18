/**
 * Orders client API — shared types and fetchers for the order pages.
 *
 * Server state lives in TanStack Query (project convention); these are
 * the query functions and the one mutation helper the pages use.
 */

import type { OrderStatus, ShippingAddress } from "@shared/orders";

export interface PublicOrder {
  id: string;
  orderNumber: string;
  projectId: string;
  status: OrderStatus;
  currency: string;
  unitMinor: number;
  subtotalMinor: number;
  shippingMinor: number;
  totalMinor: number;
  binding: string;
  qty: number;
  pageCount: number;
  title: string;
  occasion: string | null;
  shippingAddress: ShippingAddress;
  contactEmail: string;
  contactPhone: string;
  livemode: boolean;
  courier: string | null;
  trackingNumber: string | null;
  paidAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderEvent {
  id: string;
  kind: string;
  actor: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  createdAt: string;
}

export async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw Object.assign(new Error(`${res.status}`), { status: res.status });
  return res.json() as Promise<T>;
}

export async function postJSON<T>(url: string, body?: unknown, method = "POST"): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw Object.assign(new Error(data.error ?? `${res.status}`), { status: res.status });
  return data;
}

export const bindingName = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);

export function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-PK", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}
