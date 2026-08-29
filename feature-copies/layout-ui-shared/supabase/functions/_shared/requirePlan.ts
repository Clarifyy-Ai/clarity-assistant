// supabase/functions/_shared/requirePlan.ts
//
// Server-side plan-gate enforcement.
//
// The frontend already hides premium features behind `FEATURE_PLAN_GATE`,
// but a determined attacker can craft direct edge function calls bypassing
// the UI. This helper enforces the same gate server-side.
//
// Usage in premium edge functions:
//
//   import { requirePlan } from "../_shared/requirePlan.ts";
//   const auth = await requireAuth(req);
//   const gate = requirePlan(auth.planId, "starter");
//   if (gate) return gate;   // 403 response — short-circuit
//
// Plan ranking (must match src/lib/billing/subscriptionManager.ts):
//   free < starter < pro < elite < enterprise

import { errorResponse } from "./utils.ts";
import { planRank, normalizePlanId, getPlanDisplayName } from "./billingCatalog.ts";

export type PlanTier = "free" | "starter" | "pro" | "elite" | "enterprise";

/**
 * Returns null if the user's plan meets or exceeds the required tier.
 * Uses billingCatalog ranks (starter≡free, elite≡pro).
 */
export function requirePlan(
  userPlanId: string | null | undefined,
  requiredTier: PlanTier,
  req?: Request,
): Response | null {
  const userRank = planRank(userPlanId);
  const requiredRank = planRank(requiredTier);

  if (userRank < 0 || requiredRank < 0 || userRank < requiredRank) {
    const label = getPlanDisplayName(requiredTier);
    return errorResponse(
      `This feature requires the ${label} plan or higher. Please upgrade to continue.`,
      "PLAN_UPGRADE_REQUIRED",
      403,
      req,
    );
  }

  // Reject completely unknown plan strings (except null → free)
  if (userPlanId != null && String(userPlanId).trim() !== "" && normalizePlanId(userPlanId) == null) {
    return errorResponse(
      "Unknown plan. Please contact support.",
      "INVALID_PLAN",
      403,
      req,
    );
  }

  return null;
}
