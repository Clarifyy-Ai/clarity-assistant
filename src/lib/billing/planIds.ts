/**
 * Canonical plan ID normalization for launch plans vs legacy DB values.
 * Launch surface: free | pro | enterprise
 * Legacy aliases: starter → free, elite → pro, team → enterprise
 */

export type LaunchPlanId = "free" | "pro" | "enterprise";

export type LegacyPlanId =
  | LaunchPlanId
  | "starter"
  | "elite"
  | "team"
  | string
  | null
  | undefined;

export function normalizePlanId(plan: LegacyPlanId): LaunchPlanId {
  const raw = String(plan ?? "free").trim().toLowerCase();
  switch (raw) {
    case "pro":
    case "elite":
      return "pro";
    case "enterprise":
    case "team":
      return "enterprise";
    case "free":
    case "starter":
    default:
      return "free";
  }
}

export function isPaidPlan(plan: LegacyPlanId): boolean {
  return normalizePlanId(plan) !== "free";
}
