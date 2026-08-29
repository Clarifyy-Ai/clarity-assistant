/**
 * Frontend plan catalog — must stay aligned with
 * supabase/functions/_shared/billingCatalog.ts ranks & display names.
 * Authorization always uses plan_id, never display names.
 */

import { PLAN_MONTHLY_CREDITS as ECON } from "@/lib/constants/creditEconomics";

export type CanonicalPlanId =
  | "free"
  | "starter"
  | "pro"
  | "elite"
  | "enterprise";

export const PLAN_RANK: Record<CanonicalPlanId, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  elite: 2,
  enterprise: 4,
};

export const PLAN_DISPLAY_NAMES: Record<CanonicalPlanId, string> = {
  free: "Free",
  starter: "Pro",
  pro: "Pro",
  elite: "Pro",
  /** High-credit consumer tier — not org/SSO enterprise software. */
  enterprise: "Max",
};

const ALIASES: Record<string, CanonicalPlanId> = {
  free: "free",
  starter: "starter",
  pro: "pro",
  elite: "elite",
  enterprise: "enterprise",
  team: "enterprise",
  max: "enterprise",
};

export function normalizeCanonicalPlanId(
  raw: string | null | undefined,
): CanonicalPlanId | null {
  if (raw == null) return "free";
  const key = String(raw).trim().toLowerCase();
  if (!key) return "free";
  return ALIASES[key] ?? null;
}

export function planRank(raw: string | null | undefined): number {
  const id = normalizeCanonicalPlanId(raw);
  if (!id) return -1;
  return PLAN_RANK[id];
}

export function getCatalogDisplayName(
  raw: string | null | undefined,
): string {
  const id = normalizeCanonicalPlanId(raw) ?? "free";
  return PLAN_DISPLAY_NAMES[id];
}

export function monthlyCreditsForPlan(
  raw: string | null | undefined,
): number {
  const id = normalizeCanonicalPlanId(raw) ?? "free";
  return ECON[id as keyof typeof ECON] ?? ECON.free;
}

/** Expected backend ranks for parity tests. */
export const EXPECTED_BACKEND_RANKS = { ...PLAN_RANK };
