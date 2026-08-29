/**
 * Product-engine entitlement separation.
 * Interview coaching credits/capabilities do not unlock gov-exam AI fill
 * unless the catalog explicitly maps both to the same plan rank.
 */

export type ProductEngine = "interview" | "gov_exam" | "shared";

export const INTERVIEW_CAPABILITIES = [
  "live_rehearsal",
  "advanced_hints",
  "mock_interview",
  "prep_star",
  "prep_coding",
  "detailed_debrief",
  "desktop_overlay",
  "company_research",
  "calendar_sync",
] as const;

export const GOV_EXAM_CAPABILITIES = ["mock_test", "gov_exam_ai_fill"] as const;

export const SHARED_CAPABILITIES = ["analytics", "public_share", "priority_models"] as const;

export type InterviewCapability = (typeof INTERVIEW_CAPABILITIES)[number];
export type GovExamCapability = (typeof GOV_EXAM_CAPABILITIES)[number];

export function engineForCapability(capability: string): ProductEngine {
  if ((INTERVIEW_CAPABILITIES as readonly string[]).includes(capability)) return "interview";
  if ((GOV_EXAM_CAPABILITIES as readonly string[]).includes(capability)) return "gov_exam";
  return "shared";
}

/**
 * Overlay (interview engine) is independent of gov-exam AI fill.
 * Having overlay without gov AI is the expected separated state.
 */
export function interviewUnlockDoesNotGrantGovAi(opts: {
  hasDesktopOverlay: boolean;
  hasGovExamAiFill: boolean;
}): boolean {
  if (opts.hasDesktopOverlay && opts.hasGovExamAiFill) {
    return engineForCapability("desktop_overlay") !== engineForCapability("gov_exam_ai_fill");
  }
  return engineForCapability("desktop_overlay") === "interview";
}
