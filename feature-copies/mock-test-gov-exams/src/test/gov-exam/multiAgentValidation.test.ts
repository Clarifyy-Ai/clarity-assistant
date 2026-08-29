import { describe, expect, it } from "vitest";
import {
  ENABLE_LLM_GENERATOR,
  runMultiAgentValidation,
  toReviewQueueItem,
  validatePaperSimilarity,
} from "@/lib/gov-exam/multiAgentValidation";

describe("multiAgentValidation", () => {
  it("keeps LLM generator disabled by default", () => {
    expect(ENABLE_LLM_GENERATOR).toBe(false);
    const r = runMultiAgentValidation({
      mcq: {
        question_text: "Which planet is known as the Red Planet in our solar system?",
        options: ["Earth", "Mars", "Venus", "Jupiter"],
        correct_index: 1,
      },
      sourceClass: "bank",
      sourceConfidence: 0.85,
      language: "en",
    });
    expect(r.llmGeneratorUsed).toBe(false);
    const gen = r.reports.find((x) => x.role === "generator");
    expect(gen?.verdict).toBe("skip");
    expect(gen?.codes).toContain("LLM_GENERATOR_DISABLED");
    expect(r.publishable).toBe(true);
  });

  it("runs deterministic solver/critic/similarity/language roles", () => {
    const r = runMultiAgentValidation({
      mcq: {
        question_text: "What is twelve divided by three in whole numbers?",
        options: ["2", "3", "4", "5"],
        correct_index: 2,
      },
      quantTemplate: {
        params: { a: 12, b: 3 },
        expression: "a/b",
        options: ["2", "3", "4", "5"],
        correct_index: 2,
      },
      language: "en",
    });
    const roles = r.reports.map((x) => x.role);
    expect(roles).toEqual([
      "generator",
      "solver",
      "critic",
      "source_verifier",
      "pattern_validator",
      "similarity",
      "language",
    ]);
    expect(r.reports.find((x) => x.role === "solver")?.verdict).toBe("pass");
  });

  it("stores disagreements for review queue when generator claim mismatches", () => {
    const r = runMultiAgentValidation({
      mcq: {
        question_text: "What is twelve divided by three in whole numbers?",
        options: ["2", "3", "4", "5"],
        correct_index: 2,
      },
      quantTemplate: {
        params: { a: 12, b: 3 },
        expression: "a/b",
        options: ["2", "3", "4", "5"],
        correct_index: 2,
      },
      generatorClaimedIndex: 0,
    });
    expect(r.disagreements.length).toBeGreaterThan(0);
    expect(r.publishable).toBe(false);
    const item = toReviewQueueItem(
      {
        mcq: {
          question_text: "What is twelve divided by three in whole numbers?",
          options: ["2", "3", "4", "5"],
          correct_index: 2,
        },
        generatorClaimedIndex: 0,
      },
      r,
    );
    expect(item).not.toBeNull();
    expect(item?.disagreements.length).toBeGreaterThan(0);
  });

  it("fails similarity agent on near-dupes", () => {
    const stem = "Identify the capital city of France in Europe.";
    const r = runMultiAgentValidation({
      mcq: {
        question_text: stem,
        options: ["Paris", "Lyon", "Nice", "Lille"],
        correct_index: 0,
      },
      peers: [stem],
    });
    expect(r.reports.find((x) => x.role === "similarity")?.verdict).toBe("fail");
    expect(r.publishable).toBe(false);
  });

  it("validates paper-level similarity", () => {
    expect(
      validatePaperSimilarity([
        "Unique question alpha about rivers",
        "Unique question beta about mountains",
      ]).ok,
    ).toBe(true);
    expect(
      validatePaperSimilarity([
        "Same question text about rivers here",
        "Same question text about rivers here",
      ]).ok,
    ).toBe(false);
  });
});
