/**
 * Order lifecycle — states, allowed transitions, and the shapes the API
 * accepts. Shared so the client labels statuses with the same vocabulary
 * the server enforces.
 *
 *   pending_payment ──paid──▶ paid ──▶ in_production ──▶ shipped ──▶ delivered
 *        │  ▲                  │
 *        │  └── (late payment) │
 *        ├──▶ expired ─────────┘   (customer paid after we gave up waiting)
 *        └──▶ cancelled             paid ──▶ refunded
 *
 * Why a table and not ad-hoc `if`s: every status change goes through
 * `canTransition`, and storage applies it with a compare-and-set on the
 * current status, so a webhook, a redirect and the reconcile job racing
 * to mark the same order paid produce exactly one transition (and one
 * confirmation email).
 */

import { z } from "zod";
import { BINDING_IDS, PRICE_LIST } from "./pricing";
import { builderDocumentSchema } from "./document";

export const ORDER_STATUSES = [
  "pending_payment",
  "paid",
  "in_production",
  "shipped",
  "delivered",
  "cancelled",
  "expired",
  "refunded",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ["paid", "expired", "cancelled"],
  // a payment can land after we expired the order (customer took 25h);
  // the money is real, so the order is too
  expired: ["paid", "cancelled"],
  paid: ["in_production", "cancelled", "refunded"],
  in_production: ["shipped", "cancelled", "refunded"],
  shipped: ["delivered", "refunded"],
  delivered: ["refunded"],
  cancelled: [],
  refunded: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** States from which the customer may (re)start payment. */
export const PAYABLE: OrderStatus[] = ["pending_payment"];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  paid: "Paid — preparing your book",
  in_production: "Printing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  expired: "Payment window closed",
  refunded: "Refunded",
};

/** Pakistan provinces / territories for the address form and validation. */
export const PK_PROVINCES = [
  "Punjab",
  "Sindh",
  "Khyber Pakhtunkhwa",
  "Balochistan",
  "Islamabad Capital Territory",
  "Gilgit-Baltistan",
  "Azad Jammu and Kashmir",
] as const;

/** Pakistani mobile: 03XXXXXXXXX or +923XXXXXXXXX (spaces/dashes allowed). */
export const PK_MOBILE_RE = /^(\+92|0092|0)?3\d{2}[\s-]?\d{7}$/;

export const shippingAddressSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the recipient's name").max(80),
  phone: z
    .string()
    .trim()
    .transform((s) => s.replace(/[\s-]/g, ""))
    .refine((s) => PK_MOBILE_RE.test(s), "Enter a Pakistani mobile number, e.g. 0300 1234567"),
  line1: z.string().trim().min(4, "Enter the street address").max(160),
  line2: z.string().trim().max(160).optional().default(""),
  city: z.string().trim().min(2, "Enter the city").max(60),
  province: z.enum(PK_PROVINCES),
  postalCode: z
    .string()
    .trim()
    .max(10)
    .refine((s) => s === "" || /^\d{5}$/.test(s), "Postal codes are 5 digits")
    .optional()
    .default(""),
});
export type ShippingAddress = z.infer<typeof shippingAddressSchema>;

/** Body of POST /api/orders. */
export const createOrderSchema = z.object({
  projectId: z.string().min(1).max(64),
  binding: z.enum(BINDING_IDS),
  qty: z.number().int().min(1).max(PRICE_LIST.maxQty),
  address: shippingAddressSchema,
  /** the exact book the customer saw — frozen onto the order for printing */
  document: builderDocumentSchema,
  /** client-generated per checkout attempt; double-clicks return one order */
  idempotencyKey: z.string().min(8).max(80),
});
export type CreateOrderBody = z.infer<typeof createOrderSchema>;

/** Body of PATCH /api/admin/orders/:id. */
export const adminUpdateOrderSchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  trackingNumber: z.string().trim().max(80).optional(),
  courier: z.string().trim().max(40).optional(),
  note: z.string().trim().max(500).optional(),
});
