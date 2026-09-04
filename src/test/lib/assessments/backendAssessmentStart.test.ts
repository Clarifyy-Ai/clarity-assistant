import { describe, expect, it } from "vitest";
import {
  assembleExamInstance,
  filterEligibleTemplateQuestions,
  hasDuplicateQuestionIds,
  inventoryAllowsStart,
  type ExamBlueprint,
} from "@/lib/assessments/examTemplateEngine";
import { ApiClientError } from "@/lib/api/apiClient";
import {
  assessmentStartIdempotencyKey,
  decideAssembleAssessmentResponse,
  extractAssessmentInventoryDetails,
  mapAssessmentRpcError,
  messageFromAssessmentStartError,
  parseAssessmentStartRequest,
  userMessageForAssessmentError,
} from "@/lib/assessments/assessmentStart";
import {
  isCssFlexboxOnlyQuestion,
  isEligibleAssessmentQuestion,
  isFrontendOnlyQuestion,
  questionMatchesTemplateTaxonomy,
} from "@/lib/assessments/taxonomy";
import { isAssessmentReadyQuestion, validateQuestionQuality } from "@/lib/assessments/questionQuality";
import {
  canUserAReadUserBRow,
  canUserModifyExamTemplate,
  canUserModifyQuestionEligibility,
  canUserWriteTestResponse,
  USER_OWNED_TABLES,
} from "@/lib/security/rlsTenantIsolation";

const ready = {
  question_text: "Valid stem?",
  question_type: "MCQ",
  options: [
    { label: "A", text: "One" },
    { label: "B", text: "Two" },
  ],
  correct_answer: "B",
  explanation: "Because B is correct.",
  review_status: "approved",
  publish_status: "published",
  license_type: "ORIGINAL",
  is_public: true,
  is_verified: true,
} as const;

const backendBlueprint: ExamBlueprint = {
  id: "backend-id",
  slug: "backend-developer",
  role_slug: "backend-developer",
  title: "Backend Developer Assessment",
  question_count: 4,
  duration_minutes: 18,
  passing_percentage: 60,
  marks_positive: 4,
  marks_negative: 1,
  randomize: true,
  strict_taxonomy: true,
  difficulty_distribution: { EASY: 50, MEDIUM: 50, HARD: 0 },
  category_distribution: { Backend: 50, SQL: 50 },
};

describe("assessment request validation", () => {
  it("requires a UUID template_id", () => {
    expect(parseAssessmentStartRequest(null).ok).toBe(false);
    expect(parseAssessmentStartRequest({}).ok).toBe(false);
    expect(parseAssessmentStartRequest({ template_id: "backend-developer" }).ok).toBe(false);
    const parsed = parseAssessmentStartRequest({
      template_id: "c6c64819-d48c-4e9b-a278-dd41aaba3e76",
    });
    expect(parsed.ok).toBe(true);
  });

  it("ignores client-supplied role fields", () => {
    const parsed = parseAssessmentStartRequest({
      template_id: "c6c64819-d48c-4e9b-a278-dd41aaba3e76",
      role: "frontend-developer",
      eligible_roles: ["frontend-developer"],
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect("role" in parsed.value).toBe(false);
    }
  });
});

describe("template taxonomy filtering", () => {
  it("excludes CSS/Flexbox-only questions from Backend Developer", () => {
    const css = {
      id: "css-1",
      category: "CSS",
      subject: "CSS",
      topic: "Layout",
      eligible_roles: ["frontend-developer"],
      ...ready,
    };
    expect(isCssFlexboxOnlyQuestion(css)).toBe(true);
    expect(isFrontendOnlyQuestion(css)).toBe(true);
    expect(
      questionMatchesTemplateTaxonomy(css, {
        slug: "backend-developer",
        role_slug: "backend-developer",
        category_distribution: { Backend: 40, SQL: 40, Java: 20 },
        strict_taxonomy: true,
      }),
    ).toBe(false);
  });

  it("keeps CSS eligible for Frontend Developer templates", () => {
    const css = {
      id: "css-1",
      category: "CSS",
      subject: "CSS",
      topic: "Layout",
      eligible_roles: ["frontend-developer"],
      ...ready,
    };
    expect(
      questionMatchesTemplateTaxonomy(css, {
        slug: "frontend-developer",
        role_slug: "frontend-developer",
        category_distribution: { HTML: 20, CSS: 20, JavaScript: 40, React: 20 },
        strict_taxonomy: true,
      }),
    ).toBe(true);
  });

  it("does not treat a SQL question as CSS because an option mentions Flexbox", () => {
    const sql = {
      id: "sql-flex-distractor",
      category: "SQL",
      subject: "SQL",
      topic: "Security",
      eligible_roles: ["backend-developer", "sql-assessment"],
      ...ready,
    };
    expect(isCssFlexboxOnlyQuestion(sql)).toBe(false);
    expect(
      questionMatchesTemplateTaxonomy(sql, {
        slug: "backend-developer",
        role_slug: "backend-developer",
        category_distribution: { Backend: 40, SQL: 40, Java: 20 },
        strict_taxonomy: true,
      }),
    ).toBe(true);
  });

  it("keeps SQL and Backend questions eligible for Backend Developer", () => {
    const sql = {
      id: "sql-1",
      category: "SQL",
      subject: "SQL",
      topic: "Joins",
      eligible_roles: ["backend-developer", "sql-assessment"],
      ...ready,
    };
    expect(
      isEligibleAssessmentQuestion(sql, {
        slug: "backend-developer",
        role_slug: "backend-developer",
        category_distribution: { Backend: 40, SQL: 40, Java: 20 },
        strict_taxonomy: true,
      }),
    ).toBe(true);
  });
});

describe("backend developer question selection", () => {
  it("selects only backend taxonomy and never CSS/Flexbox", () => {
    const pool = [
      { id: "b1", category: "Backend", subject: "Backend", topic: "HTTP", difficulty: "EASY", eligible_roles: ["backend-developer"], ...ready },
      { id: "b2", category: "Backend", subject: "Backend", topic: "Auth", difficulty: "MEDIUM", eligible_roles: ["backend-developer"], ...ready },
      { id: "s1", category: "SQL", subject: "SQL", topic: "Joins", difficulty: "EASY", eligible_roles: ["backend-developer", "sql-assessment"], ...ready },
      { id: "s2", category: "SQL", subject: "SQL", topic: "Indexes", difficulty: "MEDIUM", eligible_roles: ["backend-developer", "sql-assessment"], ...ready },
      { id: "css", category: "CSS", subject: "CSS", topic: "Layout", difficulty: "EASY", eligible_roles: ["frontend-developer"], ...ready, question_text: "Which CSS layout is Flexbox?" },
      { id: "html", category: "HTML", subject: "HTML", topic: "Landmarks", difficulty: "EASY", eligible_roles: ["frontend-developer"], ...ready },
      { id: "draft", category: "Backend", subject: "Backend", topic: "HTTP", difficulty: "EASY", eligible_roles: ["backend-developer"], ...ready, publish_status: "draft" },
      { id: "rejected", category: "Backend", subject: "Backend", topic: "HTTP", difficulty: "EASY", eligible_roles: ["backend-developer"], ...ready, review_status: "rejected" },
    ];
    const assembled = assembleExamInstance(backendBlueprint, pool, { seed: 7 });
    expect(inventoryAllowsStart(assembled)).toBe(true);
    expect(hasDuplicateQuestionIds(assembled.questionIds)).toBe(false);
    expect(assembled.questionIds).not.toContain("css");
    expect(assembled.questionIds).not.toContain("html");
    expect(assembled.questionIds).not.toContain("draft");
    expect(assembled.questionIds).not.toContain("rejected");
    const selected = filterEligibleTemplateQuestions(backendBlueprint, pool);
    expect(selected.every((q) => ["Backend", "SQL"].includes(String(q.category)))).toBe(true);
  });

  it("does not fill inventory with unrelated frontend questions", () => {
    const thinPool = [
      { id: "b1", category: "Backend", subject: "Backend", topic: "HTTP", difficulty: "EASY", eligible_roles: ["backend-developer"], ...ready },
      { id: "css", category: "CSS", subject: "CSS", topic: "Layout", difficulty: "EASY", eligible_roles: ["frontend-developer"], ...ready },
    ];
    const assembled = assembleExamInstance(backendBlueprint, thinPool, { seed: 1 });
    expect(assembled.questionIds).toEqual(["b1"]);
    expect(assembled.unfilled).toBe(3);
    expect(inventoryAllowsStart(assembled)).toBe(false);
    expect(assembled.questionIds).not.toContain("css");
  });
});

describe("question inventory and quality", () => {
  it("rejects questions missing a matching correct option", () => {
    const issues = validateQuestionQuality({
      question_text: "Q?",
      question_type: "MCQ",
      options: [{ label: "A", text: "One" }, { label: "B", text: "Two" }],
      correct_answer: "Z",
      explanation: "Because",
      difficulty: "EASY",
      category: "Backend",
    });
    expect(issues.some((issue) => issue.code === "invalid_correct_answer")).toBe(true);
    expect(isAssessmentReadyQuestion({ ...ready, correct_answer: "Z" })).toBe(false);
  });
});

describe("attempt limits and error mapping", () => {
  it("maps max attempts to MAX_ATTEMPTS_REACHED, not a payment error", () => {
    const mapped = mapAssessmentRpcError({
      message: "Maximum attempts reached for this assessment",
      details: "MAX_ATTEMPTS_REACHED",
    });
    expect(mapped.code).toBe("MAX_ATTEMPTS_REACHED");
    expect(userMessageForAssessmentError(mapped.code)).not.toMatch(/pay|credit|upgrade/i);
  });

  it("maps inventory shortage with requested vs available counts", () => {
    const mapped = mapAssessmentRpcError({
      message: "Not enough eligible questions",
      details: "INSUFFICIENT_QUESTION_INVENTORY",
      hint: JSON.stringify({ requested_count: 6, available_count: 2, template_slug: "backend-developer" }),
    });
    expect(mapped.code).toBe("INSUFFICIENT_QUESTION_INVENTORY");
    expect(mapped.details?.requested_count).toBe(6);
    expect(mapped.details?.available_count).toBe(2);
    expect(userMessageForAssessmentError(mapped.code, mapped.details)).toMatch(/6/);
  });

  it("maps CONTENT_INSUFFICIENT to a personalization-safe user message", () => {
    const mapped = mapAssessmentRpcError({
      message: "Not enough approved content for personalized blueprint",
      details: "CONTENT_INSUFFICIENT",
    });
    expect(mapped.code).toBe("CONTENT_INSUFFICIENT");
    expect(userMessageForAssessmentError(mapped.code)).toMatch(/personalized blueprint|approved question-bank/i);
    expect(userMessageForAssessmentError(mapped.code)).not.toMatch(/pay|credit|upgrade/i);
  });
});

describe("start idempotency key", () => {
  it("is stable for the same user and template", () => {
    const a = assessmentStartIdempotencyKey("user-1", "c6c64819-d48c-4e9b-a278-dd41aaba3e76");
    const b = assessmentStartIdempotencyKey("user-1", "c6c64819-d48c-4e9b-a278-dd41aaba3e76");
    expect(a).toBe(b);
    expect(a).toContain("assess-start:");
  });
});

describe("assemble-assessment edge contract", () => {
  it("handles OPTIONS, origins, JWT, payload, capability, and success", () => {
    expect(decideAssembleAssessmentResponse({
      method: "OPTIONS", originAllowed: true, hasOrigin: true, hasJwt: false, jwtValid: false, capabilityAllowed: true, body: {},
    }).status).toBe(204);

    expect(decideAssembleAssessmentResponse({
      method: "OPTIONS", originAllowed: false, hasOrigin: true, hasJwt: false, jwtValid: false, capabilityAllowed: true, body: {},
    })).toMatchObject({ status: 403, body: { code: "ORIGIN_NOT_ALLOWED" } });

    expect(decideAssembleAssessmentResponse({
      method: "POST", originAllowed: false, hasOrigin: true, hasJwt: true, jwtValid: true, capabilityAllowed: true, body: {},
    }).body.code).toBe("ORIGIN_NOT_ALLOWED");

    expect(decideAssembleAssessmentResponse({
      method: "POST", originAllowed: true, hasOrigin: true, hasJwt: false, jwtValid: false, capabilityAllowed: true, body: {},
    }).status).toBe(401);

    expect(decideAssembleAssessmentResponse({
      method: "POST", originAllowed: true, hasOrigin: true, hasJwt: true, jwtValid: false, capabilityAllowed: true, body: {},
    }).status).toBe(401);

    expect(decideAssembleAssessmentResponse({
      method: "POST", originAllowed: true, hasOrigin: true, hasJwt: true, jwtValid: true, capabilityAllowed: true, body: { template_id: "nope" },
    }).body.code).toBe("INVALID_PAYLOAD");

    expect(decideAssembleAssessmentResponse({
      method: "POST",
      originAllowed: true,
      hasOrigin: true,
      hasJwt: true,
      jwtValid: true,
      capabilityAllowed: false,
      body: { template_id: "c6c64819-d48c-4e9b-a278-dd41aaba3e76" },
    }).body.code).toBe("CAPABILITY_REQUIRED");

    expect(decideAssembleAssessmentResponse({
      method: "POST",
      originAllowed: true,
      hasOrigin: true,
      hasJwt: true,
      jwtValid: true,
      capabilityAllowed: true,
      body: { template_id: "c6c64819-d48c-4e9b-a278-dd41aaba3e76" },
      rpc: { ok: false, error: { details: "INVALID_ASSESSMENT_TEMPLATE", message: "invalid template" } },
    }).status).toBe(422);

    expect(decideAssembleAssessmentResponse({
      method: "POST",
      originAllowed: true,
      hasOrigin: true,
      hasJwt: true,
      jwtValid: true,
      capabilityAllowed: true,
      body: { template_id: "c6c64819-d48c-4e9b-a278-dd41aaba3e76" },
      rpc: { ok: false, error: { details: "ASSESSMENT_NOT_AVAILABLE", message: "not published" } },
    }).status).toBe(404);

    expect(decideAssembleAssessmentResponse({
      method: "POST",
      originAllowed: true,
      hasOrigin: true,
      hasJwt: true,
      jwtValid: true,
      capabilityAllowed: true,
      body: { template_id: "c6c64819-d48c-4e9b-a278-dd41aaba3e76" },
      rpc: { ok: false, error: { details: "INSUFFICIENT_QUESTION_INVENTORY", message: "not enough", hint: JSON.stringify({ requested_count: 6, available_count: 1 }) } },
    }).status).toBe(409);

    expect(
      extractAssessmentInventoryDetails({
        requested_count: 6,
        available_count: 2,
      })?.available_count,
    ).toBe(2);

    expect(
      messageFromAssessmentStartError(
        new ApiClientError({
          message: "short",
          status: 409,
          code: "INSUFFICIENT_QUESTION_INVENTORY",
          details: { requested_count: 6, available_count: 2 },
        }),
      ).text,
    ).toContain("only 2 are available");

    expect(decideAssembleAssessmentResponse({
      method: "POST",
      originAllowed: true,
      hasOrigin: true,
      hasJwt: true,
      jwtValid: true,
      capabilityAllowed: true,
      body: { template_id: "c6c64819-d48c-4e9b-a278-dd41aaba3e76" },
      rpc: { ok: false, error: { details: "MAX_ATTEMPTS_REACHED", message: "Maximum attempts reached" } },
    }).status).toBe(403);

    expect(decideAssembleAssessmentResponse({
      method: "POST",
      originAllowed: true,
      hasOrigin: true,
      hasJwt: true,
      jwtValid: true,
      capabilityAllowed: true,
      body: { template_id: "c6c64819-d48c-4e9b-a278-dd41aaba3e76" },
      rpc: { ok: false, failure: true },
    }).status).toBe(500);

    const success = decideAssembleAssessmentResponse({
      method: "POST",
      originAllowed: true,
      hasOrigin: true,
      hasJwt: true,
      jwtValid: true,
      capabilityAllowed: true,
      body: { template_id: "c6c64819-d48c-4e9b-a278-dd41aaba3e76" },
      rpc: { ok: true, data: { test_id: "t1", question_count: 6, duration_minutes: 18, reused: true } },
    });
    expect(success.status).toBe(200);
    expect(success.body.reused).toBe(true);
    expect(success.includeCors).toBe(true);
  });
});

describe("attempt isolation and catalog writes", () => {
  it("prevents User A from reading User B attempts or writing templates/eligibility", () => {
    const mockTests = USER_OWNED_TABLES.find((table) => table.table === "mock_tests")!;
    const responses = USER_OWNED_TABLES.find((table) => table.table === "test_responses")!;
    expect(canUserAReadUserBRow({ table: mockTests, ownerId: "user-b", viewerId: "user-a" })).toBe(false);
    expect(canUserAReadUserBRow({ table: responses, ownerId: "user-b", viewerId: "user-a" })).toBe(false);
    expect(canUserModifyExamTemplate({ viewerIsAdmin: false })).toBe(false);
    expect(canUserModifyExamTemplate({ viewerIsAdmin: true })).toBe(true);
    expect(canUserModifyQuestionEligibility({ viewerIsAdmin: false })).toBe(false);
    expect(canUserModifyQuestionEligibility({ viewerIsAdmin: true })).toBe(true);
  });

  it("allows test_responses writes only for the owner of a live attempt", () => {
    expect(
      canUserWriteTestResponse({
        viewerId: "user-a",
        responseUserId: "user-b",
        attemptUserId: "user-b",
        attemptStatus: "IN_PROGRESS",
        attemptStarted: true,
        attemptExpired: false,
      }),
    ).toBe(false);
    expect(
      canUserWriteTestResponse({
        viewerId: "user-a",
        responseUserId: "user-a",
        attemptUserId: "user-a",
        attemptStatus: "COMPLETED",
        attemptStarted: true,
        attemptExpired: false,
      }),
    ).toBe(false);
    expect(
      canUserWriteTestResponse({
        viewerId: "user-a",
        responseUserId: "user-a",
        attemptUserId: "user-a",
        attemptStatus: "IN_PROGRESS",
        attemptStarted: true,
        attemptExpired: false,
      }),
    ).toBe(true);
  });
});
