/**
 * Server-side capability authorization (plan_id based).
 * Credits alone do not unlock every capability.
 */

import { normalizePlanId, planRank, type CanonicalPlanId } from "./billingCatalog.ts";
import { errorResponse } from "./utils.ts";

export type Capability =
  | "live_rehearsal"
  | "advanced_hints"
  | "mock_interview"
  | "mock_test"
  | "prep_star"
  | "prep_coding"
  | "detailed_debrief"
  | "public_share"
  | "desktop_overlay"
  | "analytics"
  | "company_research"
  | "priority_models";

/** Minimum plan rank required for each capability. */
const CAPABILITY_MIN_RANK: Record<Capability, number> = {
  live_rehearsal: 0,
  advanced_hints: 0,
  mock_interview: 0,
  mock_test: 0,
  prep_star: 0,
  prep_coding: 0,
  detailed_debrief: 0,
  public_share: 0,
  desktop_overlay: 0,
  analytics: 0,
  company_research: 0, // gated further by requirePlan("starter") where needed
  priority_models: 4, // enterprise/max only
};

export function hasCapability(
  planId: string | null | undefined,
  capability: Capability,
): boolean {
  const id = normalizePlanId(planId);
  if (!id) return false;
  const rank = planRank(id);
  return rank >= CAPABILITY_MIN_RANK[capability];
}

export function requireCapability(
  planId: string | null | undefined,
  capability: Capability,
  req?: Request,
): Response | null {
  if (hasCapability(planId, capability)) return null;
  return errorResponse(
    `This feature requires a higher plan (${capability}).`,
    "PLAN_UPGRADE_REQUIRED",
    403,
    req,
  );
}

export function requirePlanRank(
  planId: string | null | undefined,
  minimum: CanonicalPlanId,
  req?: Request,
): Response | null {
  const userRank = planRank(planId);
  const need = planRank(minimum);
  if (userRank < 0 || need < 0 || userRank < need) {
    return errorResponse(
      `This feature requires the ${minimum} plan or higher.`,
      "PLAN_UPGRADE_REQUIRED",
      403,
      req,
    );
  }
  return null;
}

/** Primary capability gate per AI Edge Function (table-driven). */
export const AI_FUNCTION_CAPABILITY: Record<string, Capability> = {
  "generate-hint": "advanced_hints",
  "generate-answer": "live_rehearsal",
  "generate-debrief": "detailed_debrief",
  "ai-feedback": "detailed_debrief",
  "ai-coach-chat": "live_rehearsal",
  "generate-questions": "mock_test",
  "generate-practice-questions": "mock_interview",
  "generate-star-answer": "prep_star",
  "polish-star-section": "prep_star",
  "prep-tool": "prep_star",
  "gap-analysis": "analytics",
  "parse-resume": "live_rehearsal",
  "parse-document": "live_rehearsal",
  "company-research": "company_research",
  "analyze-test-performance": "mock_test",
  "parse-question-pdf": "mock_test",
};

export function capabilityForFunction(functionName: string): Capability | null {
  return AI_FUNCTION_CAPABILITY[functionName] ?? null;
}

export function requireCapabilityForFunction(
  planId: string | null | undefined,
  functionName: string,
  req?: Request,
): Response | null {
  const capability = capabilityForFunction(functionName);
  if (!capability) return null;
  return requireCapability(planId, capability, req);
}
