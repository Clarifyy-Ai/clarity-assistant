import { describe, expect, it } from "vitest";
import {
  MIN_BANK_QUESTION_QUALITY,
  scorePaperQuality,
  scoreQuestionQuality,
} from "@/lib/gov-exam/validators/qualityScore";

describe("qualityScore", () => {
  it("scores from independent components (not generator self-score)", () => {
    const r = scoreQuestionQuality({
      mcq: {
        question_text: "What is 2 + 2 equal to in basic arithmetic?",
        options: ["3", "4", "5", "6"],
        correct_index: 1,
        explanation: "2+2=4",
      },
      sourceConfidence: 0.9,
    });
    expect(r.hardFail).toBe(false);
    expect(r.score).toBeGreaterThanOrEqual(MIN_BANK_QUESTION_QUALITY);
    expect(r.components.some((c) => c.id === "mcq_structure")).toBe(true);
    expect(r.components.every((c) => c.id !== "generator_self_score")).toBe(true);
  });

  it("hard-fails near-duplicates against peers", () => {
    const r = scoreQuestionQuality({
      mcq: {
        question_text: "What is the capital of India today?",
        options: ["Delhi", "Mumbai", "Kolkata", "Chennai"],
        correct_index: 0,
      },
      peers: ["What is the capital of India today?"],
    });
    expect(r.hardFail).toBe(true);
    expect(r.score).toBe(0);
    expect(r.hardFailCodes).toContain("NEAR_DUPLICATE");
  });

  it("hard-fails invalid MCQ structure", () => {
    const r = scoreQuestionQuality({
      mcq: {
        question_text: "Short",
        options: ["A", "A"],
        correct_index: 0,
      },
    });
    expect(r.hardFail).toBe(true);
    expect(r.score).toBe(0);
  });

  it("aggregates paper scores", () => {
    const paper = scorePaperQuality([
      {
        mcq: {
          question_text: "First solid question about Indian history basics?",
          options: ["A", "B", "C", "D"],
          correct_index: 0,
          explanation: "ok",
        },
        sourceConfidence: 0.8,
      },
      {
        mcq: {
          question_text: "Second solid question about Indian geography basics?",
          options: ["A", "B", "C", "D"],
          correct_index: 1,
        },
        sourceConfidence: 0.8,
      },
    ]);
    expect(paper.hardFailCount).toBe(0);
    expect(paper.score).toBeGreaterThan(50);
    expect(paper.perQuestion).toHaveLength(2);
  });

  it("includes quant template component when provided", () => {
    const r = scoreQuestionQuality({
      mcq: {
        question_text: "Compute a divided by b for the given parameters.",
        options: ["2", "3", "4", "5"],
        correct_index: 2,
      },
      quantTemplate: {
        params: { a: 12, b: 3 },
        expression: "a/b",
        options: ["2", "3", "4", "5"],
        correct_index: 2,
      },
    });
    expect(r.components.some((c) => c.id === "quant_template" && c.passed)).toBe(true);
  });
});
