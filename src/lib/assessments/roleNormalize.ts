import {
  ASSESSMENT_ROLE_SLUGS,
  type AssessmentRoleSlug,
  isAssessmentRoleSlug,
  normalizeTaxonomyToken,
} from "@/lib/assessments/taxonomy";

/** Canonical role families used for blueprints and UI. */
export const ROLE_FAMILY_LABELS: Record<AssessmentRoleSlug, string> = {
  "frontend-developer": "Frontend Engineer",
  "backend-developer": "Backend Engineer",
  "full-stack-developer": "Full-Stack Engineer",
  "python-assessment": "Python Engineer",
  "sql-assessment": "SQL Specialist",
  "java-developer": "Java Engineer",
  "react-assessment": "React Engineer",
  "devops-assessment": "DevOps / SRE",
  "data-analyst": "Data Analyst",
  "general-aptitude": "General Aptitude",
  "hr-interview": "HR / Behavioural",
  "qa-engineer": "QA Engineer",
};

/** Free-text / profile aliases → canonical slug. */
const ROLE_ALIASES: Record<string, AssessmentRoleSlug> = {
  "backend engineer": "backend-developer",
  "backend developer": "backend-developer",
  "back-end engineer": "backend-developer",
  "back end engineer": "backend-developer",
  "server-side engineer": "backend-developer",
  "server side engineer": "backend-developer",
  "software engineer backend": "backend-developer",
  "frontend engineer": "frontend-developer",
  "frontend developer": "frontend-developer",
  "front-end engineer": "frontend-developer",
  "front end engineer": "frontend-developer",
  "ui engineer": "frontend-developer",
  "full stack engineer": "full-stack-developer",
  "full-stack engineer": "full-stack-developer",
  "fullstack engineer": "full-stack-developer",
  "data analyst": "data-analyst",
  "business analyst data": "data-analyst",
  "analytics engineer": "data-analyst",
  "qa engineer": "qa-engineer",
  "quality assurance engineer": "qa-engineer",
  "test engineer": "qa-engineer",
  "sdet": "qa-engineer",
  "devops engineer": "devops-assessment",
  "sre": "devops-assessment",
  "site reliability engineer": "devops-assessment",
  "python developer": "python-assessment",
  "java developer": "java-developer",
  "react developer": "react-assessment",
  "software engineer": "full-stack-developer",
  "software developer": "full-stack-developer",
};

export type NormalizedRole = {
  slug: AssessmentRoleSlug;
  originalTitle: string;
  matchedVia: "exact_slug" | "alias" | "fallback_general";
};

export function normalizeRoleInput(raw: string | null | undefined): NormalizedRole | null {
  const original = String(raw ?? "").trim();
  if (!original) return null;

  const token = normalizeTaxonomyToken(original).replace(/_/g, "-");
  if (isAssessmentRoleSlug(token)) {
    return { slug: token, originalTitle: original, matchedVia: "exact_slug" };
  }

  const aliasKey = original.toLowerCase().replace(/\s+/g, " ").trim();
  const fromAlias = ROLE_ALIASES[aliasKey];
  if (fromAlias) {
    return { slug: fromAlias, originalTitle: original, matchedVia: "alias" };
  }

  // Fuzzy contains
  for (const [alias, slug] of Object.entries(ROLE_ALIASES)) {
    if (aliasKey.includes(alias) || alias.includes(aliasKey)) {
      return { slug, originalTitle: original, matchedVia: "alias" };
    }
  }

  return {
    slug: "general-aptitude",
    originalTitle: original,
    matchedVia: "fallback_general",
  };
}

export function roleLabel(slug: AssessmentRoleSlug): string {
  return ROLE_FAMILY_LABELS[slug] ?? slug;
}

export function selectableRoleOptions(): Array<{ value: AssessmentRoleSlug; label: string }> {
  return (ASSESSMENT_ROLE_SLUGS as readonly AssessmentRoleSlug[]).map((value) => ({
    value,
    label: roleLabel(value),
  }));
}

export function templateSlugForRole(slug: AssessmentRoleSlug): string {
  // Seeded templates use role_slug === slug for all except full-stack (no seed).
  if (slug === "full-stack-developer") return "frontend-developer";
  if (slug === "qa-engineer") return "qa-engineer";
  return slug;
}
