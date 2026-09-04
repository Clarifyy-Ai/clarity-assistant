import {
  ASSESSMENT_OBJECTIVES,
  EXPERIENCE_LEVELS,
  type AssessmentSetupPayload,
  evaluateAssessmentReadiness,
  readExperienceFromProfile,
} from "@/lib/assessments/assessmentContext";
import { selectableRoleOptions, type NormalizedRole } from "@/lib/assessments/roleNormalize";
import { normalizeRoleInput } from "@/lib/assessments/roleNormalize";

const STORAGE_KEY = "career_pilot_assessment_setup_v1";

export function loadAssessmentSetupDraft(): Partial<AssessmentSetupPayload> | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<AssessmentSetupPayload>;
  } catch {
    return null;
  }
}

export function saveAssessmentSetupDraft(setup: Partial<AssessmentSetupPayload>): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(setup));
}

export function clearAssessmentSetupDraft(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function defaultSetupFromProfile(profile: unknown): Partial<AssessmentSetupPayload> {
  const row = (profile && typeof profile === "object" ? profile : {}) as Record<string, unknown>;
  const targetRole = typeof row.target_role === "string" ? row.target_role : "";
  const normalized = normalizeRoleInput(targetRole);
  // Fail-closed: never silently map unsupported profile roles to general-aptitude.
  const supported =
    normalized && normalized.matchedVia !== "fallback_general" ? normalized : null;
  return {
    target_role: targetRole,
    role_slug: supported?.slug,
    experience_level: readExperienceFromProfile(profile) ?? undefined,
    assessment_objective: undefined,
    assessment_type: "mixed_competency",
    difficulty: "medium",
    question_count: 6,
    duration_minutes: 15,
    domain: typeof row.domain === "string" ? row.domain : "",
    force_general: false,
  };
}

export {
  ASSESSMENT_OBJECTIVES,
  EXPERIENCE_LEVELS,
  evaluateAssessmentReadiness,
  selectableRoleOptions,
};
export type { AssessmentSetupPayload, NormalizedRole };
