/**
 * Has this book already been ordered?
 *
 * Owner feedback, 2026-11-22: going back after placing an order showed the
 * order form again and felt stuck, and "Open the book" from an order landed
 * on "Approve and pay" as if nothing had happened. Steps 6 and 7 ask this
 * hook and, for an ordered book, show the order instead (with "Order another
 * copy" as the deliberate way to order it again; the server refuses a second
 * order without it, see createOrder's ALREADY_ORDERED).
 *
 * Reads the customer's own order list (GET /api/orders, TanStack Query), so
 * it costs nothing extra on the order page, which already lists them.
 */

import { useQuery } from "@tanstack/react-query";
import { LIVE_ORDER_STATUSES, type OrderStatus } from "@shared/orders";
import { useSession } from "@/features/auth/useSession";

export interface OrderedBook {
  id: string;
  orderNumber: string;
  status: OrderStatus;
}

export function useOrdered(projectId: string | null) {
  const { user } = useSession();
  const orders = useQuery<Array<OrderedBook & { projectId: string }>>({
    queryKey: ["/api/orders"],
    enabled: Boolean(user && projectId),
  });
  const ordered = (orders.data ?? []).find((o) => o.projectId === projectId && LIVE_ORDER_STATUSES.includes(o.status)) ?? null;
  return { ordered, refetch: orders.refetch };
}
