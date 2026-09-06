import { describe, expect, it } from "vitest";
import { mapRowToScorecard, type ScorecardRow } from "@/types/scorecard.types";

const BASE_ROW: ScorecardRow = {
  id: "sc-1",
  user_id: "user-1",
  session_id: "sess-1",
  overall_score: 82,
  communication: 80,
  technical: 78,
  problem_solving: 76,
  confidence: 81,
  feedback: "Solid session.",
  strengths: ["Clear structure"],
  improvements: ["More examples"],
  created_at: "2026-08-01T00:00:00.000Z",
};

describe("mapRowToScorecard", () => {
  it("maps null overall_score to null instead of zero", () => {
    const scorecard = mapRowToScorecard({ ...BASE_ROW, overall_score: null });

    expect(scorecard.overall_score).toBeNull();
  });

  it("preserves numeric overall_score", () => {
    const scorecard = mapRowToScorecard(BASE_ROW);

    expect(scorecard.overall_score).toBe(82);
  });

  it("maps details fields and falls back to row columns", () => {
    const scorecard = mapRowToScorecard({
      ...BASE_ROW,
      overall_score: null,
      details: {
        confidence_score: 90,
        clarity_score: 88,
        structure_score: 86,
        relevance_score: 84,
        wpm_avg: 128,
        coach_note: "Keep drilling STAR answers.",
      },
    });

    expect(scorecard.overall_score).toBeNull();
    expect(scorecard.confidence_score).toBe(90);
    expect(scorecard.clarity_score).toBe(88);
    expect(scorecard.wpm_avg).toBe(128);
    expect(scorecard.coach_note).toBe("Keep drilling STAR answers.");
  });

  it("maps missing dimension scores to null instead of zero", () => {
    const scorecard = mapRowToScorecard({
      ...BASE_ROW,
      overall_score: null,
      communication: null,
      technical: null,
      problem_solving: null,
      confidence: null,
      details: null,
    });

    expect(scorecard.confidence_score).toBeNull();
    expect(scorecard.clarity_score).toBeNull();
    expect(scorecard.structure_score).toBeNull();
    expect(scorecard.relevance_score).toBeNull();
  });

  it("maps missing speech metrics to null instead of zero", () => {
    const scorecard = mapRowToScorecard({
      ...BASE_ROW,
      details: {
        question_scores: [],
      },
    });

    expect(scorecard.filler_count).toBeNull();
    expect(scorecard.filler_rate).toBeNull();
    expect(scorecard.wpm_avg).toBeNull();
    expect(scorecard.star_adherence).toBeNull();
  });

  it("maps durable evaluation_status columns", () => {
    const scorecard = mapRowToScorecard({
      ...BASE_ROW,
      evaluation_status: "processing",
      eligibility_reason: "EVALUATION_PROCESSING",
      question_count: 5,
      answer_count: 4,
      evaluated_answer_count: 0,
      rubric_version: "scorecard_v2",
      attempt_count: 2,
      last_error_code: null,
    });

    expect(scorecard.evaluation_status).toBe("processing");
    expect(scorecard.eligibility_reason).toBe("EVALUATION_PROCESSING");
    expect(scorecard.question_count).toBe(5);
    expect(scorecard.answer_count).toBe(4);
    expect(scorecard.evaluated_answer_count).toBe(0);
    expect(scorecard.rubric_version).toBe("scorecard_v2");
    expect(scorecard.attempt_count).toBe(2);
  });

  it("drops blank strength and improvement strings from row arrays", () => {
    const scorecard = mapRowToScorecard({
      ...BASE_ROW,
      strengths: ["", "  ", "Clear structure"],
      improvements: [null as unknown as string, "More examples"],
    });

    expect(scorecard.strengths).toEqual(["Clear structure"]);
    expect(scorecard.improvements).toEqual(["More examples"]);
  });
});
