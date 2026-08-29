/**
 * Client profile patches must never send server-pinned columns.
 * RLS WITH CHECK rejects those writes; sending them breaks onboarding/settings.
 */

export const PROFILE_CLIENT_PINNED_COLUMNS = [
  "credits",
  "plan_id",
  "plan",
  "is_banned",
  "ban_reason",
  "stripe_customer_id",
  "subscription_id",
  "subscription_status",
  "credits_used_this_month",
  "credits_reset_at",
  "referred_by",
  "referral_code",
  "xp",
  "level",
  "total_sessions",
  "payment_failed_at",
  "pending_promo_code",
  "byok_gemini",
  "byok_openai",
  "byok_anthropic",
] as const;

export type ProfilePinnedColumn = (typeof PROFILE_CLIENT_PINNED_COLUMNS)[number];

const PINNED = new Set<string>(PROFILE_CLIENT_PINNED_COLUMNS);

export function omitPinnedProfileColumns<T extends Record<string, unknown>>(
  updates: T,
): Omit<T, ProfilePinnedColumn> {
  const safe: Record<string, unknown> = { ...updates };
  for (const key of PINNED) {
    delete safe[key];
  }
  return safe as Omit<T, ProfilePinnedColumn>;
}

export function pinnedProfileColumnsIn(
  updates: Record<string, unknown> | null | undefined,
): ProfilePinnedColumn[] {
  if (!updates) return [];
  return PROFILE_CLIENT_PINNED_COLUMNS.filter(
    (key) => key in updates && updates[key] !== undefined,
  );
}
