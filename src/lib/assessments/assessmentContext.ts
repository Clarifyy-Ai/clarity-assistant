import type { AssessmentRoleSlug } from "@/lib/assessments/taxonomy";
import { normalizeRoleInput, roleLabel } from "@/lib/assessments/roleNormalize";
import {
  BLUEPRINT_POLICY_VERSION,
  SELECTION_POLICY_VERSION,
  applyWeakTopicBoost,
  blueprintForRole,
  type CategoryWeights,
} from "@/lib/assessments/blueprint";

export const ASSESSMENT_OBJECTIVES = [
  "baseline",
  "role_readiness",
  "resume_validation",
  "jd_readiness",
  "weak_area_improvement",
  "interview_round",
  "technical_screening",
  "mixed",
] as const;

export type AssessmentObjective = (typeof ASSESSMENT_OBJECTIVES)[number];

export const EXPERIENCE_LEVELS = [
  "intern",
  "junior",
  "mid",
  "senior",
  "staff",
  "manager",
] as const;

export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export type AssessmentSetupPayload = {
  target_role: string;
  role_slug?: AssessmentRoleSlug;
  domain?: string;
  experience_level: ExperienceLevel | string;
  assessment_objective: AssessmentObjective | string;
  assessment_type?: string;
  difficulty: "easy" | "medium" | "hard" | "mixed" | string;
  question_count: number;
  duration_minutes?: number;
  resume_version_id?: string | null;
  jd_version_id?: string | null;
  skills_include?: string[];
  skills_exclude?: string[];
  preferred_language?: string | null;
  company?: string | null;
  interview_round?: string | null;
  focus_areas?: string[];
  force_general?: boolean;
};

export type AssessmentReadiness = {
  ready: boolean;
  missingFields: string[];
  recommendedFields: string[];
  reasonCode: "OK" | "PROFILE_CONTEXT_INSUFFICIENT" | "ROLE_NOT_SUPPORTED";
  message: string;
  personalized: boolean;
  role_slug: AssessmentRoleSlug | null;
  role_label: string | null;
};

export type ProfileContextInput = {
  target_role?: string | null;
  experience_level?: string | null;
  resume_skills?: string[] | null;
  has_resume?: boolean;
  has_jd?: boolean;
  weak_topics?: string[] | null;
  strong_topics?: string[] | null;
};

export function readExperienceFromProfile(profile: unknown): string | null {
  if (!profile || typeof profile !== "object") return null;
  const row = profile as Record<string, unknown>;
  const prefs = row.notification_prefs;
  if (prefs && typeof prefs === "object" && !Array.isArray(prefs)) {
    const level = (prefs as Record<string, unknown>).experience_level;
    if (typeof level === "string" && level.trim()) return level.trim();
  }
  if (typeof row.experience_level === "string" && row.experience_level.trim()) {
    return row.experience_level.trim();
  }
  return null;
}

function missingContextMessage(missingFields: string[]): string {
  if (!missingFields.length) {
    return "We need a little more information to personalize your assessment.";
  }
  return `We need a little more information to personalize your assessment. Missing: ${missingFields.join(", ")}.`;
}

export function evaluateAssessmentReadiness(
  setup: Partial<AssessmentSetupPayload>,
  profile?: ProfileContextInput | null,
): AssessmentReadiness {
  const forceGeneral = setup.force_general === true;
  const roleRaw = String(setup.target_role || setup.role_slug || profile?.target_role || "").trim();
  const explicitSlug =
    typeof setup.role_slug === "string" && setup.role_slug.trim()
      ? normalizeRoleInput(setup.role_slug)
      : null;
  // Prefer an explicitly selected catalog slug over free-text fallbacks.
  const normalized =
    explicitSlug && explicitSlug.matchedVia !== "fallback_general"
      ? explicitSlug
      : normalizeRoleInput(roleRaw || null);
  const experience =
    String(setup.experience_level ?? profile?.experience_level ?? "").trim() || null;
  const objective = String(setup.assessment_objective ?? "").trim() || null;
  const difficulty = String(setup.difficulty ?? "").trim() || null;
  const questionCount =
    typeof setup.question_count === "number" && setup.question_count > 0
      ? setup.question_count
      : null;

  const missing: string[] = [];
  const unsupportedRole =
    !forceGeneral &&
    Boolean(roleRaw) &&
    (!normalized || normalized.matchedVia === "fallback_general");
  if (!forceGeneral) {
    if (!roleRaw || !normalized || normalized.matchedVia === "fallback_general") {
      missing.push("target_role");
    }
  }
  if (!experience) missing.push("experience_level");
  if (!objective) missing.push("assessment_objective");
  if (!difficulty) missing.push("difficulty");
  if (!questionCount) missing.push("question_count");

  const recommended: string[] = [];
  if (!setup.resume_version_id && !profile?.has_resume) recommended.push("resume");
  if (!setup.jd_version_id && !profile?.has_jd) recommended.push("target_jd");
  if (!(setup.skills_include?.length) && !(profile?.resume_skills?.length)) {
    recommended.push("target_skills");
  }
  if (!setup.domain) recommended.push("target_domain");

  if (forceGeneral) {
    const generalMissing = [
      ...(!questionCount ? ["question_count"] : []),
      ...(!difficulty ? ["difficulty"] : []),
    ];
    return {
      ready: generalMissing.length === 0,
      missingFields: generalMissing,
      recommendedFields: recommended,
      reasonCode: generalMissing.length === 0 ? "OK" : "PROFILE_CONTEXT_INSUFFICIENT",
      message:
        generalMissing.length === 0
          ? "General assessment ready (not personalized)."
          : missingContextMessage(generalMissing),
      personalized: false,
      role_slug: "general-aptitude",
      role_label: roleLabel("general-aptitude"),
    };
  }

  if (unsupportedRole) {
    return {
      ready: false,
      missingFields: missing.includes("target_role") ? missing : ["target_role", ...missing],
      recommendedFields: recommended,
      reasonCode: "ROLE_NOT_SUPPORTED",
      message:
        "That target role is not supported for personalized assessments yet. Select a supported role or continue with a general assessment.",
      personalized: true,
      role_slug: null,
      role_label: null,
    };
  }

  if (missing.length > 0) {
    return {
      ready: false,
      missingFields: missing,
      recommendedFields: recommended,
      reasonCode: "PROFILE_CONTEXT_INSUFFICIENT",
      message: missingContextMessage(missing),
      personalized: true,
      role_slug: normalized?.slug ?? null,
      role_label: normalized ? roleLabel(normalized.slug) : null,
    };
  }

  return {
    ready: true,
    missingFields: [],
    recommendedFields: recommended,
    reasonCode: "OK",
    message: "Assessment context is ready.",
    personalized: true,
    role_slug: normalized!.slug,
    role_label: roleLabel(normalized!.slug),
  };
}

export function buildWhySelected(input: {
  roleLabel: string;
  objective: string;
  boostedCategories: string[];
  personalized: boolean;
  resumeSkills?: string[];
}): string {
  if (!input.personalized) {
    return "This is a general assessment. It was not personalized to a target role or résumé.";
  }
  const parts = [
    `This assessment focuses on skills important for your ${input.roleLabel} target role`,
    `(objective: ${input.objective.replace(/_/g, " ")}).`,
  ];
  if (input.boostedCategories.length) {
    parts.push(
      `${input.boostedCategories.join(", ")} received additional coverage because earlier practice showed these areas need improvement.`,
    );
  }
  if (input.resumeSkills?.length) {
    parts.push(`Résumé skills considered: ${input.resumeSkills.slice(0, 6).join(", ")}.`);
  }
  return parts.join(" ");
}

export function resolveBlueprintForSetup(
  roleSlug: AssessmentRoleSlug,
  templateDistribution: CategoryWeights | null | undefined,
  weakTopics: string[] | null | undefined,
  objective: string,
): { weights: CategoryWeights; boostedCategories: string[]; policyVersion: string } {
  const baseline = blueprintForRole(roleSlug, templateDistribution);
  const useWeak =
    objective === "weak_area_improvement" ||
    objective === "mixed" ||
    objective === "role_readiness";
  const { weights, boostedCategories } = useWeak
    ? applyWeakTopicBoost(baseline, weakTopics)
    : { weights: baseline, boostedCategories: [] as string[] };
  return {
    weights,
    boostedCategories,
    policyVersion: BLUEPRINT_POLICY_VERSION,
  };
}

export { SELECTION_POLICY_VERSION, BLUEPRINT_POLICY_VERSION };
