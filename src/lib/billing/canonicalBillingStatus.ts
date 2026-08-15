export type CanonicalBillingStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "cancelled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "inactive"
  | "free";

const RANK: Record<string, number> = {
  unpaid: 100,
  past_due: 90,
  incomplete_expired: 80,
  canceled: 70,
  cancelled: 70,
  inactive: 60,
  paused: 50,
  incomplete: 40,
  trialing: 20,
  active: 10,
  free: 0,
};

export function normalizeBillingStatus(raw: string | null | undefined): CanonicalBillingStatus {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return "free";
  if (s in RANK) return s as CanonicalBillingStatus;
  return "active";
}

/** More restrictive of profile vs subscription row. past_due beats active. */
export function resolveCanonicalBillingStatus(
  profileStatus: string | null | undefined,
  subscriptionStatus: string | null | undefined,
): CanonicalBillingStatus {
  const a = normalizeBillingStatus(profileStatus);
  const b = subscriptionStatus == null || subscriptionStatus === ""
    ? a
    : normalizeBillingStatus(subscriptionStatus);
  return (RANK[a] ?? 0) >= (RANK[b] ?? 0) ? a : b;
}

export const BILLING_GRACE_PERIOD_DAYS = 3;

export function isPastDueBeyondGrace(opts: {
  status: string;
  paymentFailedAt?: string | null;
  nowMs?: number;
}): boolean {
  if (normalizeBillingStatus(opts.status) !== "past_due") return false;
  if (!opts.paymentFailedAt) return true;
  const elapsed = (opts.nowMs ?? Date.now()) - new Date(opts.paymentFailedAt).getTime();
  return elapsed >= BILLING_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
}

export const PAYMENTS_UNAVAILABLE_MESSAGE = "Payments are temporarily unavailable.";

export function graceDeadlineIso(paymentFailedAt: string | null | undefined): string | null {
  if (!paymentFailedAt) return null;
  const t = new Date(paymentFailedAt).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t + BILLING_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString();
}
