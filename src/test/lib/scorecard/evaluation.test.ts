import { describe, expect, it } from "vitest";
import {
  associateAnswersForSession,
  describeEvaluation,
  evaluationStatusFromCounts,
  isScorableAnswerText,
  shouldRetryEvaluation,
} from "@/lib/scorecard/evaluation";
import { SKIPPED_ANSWER_SENTINEL } from "@/lib/mock/mockSessionProgress";
import { mapRowToScorecard, type ScorecardRow } from "@/types/scorecard.types";

const SESSION = "11111111-1111-4111-8111-111111111111";

function answers(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    session_id: SESSION,
    question: `Q${i + 1}`,
    answer: `Answer for question ${i + 1} with enough detail.`,
    question_index: i,
  }));
}

describe("scorecard answer association", () => {
  it("treats 0 scorable answers as not scored", () => {
    expect(associateAnswersForSession(SESSION, [])).toHaveLength(0);
    expect(
      evaluationStatusFromCounts({ scorableAnswers: 0, persistedQuestionScores: 0 }),
    ).toBe("not_scored");
  });

  it("associates 1, 5, and full-question sessions to the owning session id", () => {
    expect(associateAnswersForSession(SESSION, answers(1))).toHaveLength(1);
    expect(associateAnswersForSession(SESSION, answers(5))).toHaveLength(5);
    const full = associateAnswersForSession(SESSION, [
      ...answers(8),
      { session_id: "other", question: "Nope", answer: "Wrong session", question_index: 0 },
      { session_id: SESSION, question: "Skip", answer: SKIPPED_ANSWER_SENTINEL, question_index: 9 },
    ]);
    expect(full).toHaveLength(8);
    expect(isScorableAnswerText(SKIPPED_ANSWER_SENTINEL)).toBe(false);
  });

  it("marks evaluator timeout/failure as failed and retryable", () => {
    expect(
      evaluationStatusFromCounts({
        scorableAnswers: 5,
        persistedQuestionScores: 0,
        failed: true,
      }),
    ).toBe("failed");
    expect(shouldRetryEvaluation("failed")).toBe(true);
    expect(describeEvaluation({ status: "failed", scorableAnswers: 5, persistedQuestionScores: 0 })).toMatch(
      /Scoring failed/,
    );
    expect(
      describeEvaluation({
        status: "processing",
        scorableAnswers: 5,
        persistedQuestionScores: 0,
      }),
    ).toMatch(/still running/);
  });
});

describe("mapRowToScorecard persistence", () => {
  const base: ScorecardRow = {
    id: "sc-1",
    user_id: "user-1",
    session_id: SESSION,
    overall_score: 70,
    communication: 70,
    technical: 70,
    problem_solving: 70,
    confidence: 70,
    feedback: "ok",
    strengths: [],
    improvements: [],
    created_at: "2026-09-01T00:00:00.000Z",
  };

  it("parses details JSON strings so question scores are not 0 of 0", () => {
    const scorecard = mapRowToScorecard({
      ...base,
      details: JSON.stringify({
        question_scores: [
          {
            question_id: "q1",
            question_text: "Tell me about yourself",
            order_index: 0,
            score: 80,
            confidence_score: 0.7,
            star_used: true,
            key_strength: "Clear",
            key_weakness: "",
            coach_tip: "",
          },
        ],
      }) as unknown as ScorecardRow["details"],
    });
    expect(scorecard.question_scores).toHaveLength(1);
    expect(scorecard.question_scores[0].score).toBe(80);
  });
});
