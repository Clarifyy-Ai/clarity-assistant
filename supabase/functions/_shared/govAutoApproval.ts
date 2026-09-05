/**
 * Deterministic, rule-based auto-approval engine for gov exam content.
 * NEVER uses AI to decide approval. Fail-closed on engine errors.
 *
 * Pipeline: INGESTED → VALIDATE → DEDUPLICATE → QUALITY → PROVENANCE → RULE ENGINE
 */

import { MIN_BANK_QUESTION_QUALITY } from "./algorithmCatalog.ts";

export const AUTO_APPROVAL_OUTCOMES = [
  "AUTO_APPROVED",
  "MANUAL_REVIEW",
  "REJECTED",
  "AUTO_APPROVAL_FAILED",
] as const;
export type AutoApprovalOutcome = (typeof AUTO_APPROVAL_OUTCOMES)[number];

export const APPROVAL_MODES = ["AUTO", "MANUAL"] as const;
export type ApprovalMode = (typeof APPROVAL_MODES)[number];

/** Source types that may NEVER be auto-approved as official content. */
export const NEVER_OFFICIAL_SOURCE_TYPES = new Set([
  "ai_generated_practice",
  "generated_practice",
]);

/** Source types that ALWAYS require manual review regardless of rules. */
export const ALWAYS_MANUAL_REVIEW_FLAGS = new Set([
  "OCR_UNCERTAIN",
  "ANSWER_KEY_CONFLICT",
  "POLICY_FLAG",
  "SOURCE_CONFLICT",
  "AI_AS_OFFICIAL",
  "MALFORMED",
  "MISSING_PROVENANCE",
  "NEAR_DUPLICATE",
  "EXACT_DUPLICATE",
  "LOW_QUALITY",
  "UNRESOLVED_REVIEW_FLAG",
  "BLUEPRINT_VIOLATION",
  "QUESTION_COUNT_MISMATCH",
]);

export type AutoApprovalRuleConfig = {
  entityType: "question" | "paper";
  ruleVersion: number;
  enabled: boolean;
  minQualityScore: number;
  duplicateThreshold: number;
  autoPublish: boolean;
  allowedSourceTypes: string[];
  allowedExamIds: string[] | null;
  allowedLanguages: string[] | null;
  allowVerifiedPublic: boolean;
  allowInternalBank: boolean;
  allowGeneratedPractice: boolean;
  allowAiGeneratedPractice: boolean;
  requireProvenance: boolean;
  manualReviewFlags: string[];
};

export type QuestionValidationInput = {
  entityType: "question";
  questionId?: string;
  sourceType: string;
  qualityScore: number;
  qualityHardFail: boolean;
  hardFailCodes: string[];
  duplicateStatus: "unique" | "near_duplicate" | "exact_duplicate";
  hasProvenance: boolean;
  hasValidExam: boolean;
  hasValidStage: boolean;
  hasValidSection: boolean;
  hasValidSubject: boolean;
  hasValidLanguage: boolean;
  hasValidOptions: boolean;
  hasValidAnswer: boolean;
  hasValidDifficulty: boolean;
  ocrUncertainty: boolean;
  answerKeyConflict: boolean;
  policyViolation: boolean;
  unresolvedReviewFlag: boolean;
  sourceApproved: boolean;
  examId?: string | null;
  language?: string | null;
  processingJobId?: string | null;
};

export type PaperValidationInput = {
  entityType: "paper";
  paperId?: string;
  sourceType: string;
  qualityScore: number;
  qualityHardFail: boolean;
  hardFailCodes: string[];
  duplicateStatus: "unique" | "near_duplicate" | "exact_duplicate";
  hasProvenance: boolean;
  blueprintValid: boolean;
  questionCountMatch: boolean;
  sectionQuotasMet: boolean;
  topicQuotasMet: boolean;
  difficultyValid: boolean;
  languageValid: boolean;
  marksValid: boolean;
  negativeMarkingValid: boolean;
  allQuestionsValidated: boolean;
  hardFailCount: number;
  reviewQueueLength: number;
  examId?: string | null;
  language?: string | null;
  processingJobId?: string | null;
};

export type AutoApprovalEvaluation = {
  outcome: AutoApprovalOutcome;
  approvalMode: ApprovalMode | null;
  ruleVersion: number | null;
  flags: string[];
  ruleResults: Array<{ rule: string; passed: boolean; detail?: string }>;
  sourceType: string;
  qualityScore: number;
  duplicateResult: string;
  autoPublish: boolean;
  previousStatus: string;
  newStatus: string;
  publishStatus: string;
};

export const DEFAULT_QUESTION_RULE: AutoApprovalRuleConfig = {
  entityType: "question",
  ruleVersion: 1,
  enabled: false,
  minQualityScore: MIN_BANK_QUESTION_QUALITY,
  duplicateThreshold: 0.92,
  autoPublish: false,
  allowedSourceTypes: [
    "official_verified",
    "verified_public_source",
    "approved_bank",
    "internal_question_bank",
    "generated_practice",
    "ai_generated_practice",
  ],
  allowedExamIds: null,
  allowedLanguages: null,
  allowVerifiedPublic: false,
  allowInternalBank: true,
  allowGeneratedPractice: true,
  allowAiGeneratedPractice: true,
  requireProvenance: true,
  manualReviewFlags: [...ALWAYS_MANUAL_REVIEW_FLAGS],
};

export const DEFAULT_PAPER_RULE: AutoApprovalRuleConfig = {
  ...DEFAULT_QUESTION_RULE,
  entityType: "paper",
  allowGeneratedPractice: false,
  allowAiGeneratedPractice: false,
};

export function parseRuleRow(row: Record<string, unknown>): AutoApprovalRuleConfig {
  return {
    entityType: row.entity_type === "paper" ? "paper" : "question",
    ruleVersion: Number(row.rule_version) || 1,
    enabled: row.enabled === true,
    minQualityScore: Number(row.min_quality_score) || MIN_BANK_QUESTION_QUALITY,
    duplicateThreshold: Number(row.duplicate_threshold) || 0.92,
    autoPublish: row.auto_publish === true,
    allowedSourceTypes: Array.isArray(row.allowed_source_types)
      ? (row.allowed_source_types as string[])
      : DEFAULT_QUESTION_RULE.allowedSourceTypes,
    allowedExamIds: Array.isArray(row.allowed_exam_ids)
      ? (row.allowed_exam_ids as string[])
      : null,
    allowedLanguages: Array.isArray(row.allowed_languages)
      ? (row.allowed_languages as string[])
      : null,
    allowVerifiedPublic: row.allow_verified_public === true,
    allowInternalBank: row.allow_internal_bank !== false,
    allowGeneratedPractice: row.allow_generated_practice !== false,
    allowAiGeneratedPractice: row.allow_ai_generated_practice !== false,
    requireProvenance: row.require_provenance !== false,
    manualReviewFlags: Array.isArray(row.manual_review_flags)
      ? (row.manual_review_flags as string[])
      : [...ALWAYS_MANUAL_REVIEW_FLAGS],
  };
}

function checkHardValidationRules(
  input: QuestionValidationInput | PaperValidationInput,
  results: Array<{ rule: string; passed: boolean; detail?: string }>,
  flags: string[],
): boolean {
  let allPassed = true;

  const add = (rule: string, passed: boolean, detail?: string, flag?: string) => {
    results.push({ rule, passed, detail });
    if (!passed) {
      allPassed = false;
      if (flag) flags.push(flag);
    }
  };

  if (input.qualityHardFail) {
    add("quality_hard_fail", false, "Quality hard-fail detected", "LOW_QUALITY");
  } else {
    add("quality_hard_fail", true);
  }

  if (input.duplicateStatus === "exact_duplicate") {
    add("duplicate_check", false, "Exact duplicate", "EXACT_DUPLICATE");
  } else if (input.duplicateStatus === "near_duplicate") {
    add("duplicate_check", false, "Near duplicate", "NEAR_DUPLICATE");
  } else {
    add("duplicate_check", true);
  }

  if (input.entityType === "question") {
    const q = input as QuestionValidationInput;
    add("valid_exam", q.hasValidExam, "Invalid or missing exam", "MALFORMED");
    add("valid_stage", q.hasValidStage, "Invalid or missing stage", "MALFORMED");
    add("valid_section", q.hasValidSection, "Invalid or missing section", "MALFORMED");
    add("valid_subject", q.hasValidSubject, "Invalid or missing subject/topic", "MALFORMED");
    add("valid_language", q.hasValidLanguage, "Invalid language", "MALFORMED");
    add("valid_options", q.hasValidOptions, "Invalid options", "MALFORMED");
    add("valid_answer", q.hasValidAnswer, "Invalid answer key", "MALFORMED");
    add("valid_difficulty", q.hasValidDifficulty, "Invalid difficulty", "MALFORMED");
    add("approved_source", q.sourceApproved, "Source not approved", "POLICY_FLAG");
    add("ocr_certainty", !q.ocrUncertainty, "OCR uncertainty", "OCR_UNCERTAIN");
    add("answer_key", !q.answerKeyConflict, "Conflicting answer key", "ANSWER_KEY_CONFLICT");
    add("policy", !q.policyViolation, "Policy violation", "POLICY_FLAG");
    add("review_flag", !q.unresolvedReviewFlag, "Unresolved review flag", "UNRESOLVED_REVIEW_FLAG");

    // AI/Python generated must NEVER be labeled official
    if (
      NEVER_OFFICIAL_SOURCE_TYPES.has(q.sourceType) &&
      (q.sourceType === "ai_generated_practice" || q.hardFailCodes.includes("OFFICIAL_CLAIM"))
    ) {
      add("ai_not_official", false, "AI content cannot be official", "AI_AS_OFFICIAL");
    } else {
      add("ai_not_official", true);
    }
  } else {
    const p = input as PaperValidationInput;
    add("blueprint_valid", p.blueprintValid, "Blueprint invalid", "BLUEPRINT_VIOLATION");
    add("question_count", p.questionCountMatch, "Question count mismatch", "QUESTION_COUNT_MISMATCH");
    add("section_quotas", p.sectionQuotasMet, "Section quotas not met", "BLUEPRINT_VIOLATION");
    add("topic_quotas", p.topicQuotasMet, "Topic quotas not met", "BLUEPRINT_VIOLATION");
    add("difficulty", p.difficultyValid, "Difficulty distribution invalid", "BLUEPRINT_VIOLATION");
    add("language", p.languageValid, "Language invalid", "MALFORMED");
    add("marks", p.marksValid, "Marks invalid", "MALFORMED");
    add("negative_marking", p.negativeMarkingValid, "Negative marking invalid", "MALFORMED");
    add("all_questions_valid", p.allQuestionsValidated, "Not all questions validated", "MALFORMED");
    add("hard_fail_count", p.hardFailCount === 0, `${p.hardFailCount} hard fails`, "LOW_QUALITY");
    add("review_queue", p.reviewQueueLength === 0, `${p.reviewQueueLength} review items`, "UNRESOLVED_REVIEW_FLAG");
  }

  return allPassed;
}

function checkSourcePolicy(
  sourceType: string,
  rule: AutoApprovalRuleConfig,
  results: Array<{ rule: string; passed: boolean; detail?: string }>,
  flags: string[],
): boolean {
  if (!rule.allowedSourceTypes.includes(sourceType)) {
    results.push({ rule: "allowed_source_type", passed: false, detail: `Source ${sourceType} not allowed` });
    flags.push("POLICY_FLAG");
    return false;
  }
  results.push({ rule: "allowed_source_type", passed: true });

  switch (sourceType) {
    case "official_verified":
      return true;
    case "verified_public_source":
      if (!rule.allowVerifiedPublic) {
        results.push({ rule: "verified_public_policy", passed: false, detail: "Verified public auto-approve disabled" });
        flags.push("POLICY_FLAG");
        return false;
      }
      results.push({ rule: "verified_public_policy", passed: true });
      return true;
    case "internal_question_bank":
    case "approved_bank":
      if (!rule.allowInternalBank) {
        results.push({ rule: "internal_bank_policy", passed: false });
        flags.push("POLICY_FLAG");
        return false;
      }
      results.push({ rule: "internal_bank_policy", passed: true });
      return true;
    case "generated_practice":
      if (!rule.allowGeneratedPractice) {
        results.push({ rule: "generated_practice_policy", passed: false });
        flags.push("POLICY_FLAG");
        return false;
      }
      results.push({ rule: "generated_practice_policy", passed: true });
      return true;
    case "ai_generated_practice":
      if (!rule.allowAiGeneratedPractice) {
        results.push({ rule: "ai_generated_policy", passed: false });
        flags.push("POLICY_FLAG");
        return false;
      }
      results.push({ rule: "ai_generated_policy", passed: true });
      return true;
    default:
      results.push({ rule: "source_trust", passed: false, detail: `Untrusted source: ${sourceType}` });
      flags.push("POLICY_FLAG");
      return false;
  }
}

export function evaluateAutoApproval(
  input: QuestionValidationInput | PaperValidationInput,
  rule: AutoApprovalRuleConfig = input.entityType === "paper"
    ? DEFAULT_PAPER_RULE
    : DEFAULT_QUESTION_RULE,
): AutoApprovalEvaluation {
  const flags: string[] = [];
  const ruleResults: Array<{ rule: string; passed: boolean; detail?: string }> = [];

  const previousStatus = input.entityType === "question" ? "review_required" : "machine_validated";
  const baseResult: AutoApprovalEvaluation = {
    outcome: "MANUAL_REVIEW",
    approvalMode: null,
    ruleVersion: rule.ruleVersion,
    flags,
    ruleResults,
    sourceType: input.sourceType,
    qualityScore: input.qualityScore,
    duplicateResult: input.duplicateStatus,
    autoPublish: false,
    previousStatus,
    newStatus: "review_required",
    publishStatus: "draft",
  };

  try {
    // Rule engine disabled → manual review (never assume approval)
    if (!rule.enabled) {
      ruleResults.push({ rule: "auto_approval_enabled", passed: false, detail: "Auto-approval disabled" });
      flags.push("AUTO_APPROVAL_DISABLED");
      return { ...baseResult, outcome: "MANUAL_REVIEW", flags, ruleResults };
    }

    ruleResults.push({ rule: "auto_approval_enabled", passed: true });

    // Provenance check
    if (rule.requireProvenance && !input.hasProvenance) {
      ruleResults.push({ rule: "provenance", passed: false, detail: "Missing provenance" });
      flags.push("MISSING_PROVENANCE");
      return { ...baseResult, outcome: "MANUAL_REVIEW", flags, ruleResults };
    }
    ruleResults.push({ rule: "provenance", passed: true });

    // Quality threshold
    if (input.qualityScore < rule.minQualityScore) {
      ruleResults.push({
        rule: "quality_threshold",
        passed: false,
        detail: `Score ${input.qualityScore} < ${rule.minQualityScore}`,
      });
      flags.push("LOW_QUALITY");
      return { ...baseResult, outcome: "MANUAL_REVIEW", flags, ruleResults };
    }
    ruleResults.push({ rule: "quality_threshold", passed: true });

    // Exam / language allowlists
    if (rule.allowedExamIds?.length && input.examId && !rule.allowedExamIds.includes(input.examId)) {
      ruleResults.push({ rule: "allowed_exam", passed: false, detail: "Exam not in allowlist" });
      flags.push("POLICY_FLAG");
      return { ...baseResult, outcome: "MANUAL_REVIEW", flags, ruleResults };
    }
    ruleResults.push({ rule: "allowed_exam", passed: true });

    if (rule.allowedLanguages?.length && input.language && !rule.allowedLanguages.includes(input.language)) {
      ruleResults.push({ rule: "allowed_language", passed: false, detail: "Language not in allowlist" });
      flags.push("POLICY_FLAG");
      return { ...baseResult, outcome: "MANUAL_REVIEW", flags, ruleResults };
    }
    ruleResults.push({ rule: "allowed_language", passed: true });

    // Source-based policy
    if (!checkSourcePolicy(input.sourceType, rule, ruleResults, flags)) {
      return { ...baseResult, outcome: "MANUAL_REVIEW", flags, ruleResults };
    }

    // Hard validation rules
    const hardPassed = checkHardValidationRules(input, ruleResults, flags);
    if (!hardPassed) {
      // Duplicates → reject; other failures → manual review
      const isExactDuplicate = flags.includes("EXACT_DUPLICATE");
      const outcome: AutoApprovalOutcome = isExactDuplicate ? "REJECTED" : "MANUAL_REVIEW";
      return {
        ...baseResult,
        outcome,
        newStatus: outcome === "REJECTED" ? "rejected" : "review_required",
        flags,
        ruleResults,
      };
    }

    // All rules passed → AUTO_APPROVED (but NOT auto-published unless configured)
    return {
      ...baseResult,
      outcome: "AUTO_APPROVED",
      approvalMode: "AUTO",
      flags,
      ruleResults,
      newStatus: "approved",
      publishStatus: rule.autoPublish ? "published" : "draft",
      autoPublish: rule.autoPublish,
    };
  } catch (err) {
    // Engine failure → fail closed, never assume approval
    flags.push("AUTO_APPROVAL_FAILED");
    ruleResults.push({
      rule: "engine",
      passed: false,
      detail: err instanceof Error ? err.message : "Unknown engine error",
    });
    return {
      ...baseResult,
      outcome: "AUTO_APPROVAL_FAILED",
      newStatus: "review_required",
      flags,
      ruleResults,
    };
  }
}

export function buildIdempotencyKey(
  entityType: string,
  entityId: string,
  processingJobId: string | null | undefined,
  ruleVersion: number,
): string {
  const jobPart = processingJobId ?? "no-job";
  return `${entityType}:${entityId}:${jobPart}:v${ruleVersion}`;
}

/** Pick the rule row pipelines should use: highest enabled version, else latest. */
export function pickActiveRuleRow<
  T extends { entity_type: string; rule_version: number; enabled: boolean },
>(rows: T[], entityType: "question" | "paper"): T | null {
  const sorted = rows
    .filter((r) => r.entity_type === entityType)
    .sort((a, b) => b.rule_version - a.rule_version);
  return sorted.find((r) => r.enabled) ?? sorted[0] ?? null;
}

type RuleQueryChain = {
  eq(col: string, val: string | boolean): RuleQueryChain;
  order(col: string, opts: { ascending: boolean }): {
    limit(n: number): {
      maybeSingle(): Promise<{ data: Record<string, unknown> | null }>;
    };
  };
};

type RuleQueryClient = {
  from(table: string): {
    select(cols: string): RuleQueryChain;
  };
};

/** Load the active auto-approval rule (enabled highest version, else latest). */
export async function loadAutoApprovalRule(
  db: RuleQueryClient,
  entityType: "question" | "paper",
): Promise<AutoApprovalRuleConfig> {
  const { data: enabled } = await db
    .from("gov_auto_approval_rules")
    .select("*")
    .eq("entity_type", entityType)
    .eq("enabled", true)
    .order("rule_version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (enabled) return parseRuleRow(enabled);

  const { data: latest } = await db
    .from("gov_auto_approval_rules")
    .select("*")
    .eq("entity_type", entityType)
    .order("rule_version", { ascending: false })
    .limit(1)
    .maybeSingle();

  return latest
    ? parseRuleRow(latest)
    : entityType === "paper"
      ? DEFAULT_PAPER_RULE
      : DEFAULT_QUESTION_RULE;
}
