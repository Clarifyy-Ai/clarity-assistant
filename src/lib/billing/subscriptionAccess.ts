import type { ProfileRow } from "@/types/supabase.types";

/** Grace period after first failed payment before /app access is blocked. */
export const BILLING_GRACE_PERIOD_DAYS = 3;

type ProfileWithPaymentFailed = ProfileRow & { payment_failed_at?: string | null };

/**
 * True when subscription is past_due and the grace window has elapsed.
 * Uses payment_failed_at when set by stripe-webhook; falls back to updated_at.
 */
export function isBillingSuspended(profile: ProfileRow | null | undefined): boolean {
  if (!profile || profile.subscription_status !== "past_due") return false;

  const failedAt =
    (profile as ProfileWithPaymentFailed).payment_failed_at ?? profile.updated_at;
  if (!failedAt) return false;

  const elapsedMs = Date.now() - new Date(failedAt).getTime();
  return elapsedMs >= BILLING_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
}
