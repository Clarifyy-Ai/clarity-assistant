/**
 * Server-side capability authorization (plan_id based).
 * Credits alone do not unlock every capability.
 *
 * Ranks align with PLAN_RANK in billingCatalog.ts and PLANS.features in
 * src/lib/billing/subscriptionManager.ts:
 *   free/starter = 0, pro/elite = 2, enterprise = 4
 */

import { launchPlanRank, normalizePlanId, type CanonicalPlanId } from "./billingCatalog.ts";
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
  | "priority_models"
  | "calendar_sync"
  | "gov_exam_ai_fill";

/**
 * Minimum plan rank required for each capability.
 * Mirrors client PLANS.features: free gets limited coaching/prep/mock;
 * Pro unlocks overlay, company research, analytics, calendar sync, AI mock-test fill.
 */
export const CAPABILITY_MIN_RANK: Record<Capability, number> = {
  live_rehearsal: 0, // free: limited Practice Coach sessions
  advanced_hints: 0, // free: included with live sessions (credit-gated)
  mock_interview: 0, // free: limited mock sessions
  mock_test: 0, // free: official papers; AI gap-fill gated separately via requirePlan("pro")
  prep_star: 0, // free: limited STAR builder
  prep_coding: 0, // free: prep tools available (some Pro tools gated in UI)
  detailed_debrief: 0, // available after any session
  public_share: 0, // share tokens not plan-gated
  desktop_overlay: 2, // Pro: practice overlay
  analytics: 2, // Pro: performance analytics / gap analysis
  company_research: 2, // Pro: company research
  calendar_sync: 2, // Pro: calendar sync
  gov_exam_ai_fill: 2, // Pro: AI gap-fill for gov papers — independent of overlay
  priority_models: 4, // Max/enterprise only
};

export function hasCapability(
  planId: string | null | undefined,
  capability: Capability,
): boolean {
  const id = normalizePlanId(planId);
  if (!id) return false;
  return launchPlanRank(id) >= CAPABILITY_MIN_RANK[capability];
}

export function requireCapability(
  planId: string | null | undefined,
  capability: Capability,
  req?: Request,
): Response | null {
  if (hasCapability(planId, capability)) return null;
  return errorResponse(
    "This feature requires a supported plan.",
    "CAPABILITY_REQUIRED",
    403,
    req,
  );
}

export function requirePlanRank(
  planId: string | null | undefined,
  minimum: CanonicalPlanId,
  req?: Request,
): Response | null {
  const userRank = launchPlanRank(planId);
  const need = launchPlanRank(minimum);
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
  "generate-scorecard": "detailed_debrief",
  "ai-coach-chat": "live_rehearsal",
  "generate-questions": "mock_interview",
  "generate-star-answer": "prep_star",
  "polish-star-section": "prep_star",
  "prep-tool": "prep_star",
  "gap-analysis": "analytics",
  "parse-resume": "live_rehearsal",
  "parse-document": "live_rehearsal",
  "company-research": "company_research",
  "analyze-test-performance": "mock_test",
  "select-test-questions": "mock_test",
  "assemble-assessment": "mock_test",
  "create-exam-paper": "gov_exam_ai_fill",
  "parse-question-pdf": "mock_test",
  "sync-calendar": "calendar_sync",
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
