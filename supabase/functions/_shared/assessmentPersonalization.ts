/**
 * Shared assessment personalization helpers for Edge (Deno).
 * Mirrors src/lib/assessments blueprint + readiness contracts.
 */

export const BLUEPRINT_POLICY_VERSION = "assessment-blueprint-v1";
export const SELECTION_POLICY_VERSION = "assessment-selection-v1";

export const ROLE_BLUEPRINTS: Record<string, Record<string, number>> = {
  "backend-developer": { backend: 35, sql: 25, java: 15, python: 10, devops: 15 },
  "frontend-developer": { javascript: 30, react: 25, html: 15, css: 15, backend: 15 },
  "full-stack-developer": { javascript: 20, react: 15, backend: 25, sql: 20, html: 10, css: 10 },
  "data-analyst": { sql: 45, aptitude: 30, python: 25 },
  "qa-engineer": { aptitude: 30, backend: 25, sql: 25, javascript: 20 },
  "devops-assessment": { devops: 55, backend: 25, sql: 20 },
  "python-assessment": { python: 70, sql: 20, aptitude: 10 },
  "sql-assessment": { sql: 80, aptitude: 20 },
  "java-developer": { java: 70, backend: 20, sql: 10 },
  "react-assessment": { react: 60, javascript: 25, css: 15 },
  "general-aptitude": { aptitude: 70, hr: 30 },
  "hr-interview": { hr: 80, aptitude: 20 },
};

const ROLE_ALIASES: Record<string, string> = {
  "backend engineer": "backend-developer",
  "backend developer": "backend-developer",
  "server-side engineer": "backend-developer",
  "frontend engineer": "frontend-developer",
  "data analyst": "data-analyst",
  "qa engineer": "qa-engineer",
  "devops engineer": "devops-assessment",
};

export function normalizeRoleSlug(raw: string | null | undefined): string {
  const original = String(raw ?? "").trim();
  if (!original) return "general-aptitude";
  const token = original.toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
  if (ROLE_BLUEPRINTS[token]) return token;
  const alias = ROLE_ALIASES[original.toLowerCase().replace(/\s+/g, " ")];
  if (alias) return alias;
  for (const [k, v] of Object.entries(ROLE_ALIASES)) {
    if (original.toLowerCase().includes(k)) return v;
  }
  return ROLE_BLUEPRINTS[token] ? token : "general-aptitude";
}

export function roleLabel(slug: string): string {
  const labels: Record<string, string> = {
    "backend-developer": "Backend Engineer",
    "frontend-developer": "Frontend Engineer",
    "data-analyst": "Data Analyst",
    "qa-engineer": "QA Engineer",
    "devops-assessment": "DevOps / SRE",
    "general-aptitude": "General Aptitude",
  };
  return labels[slug] ?? slug;
}

function normalizeWeights(weights: Record<string, number>): Record<string, number> {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  if (total <= 0) return weights;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(weights)) {
    out[k] = Math.round((v / total) * 1000) / 10;
  }
  return out;
}

export function blueprintForRole(
  roleSlug: string,
  templateOverride?: Record<string, number> | null,
): Record<string, number> {
  if (templateOverride && Object.keys(templateOverride).length > 0) {
    return normalizeWeights(templateOverride);
  }
  return { ...(ROLE_BLUEPRINTS[roleSlug] ?? ROLE_BLUEPRINTS["general-aptitude"]) };
}

export function applyWeakBoost(
  baseline: Record<string, number>,
  weakTopics: string[] | null | undefined,
): { weights: Record<string, number>; boosted: string[] } {
  const weak = (weakTopics ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (!weak.length) return { weights: normalizeWeights(baseline), boosted: [] };
  const next = { ...baseline };
  const boosted: string[] = [];
  for (const cat of Object.keys(next)) {
    if (weak.some((w) => w.includes(cat) || cat.includes(w))) {
      next[cat] = Math.min(40, next[cat] + 10);
      boosted.push(cat);
    }
  }
  return { weights: normalizeWeights(next), boosted };
}

export type ReadinessResult = {
  ready: boolean;
  missingFields: string[];
  reasonCode: string;
  message: string;
  personalized: boolean;
  role_slug: string;
};

function missingContextMessage(missing: string[]): string {
  if (!missing.length) {
    return "We need a little more information to personalize your assessment.";
  }
  return `We need a little more information to personalize your assessment. Missing: ${missing.join(", ")}.`;
}

/** Returns canonical slug when role is supported; null when free-text would silently fall back to general. */
export function resolveSupportedRoleSlug(raw: string | null | undefined): string | null {
  const original = String(raw ?? "").trim();
  if (!original) return null;
  const token = original.toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
  if (ROLE_BLUEPRINTS[token]) return token;
  const mapped = normalizeRoleSlug(original);
  if (mapped !== "general-aptitude") return mapped;
  if (token === "general-aptitude" || /^general(\s|-)?aptitude$/i.test(original)) {
    return "general-aptitude";
  }
  return null;
}

export function evaluateReadiness(setup: Record<string, unknown> | null | undefined, forceGeneral: boolean): ReadinessResult {
  const s = setup ?? {};
  const roleRaw = String(s.target_role ?? s.role_slug ?? "").trim();
  const requestedSlug = String(s.role_slug ?? "").trim();
  const experience = String(s.experience_level ?? "").trim();
  const objective = String(s.assessment_objective ?? "").trim();
  const difficulty = String(s.difficulty ?? "").trim();
  const questionCount = Number(s.question_count ?? 0);

  if (forceGeneral) {
    const missing: string[] = [];
    if (!(questionCount > 0)) missing.push("question_count");
    if (!difficulty) missing.push("difficulty");
    return {
      ready: missing.length === 0,
      missingFields: missing,
      reasonCode: missing.length ? "PROFILE_CONTEXT_INSUFFICIENT" : "OK",
      message: missing.length
        ? missingContextMessage(missing)
        : "General assessment ready (not personalized).",
      personalized: false,
      role_slug: "general-aptitude",
    };
  }

  const missing: string[] = [];
  const supported = resolveSupportedRoleSlug(requestedSlug || roleRaw);
  if (!supported) missing.push("target_role");
  if (!experience) missing.push("experience_level");
  if (!objective) missing.push("assessment_objective");
  if (!difficulty) missing.push("difficulty");
  if (!(questionCount > 0)) missing.push("question_count");

  // Unsupported free-text role — fail closed (never silent general).
  if ((requestedSlug || roleRaw) && !supported) {
    return {
      ready: false,
      missingFields: missing,
      reasonCode: "ROLE_NOT_SUPPORTED",
      message:
        "That target role is not supported for personalized assessments yet. Select a supported role or continue with a general assessment.",
      personalized: true,
      role_slug: "general-aptitude",
    };
  }

  return {
    ready: missing.length === 0,
    missingFields: missing,
    reasonCode: missing.length ? "PROFILE_CONTEXT_INSUFFICIENT" : "OK",
    message: missing.length ? missingContextMessage(missing) : "Assessment context is ready.",
    personalized: true,
    role_slug: supported ?? "general-aptitude",
  };
}

export function buildWhySelected(input: {
  roleLabel: string;
  objective: string;
  boosted: string[];
  personalized: boolean;
}): string {
  if (!input.personalized) {
    return "This is a general assessment. It was not personalized to a target role or résumé.";
  }
  const parts = [
    `This assessment focuses on skills important for your ${input.roleLabel} target role (objective: ${input.objective.replace(/_/g, " ")}).`,
  ];
  if (input.boosted.length) {
    parts.push(
      `${input.boosted.join(", ")} received additional coverage because earlier practice showed these areas need improvement.`,
    );
  }
  return parts.join(" ");
}

export function stableHash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function buildSelectionSeed(userId: string, templateId: string, roleSlug: string, idem?: string | null): string {
  return `${stableHash(`${userId}|${templateId}|${roleSlug}|${idem ?? ""}|assessment-selection-v1`)}`;
}
