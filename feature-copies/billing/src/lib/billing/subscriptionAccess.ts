import type { ProfileRow } from "@/types/supabase.types";
import {
  BILLING_GRACE_PERIOD_DAYS,
  isPastDueBeyondGrace,
} from "./canonicalBillingStatus";

export { BILLING_GRACE_PERIOD_DAYS };

type ProfileWithPaymentFailed = ProfileRow & { payment_failed_at?: string | null };

/**
 * True when subscription is past_due and the grace window has elapsed.
 * Uses payment_failed_at only. Does not use updated_at,
 * which resets on every profile edit and would restart the grace clock.
 */
export function isBillingSuspended(profile: ProfileRow | null | undefined): boolean {
  if (!profile) return false;
  return isPastDueBeyondGrace({
    status: profile.subscription_status,
    paymentFailedAt: (profile as ProfileWithPaymentFailed).payment_failed_at,
  });
}
