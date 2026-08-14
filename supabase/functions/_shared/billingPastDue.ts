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
  "cancel-subscription",
  "resume-subscription",
  "send-email",
  "delete-account",
  "export-user-data",
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

export function isBillingPastDue(profile: {
  subscription_status?: string | null;
  payment_failed_at?: string | null;
} | null | undefined): boolean {
  if (!profile || profile.subscription_status !== "past_due") return false;
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
