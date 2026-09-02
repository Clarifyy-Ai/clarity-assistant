import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  deriveMockTestMetrics,
  computeMockTestAccuracy,
  computeMockTestAttemptPercentage,
  scoreMockTest,
  type MockTestAnswerOutcome,
} from "@/lib/gov-exam/mockTestScoring";
import { applyBatchToMastery } from "@/lib/gov-exam/masteryEngine";

function outcomes(
  total: number,
  attempted: number,
  correct: number,
): MockTestAnswerOutcome[] {
  const incorrect = attempted - correct;
  const unanswered = total - attempted;
  return [
    ...Array.from({ length: correct }, () => "correct" as const),
    ...Array.from({ length: incorrect }, () => "wrong" as const),
    ...Array.from({ length: unanswered }, () => "unanswered" as const),
  ];
}

describe("mockTestScoring — TC-REG-007 triage matrix", () => {
  const oneMark = { marksPositive: 1, marksNegative: 0.25 };

  it("25 questions, 20 attempted, 3 correct → 15% accuracy, 80% attempted", () => {
    const result = deriveMockTestMetrics({
      outcomes: outcomes(25, 20, 3),
      config: oneMark,
    });

    expect(result.attempted).toBe(20);
    expect(result.correct).toBe(3);
    expect(result.incorrect).toBe(17);
    expect(result.unanswered).toBe(5);
    expect(result.accuracy).toBe(15);
    expect(result.attemptPercentage).toBe(80);
  });

  it("negative marking can drive raw score below zero; UI clamps display to 0/25", () => {
    const result = deriveMockTestMetrics({
      outcomes: outcomes(25, 20, 3),
      config: oneMark,
    });

    // 3×1 − 17×0.25 = −1.25
    expect(result.rawTotalScore).toBe(-1.25);
    expect(result.maxScore).toBe(25);
    expect(result.displayTotalScore).toBe(0);
  });

  it("documents the full TC-REG-007 KPI tuple as internally consistent", () => {
    const result = deriveMockTestMetrics({
      outcomes: outcomes(25, 20, 3),
      config: oneMark,
    });

    expect(`${result.displayTotalScore}/${result.maxScore}`).toBe("0/25");
    expect(`${result.accuracy}%`).toBe("15%");
    expect(`${result.attemptPercentage}%`).toBe("80%");
  });

  it("all correct on full attempt yields perfect score", () => {
    const result = deriveMockTestMetrics({
      outcomes: outcomes(25, 25, 25),
      config: oneMark,
    });

    expect(result.rawTotalScore).toBe(25);
    expect(result.displayTotalScore).toBe(25);
    expect(result.accuracy).toBe(100);
    expect(result.attemptPercentage).toBe(100);
  });

  it("unanswered questions do not reduce score", () => {
    const result = deriveMockTestMetrics({
      outcomes: outcomes(25, 0, 0),
      config: oneMark,
    });

    expect(result.rawTotalScore).toBe(0);
    expect(result.accuracy).toBe(0);
    expect(result.attemptPercentage).toBe(0);
  });

  it("matches two-mark / half-mark negative pattern from gov E2E fixture", () => {
    const result = deriveMockTestMetrics({
      outcomes: ["correct", "correct", "wrong"],
      config: { marksPositive: 2, marksNegative: 0.5 },
    });

    expect(result.rawTotalScore).toBe(3.5);
    expect(result.displayTotalScore).toBe(3.5);
    expect(result.accuracy).toBe(67);
    expect(result.attemptPercentage).toBe(100);
  });
});

describe("mockTestScoring — submit-test parity", () => {
  it("submit-test delegates all per-question and aggregate scoring", () => {
    const root = path.resolve(__dirname, "../../..");
    const src = fs.readFileSync(
      path.join(root, "supabase/functions/submit-test/index.ts"),
      "utf8",
    );

    expect(src).toContain('from "../_shared/mockTestScoring.ts"');
    expect(src).toContain("scoreMockTest(");
    expect(src).not.toContain("function scoreQuestion(");
  });

  it("deriveMockTestMetrics matches submit-test KPI formulas for uniform marks", () => {
    const outcomes: MockTestAnswerOutcome[] = [
      ...Array.from({ length: 3 }, () => "correct" as const),
      ...Array.from({ length: 17 }, () => "wrong" as const),
      ...Array.from({ length: 5 }, () => "unanswered" as const),
    ];

    const result = deriveMockTestMetrics({
      outcomes,
      config: { marksPositive: 1, marksNegative: 0.25 },
    });

    expect(result.attempted).toBe(20);
    expect(result.correct).toBe(3);
    expect(computeMockTestAccuracy(result.correct, result.attempted)).toBe(15);
    expect(computeMockTestAttemptPercentage(result.attempted, outcomes.length)).toBe(80);
    expect(result.rawTotalScore).toBe(-1.25);
    expect(result.displayTotalScore).toBe(0);
  });
});

describe("authoritative scoring boundaries", () => {
  const questions = [
    {
      id: "q1", questionType: "NUMERICAL", correctAnswer: "0.3",
      marksPositive: 2, marksNegative: 0.5, subject: "Math", topic: "Numbers",
    },
    {
      id: "q2", questionType: "MULTI_SELECT", correctAnswer: ["A", "C"],
      marksPositive: 3, marksNegative: 1, subject: "Math", topic: "Sets",
    },
    {
      id: "q3", questionType: "MCQ", correctAnswer: "B",
      marksPositive: 1, marksNegative: 0.25, subject: "GK", topic: "History",
    },
  ];

  it("scores numerical tolerance, order-independent multi-select, and unanswered", () => {
    const result = scoreMockTest(questions, [
      { questionId: "q1", userAnswer: 0.3000001, isAttempted: true, timeSpentSeconds: 10 },
      { questionId: "q2", userAnswer: ["c", "a"], isAttempted: true, timeSpentSeconds: 20 },
      { questionId: "q3", userAnswer: "", isAttempted: true, timeSpentSeconds: 0 },
    ]);
    expect(result.perQuestion.map((row) => row.outcome)).toEqual([
      "correct", "correct", "unanswered",
    ]);
    expect(result).toMatchObject({
      correct: 2, incorrect: 0, unanswered: 1, attempted: 2,
      rawTotalScore: 5, maxScore: 6, accuracy: 100, attemptPercentage: 67,
      positiveMarks: 5, negativeMarks: 0,
    });
    expect(result.topicBreakdown.Numbers.accuracy).toBe(100);
    expect(result.topicBreakdown.History.attempted).toBe(0);
  });

  it("applies per-question negative marks and deterministic percentage rounding", () => {
    const result = scoreMockTest(questions, [
      { questionId: "q1", userAnswer: "9", isAttempted: true },
      { questionId: "q2", userAnswer: ["A"], isAttempted: true },
      { questionId: "q3", userAnswer: "B", isAttempted: true },
    ]);
    expect(result.rawTotalScore).toBe(-0.5);
    expect(result.displayTotalScore).toBe(0);
    expect(result.negativeMarks).toBe(1.5);
    expect(result.percentage).toBe(-8.33);
    expect(result.subjectBreakdown.Math).toMatchObject({
      correct: 0, wrong: 2, attempted: 2, marks: -1.5,
    });
  });

  it("feeds the same canonical outcomes into deterministic topic mastery", () => {
    const result = scoreMockTest(questions, [
      { questionId: "q1", userAnswer: "0.3", isAttempted: true },
      { questionId: "q2", userAnswer: ["A"], isAttempted: true },
    ]);
    const mastery = applyBatchToMastery(
      { topic: "Math", mastery_score: 0.5, state: "developing", evidence_count: 3 },
      result.perQuestion
        .filter((row) => row.subject === "Math")
        .map((row) => ({
          correct: row.isCorrect,
          attempted: row.isAttempted,
          difficulty: row.difficulty,
        })),
    );
    expect(mastery.evidence_count).toBe(5);
    expect(mastery.mastery_score).toBeCloseTo(0.5, 5);
  });
});
