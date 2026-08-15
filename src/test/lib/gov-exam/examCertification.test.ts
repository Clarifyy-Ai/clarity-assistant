import { describe, expect, it } from "vitest";
import {
  canTransitionExamPhase,
  isPauseAllowed,
  phaseFromLegacyStatus,
  resolveExamAttemptPhase,
  transitionExamPhase,
} from "@/lib/gov-exam/examAttemptFsm";
import {
  DEFAULT_MIN_COHORT_SIZE,
  RANK_UNAVAILABLE_COPY,
  percentileFromCohort,
  resolveRankPublication,
  scoreBandLabel,
} from "@/lib/gov-exam/rankAvailability";
import { assertNoAnswerKeys, hasAnswerKeys, stripAnswerKeys } from "@/lib/gov-exam/playableQuestions";
import {
  clearAttemptRecovery,
  loadAttemptRecovery,
  mergeRecoveryResponses,
  saveAttemptRecovery,
} from "@/lib/gov-exam/attemptRecovery";
import { masteryTrackingCopy } from "@/lib/gov-exam/masteryLabels";

describe("exam attempt FSM", () => {
  it("maps legacy statuses", () => {
    expect(phaseFromLegacyStatus("DRAFT")).toBe("NOT_STARTED");
    expect(phaseFromLegacyStatus("IN_PROGRESS")).toBe("ACTIVE");
    expect(phaseFromLegacyStatus("COMPLETED")).toBe("RESULT_AVAILABLE");
  });

  it("walks instructions → active → submitting → submitted → evaluating → result", () => {
    let phase = transitionExamPhase("NOT_STARTED", "INSTRUCTIONS");
    phase = transitionExamPhase(phase, "ACTIVE");
    phase = transitionExamPhase(phase, "SUBMITTING");
    phase = transitionExamPhase(phase, "SUBMITTED");
    phase = transitionExamPhase(phase, "EVALUATING");
    phase = transitionExamPhase(phase, "RESULT_AVAILABLE");
    expect(phase).toBe("RESULT_AVAILABLE");
  });

  it("supports reconnect and auto-submit", () => {
    expect(canTransitionExamPhase("ACTIVE", "CONNECTION_LOST")).toBe(true);
    expect(canTransitionExamPhase("CONNECTION_LOST", "RESTORING")).toBe(true);
    expect(canTransitionExamPhase("ACTIVE", "AUTO_SUBMITTED")).toBe(true);
  });

  it("does not allow pause unless pattern says so", () => {
    expect(isPauseAllowed(false)).toBe(false);
    expect(isPauseAllowed(true)).toBe(true);
  });

  it("prefers attempt_phase", () => {
    expect(resolveExamAttemptPhase({ attempt_phase: "INSTRUCTIONS", status: "DRAFT" })).toBe(
      "INSTRUCTIONS",
    );
  });
});

describe("honest ranking", () => {
  it("never publishes rank below min cohort", () => {
    const pub = resolveRankPublication({
      cohortSize: 12,
      percentile: 99,
      rank: 1,
      status: "final",
    });
    expect(pub.rank_status).toBe("unavailable");
    expect(pub.rank).toBeNull();
    expect(pub.percentile).toBeNull();
    expect(pub.message).toBe(RANK_UNAVAILABLE_COPY);
  });

  it("does not treat score percent as a percentile", () => {
    expect(scoreBandLabel(99)).not.toMatch(/percentile|rank|top 1%/i);
    expect(percentileFromCohort(80, Array.from({ length: 10 }, () => 50))).toBeNull();
    expect(DEFAULT_MIN_COHORT_SIZE).toBeGreaterThanOrEqual(50);
  });
});

describe("answer-key protection", () => {
  it("strips correct_answer and explanation from playable rows", () => {
    const playable = stripAnswerKeys({
      id: "q1",
      question_text: "2+2?",
      correct_answer: "4",
      explanation: "arithmetic",
      subject: "Quant",
      topic: "Arithmetic",
      question_type: "MCQ",
      options: [],
    });
    expect(hasAnswerKeys(playable as unknown as Record<string, unknown>)).toBe(false);
    expect(() => assertNoAnswerKeys(playable as unknown as Record<string, unknown>)).not.toThrow();
  });
});

describe("attempt recovery queue", () => {
  it("persists and merges later local answers", () => {
    saveAttemptRecovery({
      test_id: "t1",
      user_id: "u1",
      current_index: 2,
      updated_at: 2,
      responses: [
        {
          question_id: "q1",
          user_answer: "B",
          is_attempted: true,
          is_marked_review: false,
          time_spent_seconds: 12,
          queued_at: 2,
        },
      ],
    });
    const loaded = loadAttemptRecovery("t1", "u1");
    expect(loaded?.current_index).toBe(2);
    const merged = mergeRecoveryResponses(
      { q1: { answer: "A", state: "answered" } },
      loaded?.responses ?? [],
    );
    expect(merged.q1.answer).toBe("B");
    clearAttemptRecovery("t1", "u1");
    expect(loadAttemptRecovery("t1", "u1")).toBeNull();
  });
});

describe("syllabus tracking labels", () => {
  it("maps mastery states to spec labels", () => {
    expect(masteryTrackingCopy("not_assessed")).toBe("Not started");
    expect(masteryTrackingCopy("practicing")).toBe("Practiced");
    expect(masteryTrackingCopy("exam_ready")).toBe("Mastered");
    expect(masteryTrackingCopy("strong")).toBe("Needs revision");
  });
});
