import { PUBLISHABLE_LICENSES, type LicenseType } from "@/lib/content/license";

/** Template slugs used as assessment roles. One taxonomy, not a parallel system. */
export const ASSESSMENT_ROLE_SLUGS = [
  "frontend-developer",
  "backend-developer",
  "full-stack-developer",
  "python-assessment",
  "sql-assessment",
  "java-developer",
  "react-assessment",
  "devops-assessment",
  "data-analyst",
  "qa-engineer",
  "general-aptitude",
  "hr-interview",
] as const;

export type AssessmentRoleSlug = (typeof ASSESSMENT_ROLE_SLUGS)[number];

export const REVIEW_STATUSES = ["draft", "review_required", "approved", "rejected", "archived"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** Categories that are frontend-only unless explicitly marked cross-functional. */
export const FRONTEND_ONLY_CATEGORIES = ["css", "html", "react"] as const;

/** Backend Developer template categories (existing category_distribution keys). */
export const BACKEND_DEVELOPER_CATEGORIES = ["backend", "sql", "java"] as const;

export const CATEGORY_DEFAULT_ROLES: Record<string, AssessmentRoleSlug[]> = {
  html: ["frontend-developer"],
  css: ["frontend-developer"],
  javascript: ["frontend-developer"],
  react: ["frontend-developer", "react-assessment"],
  backend: ["backend-developer"],
  sql: ["backend-developer", "sql-assessment", "data-analyst"],
  java: ["backend-developer", "java-developer"],
  python: ["python-assessment"],
  devops: ["devops-assessment"],
  aptitude: ["general-aptitude", "data-analyst", "qa-engineer"],
  hr: ["hr-interview"],
  testing: ["qa-engineer"],
  qa: ["qa-engineer"],
};

export type TaxonomyQuestion = {
  id: string;
  category?: string | null;
  subject?: string | null;
  topic?: string | null;
  tags?: string[] | null;
  difficulty?: string | null;
  question_type?: string | null;
  license_type?: string | null;
  publish_status?: string | null;
  review_status?: string | null;
  is_verified?: boolean | null;
  is_public?: boolean | null;
  eligible_roles?: string[] | null;
  cross_functional?: boolean | null;
  uploaded_by?: string | null;
  created_by?: string | null;
};

export type TemplateTaxonomy = {
  slug: string;
  role_slug?: string | null;
  category_distribution: Record<string, number>;
  strict_taxonomy?: boolean | null;
  is_active?: boolean | null;
  is_published?: boolean | null;
};

export function normalizeTaxonomyToken(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function isAssessmentRoleSlug(value: string): value is AssessmentRoleSlug {
  return (ASSESSMENT_ROLE_SLUGS as readonly string[]).includes(value);
}

export function isFrontendOnlyCategory(value: string | null | undefined): boolean {
  const token = normalizeTaxonomyToken(value);
  return (FRONTEND_ONLY_CATEGORIES as readonly string[]).includes(token);
}

export function questionCategoryTokens(question: TaxonomyQuestion): string[] {
  return [question.category, question.subject, question.topic]
    .map((value) => normalizeTaxonomyToken(value))
    .filter(Boolean);
}

export function defaultRolesForCategory(category: string | null | undefined): AssessmentRoleSlug[] {
  const token = normalizeTaxonomyToken(category);
  return CATEGORY_DEFAULT_ROLES[token] ?? [];
}

export function resolveEligibleRoles(question: TaxonomyQuestion): string[] {
  const explicit = (question.eligible_roles ?? []).map((role) => role.trim()).filter(Boolean);
  if (explicit.length > 0) return [...new Set(explicit)];
  const fromCategory = [
    ...defaultRolesForCategory(question.category),
    ...defaultRolesForCategory(question.subject),
  ];
  return [...new Set(fromCategory)];
}

export function templateAllowedCategories(template: TemplateTaxonomy): string[] {
  return Object.keys(template.category_distribution ?? {})
    .map((key) => normalizeTaxonomyToken(key))
    .filter(Boolean);
}

export function templateRoleSlug(template: TemplateTaxonomy): string {
  return normalizeTaxonomyToken(template.role_slug || template.slug);
}

export function matchesTemplateCategory(question: TaxonomyQuestion, category: string): boolean {
  const target = normalizeTaxonomyToken(category);
  if (!target) return false;
  return questionCategoryTokens(question).includes(target);
}

export function isFrontendOnlyQuestion(question: TaxonomyQuestion): boolean {
  if (question.cross_functional) return false;
  return [question.category, question.subject]
    .map((value) => normalizeTaxonomyToken(value))
    .some((token) => isFrontendOnlyCategory(token));
}

export function isCssFlexboxOnlyQuestion(question: TaxonomyQuestion): boolean {
  if (question.cross_functional) return false;
  const tokens = questionCategoryTokens(question);
  const cssCategory = tokens.includes("css");
  if (!cssCategory) return false;
  const blob = `${question.category ?? ""} ${question.subject ?? ""} ${question.topic ?? ""} ${(question.tags ?? []).join(" ")}`.toLowerCase();
  const mentionsFlexbox = /flexbox/.test(blob);
  return mentionsFlexbox || tokens.includes("layout") || tokens.includes("specificity") || cssCategory;
}

export function questionMatchesTemplateTaxonomy(
  question: TaxonomyQuestion,
  template: TemplateTaxonomy,
): boolean {
  const role = templateRoleSlug(template);
  const allowedCategories = templateAllowedCategories(template);
  const roles = resolveEligibleRoles(question).map(normalizeTaxonomyToken);
  const strict = template.strict_taxonomy !== false;
  const knownRole = isAssessmentRoleSlug(role);

  if (strict && (role === "backend-developer" || !knownRole && allowedCategories.includes("backend"))) {
    if (isCssFlexboxOnlyQuestion(question)) return false;
    if (isFrontendOnlyQuestion(question)) return false;
  }

  if (knownRole) {
    const roleOk =
      roles.includes(role) ||
      Boolean(question.cross_functional && allowedCategories.some((category) => roles.includes(category)));
    if (!roleOk) return false;
  }

  if (allowedCategories.length === 0) return true;
  return questionCategoryTokens(question).some((token) => allowedCategories.includes(token));
}

export function isLicensedPublished(question: TaxonomyQuestion): boolean {
  if (question.publish_status !== "published") return false;
  const license = (question.license_type ?? "UNKNOWN") as LicenseType;
  return PUBLISHABLE_LICENSES.includes(license);
}

export function isApprovedForAssessment(question: TaxonomyQuestion): boolean {
  if (!isLicensedPublished(question)) return false;
  if (question.review_status && question.review_status !== "approved") return false;
  if (question.review_status == null && question.is_verified === false) return false;
  if (question.is_public === false && !question.uploaded_by && !question.created_by) return false;
  return true;
}

export function isEligibleAssessmentQuestion(
  question: TaxonomyQuestion,
  template: TemplateTaxonomy,
  userId?: string | null,
): boolean {
  if (!isApprovedForAssessment(question)) return false;
  if (question.is_public) {
    return questionMatchesTemplateTaxonomy(question, template);
  }
  if (!userId) return false;
  if (question.uploaded_by !== userId && question.created_by !== userId) return false;
  return questionMatchesTemplateTaxonomy(question, template);
}
