import { describe, expect, it } from "vitest";
import {
  applyWeakTopicBoost,
  allocateQuestionCounts,
  blueprintForRole,
  blueprintsDifferMaterially,
  ROLE_BLUEPRINTS,
} from "@/lib/assessments/blueprint";
import { normalizeRoleInput, templateSlugForRole } from "@/lib/assessments/roleNormalize";
import {
  evaluateAssessmentReadiness,
  buildWhySelected,
  resolveBlueprintForSetup,
} from "@/lib/assessments/assessmentContext";
import {
  selectDeterministicQuestions,
  scoreCandidate,
  stableHash,
  publicSelectionLedger,
} from "@/lib/assessments/selectionScore";

describe("assessment personalization — role blueprints", () => {
  it("Backend and Data Analyst receive materially different blueprints", () => {
    const backend = blueprintForRole("backend-developer");
    const analyst = blueprintForRole("data-analyst");
    expect(blueprintsDifferMaterially(backend, analyst)).toBe(true);
    expect(backend.backend ?? 0).toBeGreaterThan(analyst.backend ?? 0);
    expect(analyst.sql).toBeGreaterThan(backend.sql);
    expect(analyst.aptitude ?? 0).toBeGreaterThan(backend.aptitude ?? 0);
  });

  it("why_selected differs between Backend and Data Analyst", () => {
    const backendWhy = buildWhySelected({
      roleLabel: "Backend Engineer",
      objective: "role_readiness",
      boostedCategories: ["sql"],
      personalized: true,
    });
    const analystWhy = buildWhySelected({
      roleLabel: "Data Analyst",
      objective: "role_readiness",
      boostedCategories: ["sql"],
      personalized: true,
    });
    expect(backendWhy).toMatch(/Backend Engineer/);
    expect(analystWhy).toMatch(/Data Analyst/);
    expect(backendWhy).not.toBe(analystWhy);
  });

  it("normalizes role aliases to canonical slugs", () => {
    expect(normalizeRoleInput("Backend Engineer")?.slug).toBe("backend-developer");
    expect(normalizeRoleInput("Server-Side Engineer")?.slug).toBe("backend-developer");
    expect(normalizeRoleInput("Data Analyst")?.slug).toBe("data-analyst");
    expect(normalizeRoleInput("QA Engineer")?.slug).toBe("qa-engineer");
  });

  it("maps full-stack and qa to seeded template slugs", () => {
    expect(templateSlugForRole("full-stack-developer")).toBe("frontend-developer");
    expect(templateSlugForRole("qa-engineer")).toBe("qa-engineer");
    expect(templateSlugForRole("backend-developer")).toBe("backend-developer");
  });
});

describe("assessment personalization — readiness", () => {
  it("blocks personalized start when profile context is insufficient", () => {
    const r = evaluateAssessmentReadiness({ force_general: false });
    expect(r.ready).toBe(false);
    expect(r.reasonCode).toBe("PROFILE_CONTEXT_INSUFFICIENT");
    expect(r.message).toMatch(/little more information/i);
    expect(r.message).toMatch(/Missing:/i);
    expect(r.missingFields.length).toBeGreaterThan(0);
  });

  it("does not silently treat unsupported roles as general personalized assessments", () => {
    const r = evaluateAssessmentReadiness({
      target_role: "Product Manager",
      experience_level: "mid",
      assessment_objective: "role_readiness",
      difficulty: "medium",
      question_count: 6,
    });
    expect(r.ready).toBe(false);
    expect(r.reasonCode).toBe("ROLE_NOT_SUPPORTED");
    expect(r.message).toMatch(/not supported|general assessment/i);
  });

  it("allows general assessment only with force_general", () => {
    const blocked = evaluateAssessmentReadiness({
      question_count: 6,
      difficulty: "medium",
      force_general: false,
    });
    expect(blocked.ready).toBe(false);

    const ok = evaluateAssessmentReadiness({
      question_count: 6,
      difficulty: "medium",
      force_general: true,
    });
    expect(ok.ready).toBe(true);
    expect(ok.personalized).toBe(false);
    expect(ok.role_slug).toBe("general-aptitude");
  });

  it("ready when required personalized fields are present", () => {
    const r = evaluateAssessmentReadiness({
      target_role: "Backend Engineer",
      role_slug: "backend-developer",
      experience_level: "mid",
      assessment_objective: "role_readiness",
      difficulty: "medium",
      question_count: 6,
    });
    expect(r.ready).toBe(true);
    expect(r.personalized).toBe(true);
    expect(r.role_slug).toBe("backend-developer");
  });
});

describe("assessment personalization — weak boost + selection", () => {
  it("applies bounded weak-topic boost without dominating", () => {
    const base = ROLE_BLUEPRINTS["backend-developer"];
    const { weights, boostedCategories } = applyWeakTopicBoost(base, ["sql joins"]);
    expect(boostedCategories).toContain("sql");
    expect(weights.sql).toBeLessThanOrEqual(40);
    expect(Object.values(weights).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 0);
  });

  it("same seed produces the same question set", () => {
    const candidates = [
      { id: "11111111-1111-4111-8111-111111111111", category: "backend", difficulty: "medium", eligible_roles: ["backend-developer"], review_status: "approved", is_verified: true },
      { id: "22222222-2222-4222-8222-222222222222", category: "sql", difficulty: "medium", eligible_roles: ["backend-developer"], review_status: "approved", is_verified: true },
      { id: "33333333-3333-4333-8333-333333333333", category: "backend", difficulty: "hard", eligible_roles: ["backend-developer"], review_status: "approved", is_verified: true },
      { id: "44444444-4444-4444-8444-444444444444", category: "sql", difficulty: "easy", eligible_roles: ["data-analyst"], review_status: "approved", is_verified: true },
      { id: "55555555-5555-4555-8555-555555555555", category: "java", difficulty: "medium", eligible_roles: ["backend-developer"], review_status: "approved", is_verified: true },
      { id: "66666666-6666-4666-8666-666666666666", category: "devops", difficulty: "medium", eligible_roles: ["backend-developer"], review_status: "approved", is_verified: true },
    ];
    const quotas = allocateQuestionCounts(4, blueprintForRole("backend-developer"));
    const a = selectDeterministicQuestions(candidates, quotas, {
      roleSlug: "backend-developer",
      selectionSeed: "seed-fixed-1",
      difficulty: "medium",
    });
    const b = selectDeterministicQuestions(candidates, quotas, {
      roleSlug: "backend-developer",
      selectionSeed: "seed-fixed-1",
      difficulty: "medium",
    });
    expect(a.questionIds).toEqual(b.questionIds);
    expect(a.ledger.length).toBe(a.questionIds.length);
  });

  it("changing role changes selection priorities", () => {
    const q = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      category: "sql",
      difficulty: "medium",
      eligible_roles: ["backend-developer", "data-analyst"],
      review_status: "approved" as const,
      is_verified: true,
    };
    const backend = scoreCandidate(q, {
      roleSlug: "backend-developer",
      targetCategories: ["backend", "sql"],
      roleLabel: "Backend Engineer",
    });
    const analyst = scoreCandidate(q, {
      roleSlug: "data-analyst",
      targetCategories: ["sql", "aptitude"],
      roleLabel: "Data Analyst",
    });
    expect(backend.selectedBecause.some((r) => /Backend|sql/i.test(r))).toBe(true);
    expect(analyst.selectedBecause.some((r) => /Data Analyst|sql/i.test(r))).toBe(true);
    expect(publicSelectionLedger([backend])[0]).not.toHaveProperty("score");
  });

  it("stableHash is deterministic", () => {
    expect(stableHash("abc")).toBe(stableHash("abc"));
    expect(stableHash("abc")).not.toBe(stableHash("abd"));
  });

  it("why_selected explains personalization", () => {
    const text = buildWhySelected({
      roleLabel: "Backend Engineer",
      objective: "weak_area_improvement",
      boostedCategories: ["sql"],
      personalized: true,
    });
    expect(text).toMatch(/Backend Engineer/);
    expect(text).toMatch(/sql/i);
  });

  it("resolveBlueprintForSetup uses weak boost for role_readiness", () => {
    const r = resolveBlueprintForSetup("data-analyst", null, ["sql"], "role_readiness");
    expect(r.boostedCategories).toContain("sql");
    expect(r.policyVersion).toBe("assessment-blueprint-v1");
  });
});
