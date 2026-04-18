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

export type PlanTier = "free" | "starter" | "pro" | "elite" | "enterprise";

const PLAN_RANK: Record<PlanTier, number> = {
  free:       0,
  starter:    1,
  pro:        2,
  elite:      3,
  enterprise: 4,
};

/**
 * Returns null if the user's plan meets or exceeds the required tier.
 * Returns a 403 Response if the user's plan is insufficient.
 *
 * The caller pattern (`if (gate) return gate;`) keeps premium EFs concise.
 */
export function requirePlan(
  userPlanId: string | null | undefined,
  requiredTier: PlanTier,
  req?: Request,
): Response | null {
  const userPlan = (userPlanId ?? "free") as PlanTier;
  const userRank     = PLAN_RANK[userPlan]     ?? 0;
  const requiredRank = PLAN_RANK[requiredTier] ?? 0;

  if (userRank >= requiredRank) return null;

  return errorResponse(
    `This feature requires the ${requiredTier} plan or higher. Please upgrade to continue.`,
    "PLAN_UPGRADE_REQUIRED",
    403,
    req,
  );
}
