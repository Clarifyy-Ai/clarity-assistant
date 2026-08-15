import { describe, expect, it } from "vitest";
import { canPublishLicense, normalizeLicense, publishBlockReason } from "@/lib/content/license";
import {
  buildImportReport,
  formatImportReport,
  mapRawImportRow,
  parseCsvText,
} from "@/lib/question-bank/importQuestions";
import {
  assembleExamInstance,
  hasDuplicateQuestionIds,
  isEligibleForPublicAssessment,
  type ExamBlueprint,
} from "@/lib/assessments/examTemplateEngine";
import {
  canIssueCertificate,
  coursePercentage,
  isModuleUnlocked,
  moduleProgressViews,
} from "@/lib/learning/progress";
import { certificateKindLabel, isOfficialCertificationClaim, verificationPath } from "@/lib/learning/certificates";
import { applyReport, canPublicRead } from "@/lib/community/moderation";
import {
  assertNoHiddenCasesExposed,
  publicScorePayload,
  rejectClientScore,
  scoreJavascriptSolve,
  stripHiddenTestCases,
} from "@/lib/coding/assessment";
import { canAccessDocument, canCreatePracticeSet } from "@/lib/library/documentRights";
import { scorePracticeAnswers } from "@/lib/practice/workspaceScoring";
import { canUserAReadUserBRow, USER_OWNED_TABLES } from "@/lib/security/rlsTenantIsolation";
import { ALTERNATIVE_FEATURE_STATUS } from "@/lib/certification/alternativeFeatureStatus";
import { MOBILE_BREAKPOINTS, PAGE_SHELL } from "@/lib/ui/responsivePage";
import { isStealthCaptureFeatureAllowed } from "@/lib/compliance/featureGates";

const blueprint: ExamBlueprint = {
  id: "t1",
  title: "Frontend Developer Assessment",
  question_count: 4,
  duration_minutes: 30,
  passing_percentage: 60,
  marks_positive: 4,
  marks_negative: 1,
  randomize: true,
  difficulty_distribution: { EASY: 50, MEDIUM: 50, HARD: 0 },
  category_distribution: { HTML: 50, CSS: 50 },
};

describe("licensing publish gate", () => {
  it("blocks UNKNOWN from public exams", () => {
    expect(canPublishLicense("UNKNOWN")).toBe(false);
    expect(publishBlockReason("UNKNOWN")).toMatch(/cannot be published/i);
    expect(canPublishLicense("ORIGINAL")).toBe(true);
    expect(normalizeLicense("public-domain")).toBe("PUBLIC_DOMAIN");
  });
});

describe("question import", () => {
  it("validates required fields, duplicates, license, and answers", () => {
    const csv = [
      "question,option_a,option_b,option_c,option_d,correct_answer,category,difficulty,explanation,source,license",
      "What is 1+1?,1,2,3,4,B,Math,EASY,Two,ORIGINAL,ORIGINAL",
      "What is 1+1?,1,2,3,4,B,Math,EASY,Two,ORIGINAL,ORIGINAL",
      "Missing category?,1,2,3,4,A,,EASY,x,ORIGINAL,ORIGINAL",
      "Bad difficulty,1,2,3,4,A,Math,IMPOSSIBLE,x,ORIGINAL,ORIGINAL",
      "No license,1,2,3,4,A,Math,EASY,x,ORIGINAL,",
      "Bad answer,1,2,3,4,Z,Math,EASY,x,ORIGINAL,ORIGINAL",
    ].join("\n");
    const rows = parseCsvText(csv).map(mapRawImportRow);
    const report = buildImportReport(rows);
    expect(report.total).toBe(6);
    expect(report.imported).toBe(1);
    expect(report.duplicates).toBe(1);
    expect(report.invalid).toBeGreaterThanOrEqual(3);
    expect(report.missingLicensingMetadata).toBe(1);
    expect(formatImportReport(report)).toMatch(/Total records: 6/);
    expect(formatImportReport(report)).toMatch(/Missing licensing metadata: 1/);
  });
});

describe("exam template engine", () => {
  it("selects unique licensed questions and skips UNKNOWN", () => {
    const pool = [
      { id: "1", category: "HTML", difficulty: "EASY", license_type: "ORIGINAL", publish_status: "published", is_public: true },
      { id: "2", category: "HTML", difficulty: "MEDIUM", license_type: "ORIGINAL", publish_status: "published", is_public: true },
      { id: "3", category: "CSS", difficulty: "EASY", license_type: "ORIGINAL", publish_status: "published", is_public: true },
      { id: "4", category: "CSS", difficulty: "MEDIUM", license_type: "ORIGINAL", publish_status: "published", is_public: true },
      { id: "x", category: "HTML", difficulty: "EASY", license_type: "UNKNOWN", publish_status: "published", is_public: true },
    ];
    expect(isEligibleForPublicAssessment(pool[4])).toBe(false);
    const assembled = assembleExamInstance(blueprint, pool, { seed: 42 });
    expect(assembled.questionIds).toHaveLength(4);
    expect(hasDuplicateQuestionIds(assembled.questionIds)).toBe(false);
    expect(assembled.questionIds).not.toContain("x");
  });
});

describe("learning progress", () => {
  it("unlocks the next module after completion", () => {
    const modules = [
      { id: "m1", sortOrder: 0, lessons: [{ id: "l1", moduleId: "m1", sortOrder: 0 }] },
      { id: "m2", sortOrder: 1, lessons: [{ id: "l2", moduleId: "m2", sortOrder: 0 }] },
    ];
    expect(isModuleUnlocked(modules, "m2", new Set(), "sequential")).toBe(false);
    expect(isModuleUnlocked(modules, "m2", new Set(["l1"]), "sequential")).toBe(true);
    expect(coursePercentage(modules, new Set(["l1"]))).toBe(50);
    expect(canIssueCertificate(100)).toBe(true);
    const views = moduleProgressViews(
      modules.map((m, i) => ({ ...m, title: `Module ${i + 1}` })),
      new Set(["l1"]),
      "sequential",
    );
    expect(views[0].state).toBe("complete");
    expect(views[1].state).toBe("in_progress");
  });
});

describe("certificates", () => {
  it("uses course completion wording and a verify path", () => {
    expect(certificateKindLabel()).toBe("Course Completion Certificate");
    expect(verificationPath("CLR-2026-AB")).toBe("/verify-certificate/CLR-2026-AB");
    expect(isOfficialCertificationClaim("official certification")).toBe(true);
  });
});

describe("community moderation", () => {
  it("marks reported posts and hides from public when hidden", () => {
    expect(applyReport("PUBLISHED")).toBe("REPORTED");
    expect(canPublicRead("HIDDEN", false, false)).toBe(false);
    expect(canPublicRead("PUBLISHED", false, false)).toBe(true);
  });
});

describe("coding assessment", () => {
  it("strips hidden cases and scores only on the server helper", () => {
    const cases = [
      { id: "s", name: "sample", input: [1, 2], expected: 3, is_hidden: false },
      { id: "h", name: "secret", input: [9, 1], expected: 10, is_hidden: true },
    ];
    const visible = stripHiddenTestCases(cases);
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe("s");
    const score = scoreJavascriptSolve("function solve(input) { return input[0] + input[1]; }", cases);
    expect(score.passed_tests).toBe(2);
    expect(assertNoHiddenCasesExposed(publicScorePayload(score))).toBe(true);
    expect(rejectClientScore({ score: 100, passed_tests: 2 })).toEqual(
      expect.arrayContaining(["score", "passed_tests"]),
    );
  });
});

describe("document library", () => {
  it("prevents cross-user access and unconfirmed practice sets", () => {
    expect(canAccessDocument("a", "b")).toBe(false);
    expect(canAccessDocument("a", "a")).toBe(true);
    expect(
      canCreatePracticeSet({ ownerId: "a", viewerId: "a", rightsConfirmed: false, contentRights: "USER_OWNED" }),
    ).toBe(false);
    expect(
      canCreatePracticeSet({ ownerId: "a", viewerId: "a", rightsConfirmed: true, contentRights: "USER_OWNED" }),
    ).toBe(true);
  });
});

describe("practice workspace rubric", () => {
  it("scores visible practice without claiming official results", () => {
    const scores = scorePracticeAnswers(
      [
        {
          question: "Tell me about a conflict",
          answer:
            "Situation at my last team. I led a migration. We reduced latency and the result improved checkout.",
        },
      ],
      "Behavioral",
    );
    expect(scores.overall).toBeGreaterThan(0);
    expect(scores.rubricNote).toMatch(/not an official/i);
  });
});

describe("security contracts", () => {
  it("keeps user-owned alternative tables isolated", () => {
    for (const table of USER_OWNED_TABLES.filter((t) =>
      ["personal_library_documents", "coding_submissions", "course_enrollments", "lesson_progress"].includes(t.table),
    )) {
      expect(
        canUserAReadUserBRow({ table, ownerId: "user-b", viewerId: "user-a" }),
      ).toBe(false);
    }
    expect(isStealthCaptureFeatureAllowed()).toBe(false);
  });
});

describe("status and mobile shell", () => {
  it("does not rename blocked scraping or stealth to DONE", () => {
    expect(ALTERNATIVE_FEATURE_STATUS.copyrightScraping).toBe("INTENTIONALLY_NOT_SUPPORTED");
    expect(ALTERNATIVE_FEATURE_STATUS.undetectableOverlay).toBe("INTENTIONALLY_NOT_SUPPORTED");
    expect(ALTERNATIVE_FEATURE_STATUS.codingAssessment).toBe("IMPLEMENTED_WITH_LIMITATIONS");
    expect(ALTERNATIVE_FEATURE_STATUS.aiProviders).toBe("UNCHANGED");
    expect(ALTERNATIVE_FEATURE_STATUS.orgSso).toBe("UNCHANGED");
    expect(PAGE_SHELL).toMatch(/overflow-x-hidden/);
    expect(MOBILE_BREAKPOINTS).toEqual([360, 390, 412, 768, 1024, 1440]);
  });
});
