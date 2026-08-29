import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  enqueueFallbacks,
  simulateHybridExecution,
  type HybridRouteSource,
} from "./hybridEnqueueFallbacks";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const functionsDir = path.join(root, "supabase/functions");

function readFunction(name: string): string {
  return fs.readFileSync(path.join(functionsDir, name, "index.ts"), "utf8");
}

/** Mirrors MATRIX gap_analysis — deterministic → python → ai */
const gapAnalysisRoute = {
  preferredOrder: ["deterministic", "python", "ai"] as HybridRouteSource[],
  pythonFallbackOnAiFailure: true,
  aiFallbackOnPythonFailure: false,
  canCompleteDeterministically: true,
  canCompleteWithDatabase: true,
  canUseAI: true,
  canUsePython: true,
};

/** Mirrors MATRIX company_research — database → python → ai */
const companyResearchRoute = {
  preferredOrder: ["database", "python", "ai"] as HybridRouteSource[],
  pythonFallbackOnAiFailure: true,
  aiFallbackOnPythonFailure: true,
  canCompleteDeterministically: true,
  canCompleteWithDatabase: true,
  canUseAI: true,
  canUsePython: true,
};

/** Mirrors MATRIX mock_question_generation — database → ai → python */
const mockQuestionRoute = {
  preferredOrder: ["database", "ai", "python"] as HybridRouteSource[],
  pythonFallbackOnAiFailure: true,
  aiFallbackOnPythonFailure: true,
  canCompleteDeterministically: false,
  canCompleteWithDatabase: true,
  canUseAI: true,
  canUsePython: true,
};

type GapResult = {
  match_score: number;
  matching_skills: string[];
  missing_skills: string[];
  parse_failed?: boolean;
};

describe("gap-company-mock Edge hybrid contracts", () => {
  it("gap-analysis uses executeHybridOperation with gap_analysis op", () => {
    const source = readFunction("gap-analysis");
    expect(source).toContain("executeHybridOperation");
    expect(source).toMatch(/operation:\s*"gap_analysis"/);
    expect(source).toContain("runDeterministic");
    expect(source).toContain("runPython");
    expect(source).toContain("runAi");
    expect(source).toMatch(/parse_failed.*throw|throw.*parse failed/i);
  });

  it("company-research does not call AI inside runPython", () => {
    const source = readFunction("company-research");
    expect(source).toContain("executeHybridOperation");
    expect(source).toMatch(/operation:\s*"company_research"/);
    expect(source).toContain('operation: "company_normalize"');
    const runPythonBlock = source.slice(
      source.indexOf("runPython:"),
      source.indexOf("runDeterministic:"),
    );
    expect(runPythonBlock).not.toContain("generateBriefWithAi");
    expect(source).toContain("runAi:");
    expect(source).toContain("generateBriefWithAi");
  });

  it("generate-questions uses database → ai → python bank chain", () => {
    const source = readFunction("generate-questions");
    expect(source).toContain("executeHybridOperation");
    expect(source).toMatch(/operation:\s*"mock_question_generation"/);
    expect(source).toContain("mock_question_generation");
    expect(source).toContain("mock_question_validate");
    expect(source).toContain("fallbackToCleanQuestions");
    expect(source).toContain("runDatabase:");
    expect(source).toContain("runAi:");
    expect(source).toContain("runPython:");
  });
});

describe("gap_analysis hybrid fallback simulation", () => {
  it("deterministic skill overlap succeeds without AI (single credit deduct)", async () => {
    const result = await simulateHybridExecution<GapResult>({
      route: gapAnalysisRoute,
      creditCost: 10,
      runners: {
        deterministic: async () => ({
          match_score: 60,
          matching_skills: ["python"],
          missing_skills: ["aws"],
          parse_failed: false,
        }),
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("deterministic");
      expect(result.data.match_score).toBe(60);
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(0);
    }
  });

  it("AI parse_failed validation → deterministic fallback, no fake gap report", async () => {
    const result = await simulateHybridExecution<GapResult>({
      route: gapAnalysisRoute,
      creditCost: 10,
      runners: {
        deterministic: async () => null,
        python: async () => null,
        ai: async () => ({
          match_score: 0,
          matching_skills: [],
          missing_skills: [],
          parse_failed: true,
        }),
      },
      validate: async (data, source) => {
        if (data.parse_failed && source === "ai") {
          throw new Error("Gap analysis parse failed");
        }
        return data;
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refundCount).toBe(1);
      expect(result.deductCount).toBe(1);
    }
  });

  it("AI failure enqueues python then deterministic per MATRIX", () => {
    const remaining: HybridRouteSource[] = [];
    const queued = new Set<HybridRouteSource>(["ai"]);
    enqueueFallbacks("ai", gapAnalysisRoute, remaining, queued);
    expect(remaining).toEqual(["python", "deterministic", "database"]);
  });

  it("AI unavailable → python gap succeeds with one deduct", async () => {
    const result = await simulateHybridExecution<GapResult>({
      route: { ...gapAnalysisRoute, canUseAI: false },
      creditCost: 10,
      runners: {
        deterministic: async () => null,
        python: async () => ({
          match_score: 50,
          matching_skills: ["sql"],
          missing_skills: ["kubernetes"],
        }),
        ai: async () => {
          throw new Error("should not run when canUseAI=false");
        },
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("python");
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(0);
    }
  });
});

describe("company_research hybrid fallback simulation", () => {
  it("python normalize miss → AI brief succeeds", async () => {
    const result = await simulateHybridExecution({
      route: companyResearchRoute,
      creditCost: 5,
      runners: {
        database: async () => null,
        python: async () => null,
        ai: async () => ({
          persisted: true,
          brief: { overview: "Acme builds cloud tooling for enterprise teams worldwide." },
        }),
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("ai");
      expect(result.deductCount).toBe(1);
    }
  });
});

describe("mock_question_generation hybrid fallback simulation", () => {
  it("AI failure → python bank succeeds with single deduct", async () => {
    const result = await simulateHybridExecution({
      route: { ...mockQuestionRoute, preferredOrder: ["ai"] },
      creditCost: 3,
      runners: {
        ai: async () => {
          throw new Error("provider down");
        },
        python: async () => ({
          questions: [{ question_text: "Tell me about a challenge.", order: 1 }],
          count: 1,
        }),
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("fallback");
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(0);
      expect(result.fallbackReason).toMatch(/ai_failed/);
    }
  });

  it("database bank used before AI when sufficient", async () => {
    const result = await simulateHybridExecution({
      route: mockQuestionRoute,
      creditCost: 3,
      runners: {
        database: async () => ({
          questions: [{ question_text: "Why this company?", order: 1 }],
          count: 1,
          source: "fallback",
        }),
        ai: async () => {
          throw new Error("should not run when bank hits");
        },
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("database");
      expect(result.deductCount).toBe(1);
    }
  });
});
