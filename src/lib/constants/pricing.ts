// src/lib/constants/pricing.ts
//
// SINGLE SOURCE OF TRUTH for launch pricing, credits and plan-tier limits.
// All UI (marketing Pricing page, Settings → Billing, Upgrade modal, Plan badge)
// and any billing/credit logic MUST import from this file — never hardcode.
//
// Launch model (per production audit Path A):
//   Free        — 200 credits / month, $0
//   Pro         — 2,000 credits / month, $29 / mo  (or $290 / yr)
//   Enterprise  — Unlimited credits, $79 / mo per seat (contact sales)
//
// `starter` and `elite` exist only as legacy types so older code references do
// not break; they are NOT displayed and NOT sold. Treat them as deprecated.

export type PlanId = "free" | "starter" | "pro" | "elite" | "enterprise";

/** Plans actually offered to users at launch, in display order. */
export const LAUNCH_PLANS: PlanId[] = ["free", "pro", "enterprise"];

/** Legacy plan ids retained for backwards compatibility; never shown in UI. */
export const DEPRECATED_PLANS: PlanId[] = ["starter", "elite"];

/** Monthly credit allotment per plan. `null` means unlimited. */
export const PLAN_MONTHLY_CREDITS: Record<PlanId, number | null> = {
  free:       200,
  starter:    200,   // deprecated — treated as free
  pro:        2_000,
  elite:      2_000, // deprecated — treated as pro
  enterprise: null,  // unlimited
};

/** Prices are stored in cents (USD). 0 = free; null = contact sales (no self-serve). */
export const PLAN_PRICE_CENTS_MONTHLY: Record<PlanId, number | null> = {
  free:       0,
  starter:    0,
  pro:        2_900,
  elite:      2_900,
  enterprise: 7_900,
};

export const PLAN_PRICE_CENTS_YEARLY: Record<PlanId, number | null> = {
  free:       0,
  starter:    0,
  pro:        29_000,   // ~2 months free
  elite:      29_000,
  enterprise: 79_000,
};

/** Human-readable label for credit balance UI ("∞" for unlimited). */
export function formatMonthlyCredits(planId: PlanId): string {
  const v = PLAN_MONTHLY_CREDITS[planId];
  return v === null ? "Unlimited" : `${v.toLocaleString()} / mo`;
}

/** Returns true if a plan id has no monthly credit cap. */
export function isUnlimited(planId: PlanId): boolean {
  return PLAN_MONTHLY_CREDITS[planId] === null;
}
