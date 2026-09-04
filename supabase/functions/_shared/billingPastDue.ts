/**
 * Past-due billing gate for Edge Functions.
 * Matches client grace: 3 days after payment_failed_at, or immediate if unset.
 * Billing recovery endpoints stay allowed so the user can update payment.
 */

const BILLING_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

const PAST_DUE_ALLOWED_FUNCTIONS = new Set([
  "create-checkout",
  "create-billing-portal",
  "razorpay-create-order",
  // Past-due users must verify checkout so recovery grants can complete client-side
  // (webhook still fulfills independently when configured).
  "razorpay-verify-payment",
  "cancel-subscription",
  "resume-subscription",
  "send-email",
  "mfa-recovery",
  "delete-account",
  "export-user-data",
  "get-user-storage-usage",
  "billing-status",
]);

export function functionSlugFromRequest(req: Request): string {
  try {
    const path = new URL(req.url).pathname;
    const parts = path.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? "";
  } catch {
    return "";
  }
}

export function isPastDueAllowedPath(req: Request): boolean {
  return PAST_DUE_ALLOWED_FUNCTIONS.has(functionSlugFromRequest(req));
}

const STATUS_RANK: Record<string, number> = {
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

export function resolveCanonicalBillingStatus(
  profileStatus: string | null | undefined,
  subscriptionStatus: string | null | undefined,
): string {
  const a = String(profileStatus ?? "").trim().toLowerCase() || "free";
  const b = String(subscriptionStatus ?? "").trim().toLowerCase();
  if (!b) return a;
  return (STATUS_RANK[a] ?? 0) >= (STATUS_RANK[b] ?? 0) ? a : b;
}

export function isBillingPastDue(profile: {
  subscription_status?: string | null;
  payment_failed_at?: string | null;
} | null | undefined): boolean {
  if (!profile) return false;
  const status = String(profile.subscription_status ?? "").toLowerCase();
  if (status !== "past_due") return false;
  if (!profile.payment_failed_at) return true;
  const failedAt = new Date(profile.payment_failed_at).getTime();
  if (!Number.isFinite(failedAt)) return true;
  return Date.now() - failedAt >= BILLING_GRACE_MS;
}

export function pastDueResponse(corsHeaders: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify({
      error: "Payment failed. Update your payment method to keep using AI features.",
      code: "BILLING_PAST_DUE",
    }),
    {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}
