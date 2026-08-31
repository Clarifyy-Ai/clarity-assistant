import { describe, expect, it } from "vitest";
import {
  evaluateAutoApproval,
  DEFAULT_QUESTION_RULE,
  DEFAULT_PAPER_RULE,
  buildIdempotencyKey,
  type QuestionValidationInput,
  type PaperValidationInput,
  type AutoApprovalRuleConfig,
} from "@/lib/gov-exam/autoApproval";

const ENABLED_OFFICIAL_RULE: AutoApprovalRuleConfig = {
  ...DEFAULT_QUESTION_RULE,
  enabled: true,
  requireProvenance: true,
  allowVerifiedPublic: false,
};

const ENABLED_VERIFIED_PUBLIC_RULE: AutoApprovalRuleConfig = {
  ...ENABLED_OFFICIAL_RULE,
  allowVerifiedPublic: true,
};

const VALID_QUESTION: QuestionValidationInput = {
  entityType: "question",
  sourceType: "official_verified",
  qualityScore: 85,
  qualityHardFail: false,
  hardFailCodes: [],
  duplicateStatus: "unique",
  hasProvenance: true,
  hasValidExam: true,
  hasValidStage: true,
  hasValidSection: true,
  hasValidSubject: true,
  hasValidLanguage: true,
  hasValidOptions: true,
  hasValidAnswer: true,
  hasValidDifficulty: true,
  ocrUncertainty: false,
  answerKeyConflict: false,
  policyViolation: false,
  unresolvedReviewFlag: false,
  sourceApproved: true,
};

describe("auto-approval rule engine — acceptance scenarios", () => {
  // 1. Valid official source → auto-approved (when enabled)
  it("1. valid official source auto-approved when rules enabled", () => {
    const r = evaluateAutoApproval(VALID_QUESTION, ENABLED_OFFICIAL_RULE);
    expect(r.outcome).toBe("AUTO_APPROVED");
    expect(r.approvalMode).toBe("AUTO");
    expect(r.publishStatus).toBe("draft");
  });

  // 2. Invalid official question → manual review/rejected
  it("2. invalid official question → manual review", () => {
    const r = evaluateAutoApproval(
      { ...VALID_QUESTION, hasValidAnswer: false, qualityHardFail: true, hardFailCodes: ["MCQ"] },
      ENABLED_OFFICIAL_RULE,
    );
    expect(r.outcome).toBe("MANUAL_REVIEW");
    expect(r.approvalMode).toBeNull();
  });

  // 3. Valid verified public → auto-approved only when policy allows
  it("3. verified public blocked unless policy allows", () => {
    const input = { ...VALID_QUESTION, sourceType: "verified_public_source" };
    expect(evaluateAutoApproval(input, ENABLED_OFFICIAL_RULE).outcome).toBe("MANUAL_REVIEW");
    expect(evaluateAutoApproval(input, ENABLED_VERIFIED_PUBLIC_RULE).outcome).toBe("AUTO_APPROVED");
  });

  // 4. Low-quality question → manual review
  it("4. low quality → manual review", () => {
    const r = evaluateAutoApproval(
      { ...VALID_QUESTION, qualityScore: 20 },
      ENABLED_OFFICIAL_RULE,
    );
    expect(r.outcome).toBe("MANUAL_REVIEW");
    expect(r.flags).toContain("LOW_QUALITY");
  });

  // 5. Duplicate question → manual review/rejected
  it("5. duplicate → rejected or manual review", () => {
    expect(
      evaluateAutoApproval({ ...VALID_QUESTION, duplicateStatus: "exact_duplicate" }, ENABLED_OFFICIAL_RULE).outcome,
    ).toBe("REJECTED");
    expect(
      evaluateAutoApproval({ ...VALID_QUESTION, duplicateStatus: "near_duplicate" }, ENABLED_OFFICIAL_RULE).outcome,
    ).toBe("MANUAL_REVIEW");
  });

  // 6. AI-generated → never official auto-approval
  it("6. AI-generated never auto-approved as official", () => {
    const r = evaluateAutoApproval(
      {
        ...VALID_QUESTION,
        sourceType: "ai_generated_practice",
        hardFailCodes: ["OFFICIAL_CLAIM"],
      },
      { ...ENABLED_OFFICIAL_RULE, allowAiGeneratedPractice: true },
    );
    expect(r.outcome).not.toBe("AUTO_APPROVED");
    expect(r.flags).toContain("AI_AS_OFFICIAL");
  });

  // 7. Python-generated practice → approved only as generated practice
  it("7. generated practice eligible when policy permits", () => {
    const r = evaluateAutoApproval(
      { ...VALID_QUESTION, sourceType: "generated_practice" },
      { ...ENABLED_OFFICIAL_RULE, allowGeneratedPractice: true },
    );
    expect(r.outcome).toBe("AUTO_APPROVED");
    expect(r.sourceType).toBe("generated_practice");
  });

  // 8. Missing provenance → manual review
  it("8. missing provenance → manual review", () => {
    const r = evaluateAutoApproval(
      { ...VALID_QUESTION, hasProvenance: false },
      ENABLED_OFFICIAL_RULE,
    );
    expect(r.outcome).toBe("MANUAL_REVIEW");
    expect(r.flags).toContain("MISSING_PROVENANCE");
  });

  // 9. Invalid answer key → manual review
  it("9. invalid answer key → manual review", () => {
    const r = evaluateAutoApproval(
      { ...VALID_QUESTION, answerKeyConflict: true, hasValidAnswer: false },
      ENABLED_OFFICIAL_RULE,
    );
    expect(r.outcome).toBe("MANUAL_REVIEW");
  });

  // 10. OCR uncertainty → manual review
  it("10. OCR uncertainty → manual review", () => {
    const r = evaluateAutoApproval(
      { ...VALID_QUESTION, ocrUncertainty: true },
      ENABLED_OFFICIAL_RULE,
    );
    expect(r.outcome).toBe("MANUAL_REVIEW");
    expect(r.flags).toContain("OCR_UNCERTAIN");
  });

  // 11-13. Admin manual approval audit — tested via adminOps structure
  it("11-13. manual override requires reason (adminOps contract)", async () => {
    const { adminOverrideQuestion } = await import("@/lib/gov-exam/adminOps");
    const r = await adminOverrideQuestion("00000000-0000-0000-0000-000000000001", "approve", "");
    expect(r.error).toContain("reason");
  });

  // 14. Idempotency key is deterministic
  it("14. idempotency key is stable for same inputs", () => {
    const k1 = buildIdempotencyKey("question", "abc", "job-1", 1);
    const k2 = buildIdempotencyKey("question", "abc", "job-1", 1);
    const k3 = buildIdempotencyKey("question", "abc", "job-2", 1);
    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
  });

  // 15. Rule change → new version (schema contract)
  it("15. rule versions are distinct in idempotency keys", () => {
    const v1 = buildIdempotencyKey("question", "abc", "job-1", 1);
    const v2 = buildIdempotencyKey("question", "abc", "job-1", 2);
    expect(v1).not.toBe(v2);
  });

  // 16. Unauthorized — enforced at Edge/RLS (contract: non-admin cannot mutate rules)
  it("16. disabled rules never auto-approve", () => {
    const r = evaluateAutoApproval(VALID_QUESTION, DEFAULT_QUESTION_RULE);
    expect(r.outcome).toBe("MANUAL_REVIEW");
    expect(r.flags).toContain("AUTO_APPROVAL_DISABLED");
  });

  // 17. Unpublished content — auto-approve without auto-publish stays draft
  it("17. auto-approved without auto-publish stays draft", () => {
    const r = evaluateAutoApproval(VALID_QUESTION, ENABLED_OFFICIAL_RULE);
    expect(r.outcome).toBe("AUTO_APPROVED");
    expect(r.publishStatus).toBe("draft");
    expect(r.autoPublish).toBe(false);
  });

  // 18. Correct inventory classification for generated practice
  it("18. generated practice classified correctly", () => {
    const r = evaluateAutoApproval(
      { ...VALID_QUESTION, sourceType: "generated_practice" },
      ENABLED_OFFICIAL_RULE,
    );
    expect(r.sourceType).toBe("generated_practice");
  });

  // 19. Paper blueprint violation → review required
  it("19. paper blueprint violation → manual review", () => {
    const paperInput: PaperValidationInput = {
      entityType: "paper",
      sourceType: "approved_bank",
      qualityScore: 90,
      qualityHardFail: false,
      hardFailCodes: [],
      duplicateStatus: "unique",
      hasProvenance: true,
      blueprintValid: false,
      questionCountMatch: false,
      sectionQuotasMet: false,
      topicQuotasMet: true,
      difficultyValid: true,
      languageValid: true,
      marksValid: true,
      negativeMarkingValid: true,
      allQuestionsValidated: true,
      hardFailCount: 0,
      reviewQueueLength: 0,
    };
    const r = evaluateAutoApproval(paperInput, { ...DEFAULT_PAPER_RULE, enabled: true });
    expect(r.outcome).toBe("MANUAL_REVIEW");
    expect(r.flags).toContain("BLUEPRINT_VIOLATION");
  });

  // 20. Failed auto-approval never silently approved
  it("20. engine failure → AUTO_APPROVAL_FAILED, not approved", () => {
    const brokenRule = {
      ...ENABLED_OFFICIAL_RULE,
      allowedSourceTypes: null as unknown as string[],
    };
    const r = evaluateAutoApproval(VALID_QUESTION, brokenRule);
    expect(r.outcome).toBe("AUTO_APPROVAL_FAILED");
    expect(r.newStatus).not.toBe("approved");
  });
});

describe("approval ≠ publish separation", () => {
  it("auto-publish only when explicitly configured", () => {
    const r = evaluateAutoApproval(VALID_QUESTION, {
      ...ENABLED_OFFICIAL_RULE,
      autoPublish: true,
    });
    expect(r.outcome).toBe("AUTO_APPROVED");
    expect(r.publishStatus).toBe("published");
    expect(r.autoPublish).toBe(true);
  });
});
