/**
 * Durable Razorpay payment order lifecycle (server + billing history).
 *
 * Flow: pending → provider_created → fulfilled
 *       pending/provider_created → failed | cancelled
 *       fulfilled → refunded
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

export type PaymentDisplayStatus = "pending" | "completed" | "failed" | "refunded";

const TERMINAL: ReadonlySet<PaymentOrderStatus> = new Set([
  "fulfilled",
  "paid",
  "failed",
  "cancelled",
  "refunded",
  "reconciliation_required",
]);

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

export function isTerminalPaymentStatus(status: PaymentOrderStatus): boolean {
  return TERMINAL.has(status);
}

/** Map ledger row status to billing-history UI bucket. */
export function mapPaymentOrderDisplayStatus(status: string): PaymentDisplayStatus {
  if (status === "paid" || status === "fulfilled") {
    return "completed";
  }
  if (status === "refunded") {
    return "refunded";
  }
  if (
    status === "failed" ||
    status === "cancelled" ||
    status === "canceled" ||
    status === "reconciliation_required"
  ) {
    return "failed";
  }
  return "pending";
}

/** Reusable checkout orders (idempotent create-order replay). */
export const REUSABLE_CHECKOUT_STATUSES: readonly PaymentOrderStatus[] = [
  "pending",
  "provider_created",
  "created",
];
