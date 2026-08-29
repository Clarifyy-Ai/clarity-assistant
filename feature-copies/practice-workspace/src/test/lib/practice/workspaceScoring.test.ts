import { describe, expect, it } from "vitest";
import { scorePracticeAnswers } from "@/lib/practice/workspaceScoring";

describe("practice workspace scoring", () => {
  it("does not award a positive score to non-responsive answers", () => {
    const score = scorePracticeAnswers([
      { question: "Tell me about a challenge", answer: "idk" },
      { question: "How do you work with others?", answer: "n/a" },
    ], "Behavioral");

    expect(score.overall).toBe(0);
    expect(score.answerQuality).toBe(0);
  });

  it("penalizes a skipped/non-responsive answer without zeroing a real answer", () => {
    const score = scorePracticeAnswers([
      { question: "Tell me about a challenge", answer: "idk" },
      { question: "How do you work with others?", answer: "At my last role I led a cross-functional team, resolved a delivery risk, and improved release reliability with a documented plan." },
    ], "Behavioral");

    expect(score.overall).toBeGreaterThan(0);
    expect(score.overall).toBeLessThan(50);
  });
});
