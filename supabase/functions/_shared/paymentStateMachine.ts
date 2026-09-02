/**
 * Durable Razorpay payment order lifecycle — shared by create-order, verify, webhook.
 */

export type PaymentOrderStatus =
  | "pending"
  | "provider_created"
  | "created"
  | "paid"
  | "fulfilled"
  | "failed"
  | "cancelled"
  | "refunded"
  | "reconciliation_required";

const TRANSITIONS: Record<PaymentOrderStatus, ReadonlySet<PaymentOrderStatus>> = {
  pending: new Set(["provider_created", "failed", "cancelled", "reconciliation_required"]),
  provider_created: new Set(["fulfilled", "paid", "failed", "cancelled", "reconciliation_required"]),
  created: new Set(["provider_created", "fulfilled", "paid", "failed", "cancelled"]),
  paid: new Set(["fulfilled", "refunded"]),
  fulfilled: new Set(["refunded"]),
  failed: new Set(),
  cancelled: new Set(),
  refunded: new Set(),
  reconciliation_required: new Set(["fulfilled", "failed", "cancelled"]),
};

export function canTransitionPaymentStatus(
  from: PaymentOrderStatus,
  to: PaymentOrderStatus,
): boolean {
  if (from === to) return true;
  return TRANSITIONS[from]?.has(to) ?? false;
}

export function assertPaymentStatusTransition(
  from: PaymentOrderStatus,
  to: PaymentOrderStatus,
): void {
  if (!canTransitionPaymentStatus(from, to)) {
    throw new Error(`invalid_payment_status_transition:${from}->${to}`);
  }
}

export const REUSABLE_CHECKOUT_STATUSES: readonly PaymentOrderStatus[] = [
  "pending",
  "provider_created",
  "created",
];
