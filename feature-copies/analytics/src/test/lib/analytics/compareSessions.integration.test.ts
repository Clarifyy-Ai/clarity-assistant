import { describe, expect, it } from "vitest";
import {
  buildComparisonPayload,
  CompareSessionsError,
  type SessionAnswerRowInput,
  type SessionRowInput,
} from "@/lib/analytics/sessionComparison";

const USER = "user-int-1";

function makeSession(
  id: string,
  startedAt: string,
  extras: Partial<SessionRowInput> = {},
): SessionRowInput {
  return {
    id,
    user_id: USER,
    title: "Mock — Clarify",
    type: "mock",
    status: "completed",
    lifecycle_status: "COMPLETED",
    deleted_at: null,
    started_at: startedAt,
    ended_at: extras.ended_at ?? "2026-08-22T10:20:00.000Z",
    created_at: startedAt,
    questions_asked: 0,
    answers_generated: 0,
    avg_wpm: null,
    filler_words: null,
    ...extras,
  };
}

const scored = {
  user_id: USER,
  overall_score: 70,
  communication: 70,
  technical: 66,
  problem_solving: 68,
  confidence: 72,
  details: { filler_rate: 0.8, wpm_avg: 125 },
};

describe("compare sessions integration scenarios", () => {
  it("1. two valid completed scored sessions", () => {
    const a = makeSession("s-a", "2026-08-20T09:00:00.000Z", {
      ended_at: "2026-08-20T09:20:00.000Z",
    });
    const b = makeSession("s-b", "2026-08-22T09:00:00.000Z", {
      ended_at: "2026-08-22T09:25:00.000Z",
    });
    const payload = buildComparisonPayload({
      userId: USER,
      sessionA: a,
      sessionB: b,
      scorecardA: { ...scored, session_id: "s-a" },
      scorecardB: { ...scored, session_id: "s-b", overall_score: 84 },
      answers: [
        { session_id: "s-a", question: "Q1", answer: "yes" },
        { session_id: "s-b", question: "Q1", answer: "yes" },
        { session_id: "s-b", question: "Q2", answer: "yes" },
      ] satisfies SessionAnswerRowInput[],
    });
    expect(payload.baseline.session_id).toBe("s-a");
    expect(payload.comparison.overall_score).toBe(84);
    expect(payload.deltas.overall_score).toBe(14);
    expect(payload.comparison.question_count).toBe(2);
    expect(payload.comparison.answered_count).toBe(2);
  });

  it("2. one incomplete session is rejected", () => {
    expect(() =>
      buildComparisonPayload({
        userId: USER,
        sessionA: makeSession("s-a", "2026-08-20T09:00:00.000Z"),
        sessionB: makeSession("s-b", "2026-08-22T09:00:00.000Z", {
          status: "active",
          ended_at: null,
        }),
        scorecardA: { ...scored, session_id: "s-a" },
        scorecardB: { ...scored, session_id: "s-b" },
        answers: [],
      }),
    ).toThrow(CompareSessionsError);
  });

  it("3-4. unscored or missing scorecard is rejected", () => {
    expect(() =>
      buildComparisonPayload({
        userId: USER,
        sessionA: makeSession("s-a", "2026-08-20T09:00:00.000Z"),
        sessionB: makeSession("s-b", "2026-08-22T09:00:00.000Z"),
        scorecardA: { ...scored, session_id: "s-a" },
        scorecardB: null,
        answers: [],
      }),
    ).toThrow(/scorecard/i);
  });

  it("5. missing session answers still compares using session counters", () => {
    const payload = buildComparisonPayload({
      userId: USER,
      sessionA: makeSession("s-a", "2026-08-20T09:00:00.000Z", {
        questions_asked: 4,
        answers_generated: 4,
        ended_at: "2026-08-20T09:20:00.000Z",
      }),
      sessionB: makeSession("s-b", "2026-08-22T09:00:00.000Z", {
        questions_asked: 5,
        answers_generated: 3,
        ended_at: "2026-08-22T09:25:00.000Z",
      }),
      scorecardA: { ...scored, session_id: "s-a" },
      scorecardB: { ...scored, session_id: "s-b", overall_score: 75 },
      answers: [],
    });
    expect(payload.baseline.question_count).toBe(4);
    expect(payload.comparison.answered_count).toBe(3);
    expect(payload.comparison.unanswered_count).toBe(2);
  });

  it("6. missing optional metrics stay unavailable", () => {
    const payload = buildComparisonPayload({
      userId: USER,
      sessionA: makeSession("s-a", "2026-08-20T09:00:00.000Z", {
        ended_at: "2026-08-20T09:20:00.000Z",
      }),
      sessionB: makeSession("s-b", "2026-08-22T09:00:00.000Z", {
        ended_at: "2026-08-22T09:25:00.000Z",
      }),
      scorecardA: {
        ...scored,
        session_id: "s-a",
        communication: null,
        details: {},
      },
      scorecardB: {
        ...scored,
        session_id: "s-b",
        overall_score: 75,
        communication: 80,
        details: { filler_rate: 0.2 },
      },
      answers: [],
    });
    expect(payload.deltas.communication).toBeNull();
    expect(payload.deltas.filler_rate).toBeNull();
  });

  it("7-8. different dates and same-day different times order correctly", () => {
    const morning = makeSession("s-m", "2026-08-22T08:00:00.000Z", {
      ended_at: "2026-08-22T08:20:00.000Z",
    });
    const evening = makeSession("s-e", "2026-08-22T19:00:00.000Z", {
      ended_at: "2026-08-22T19:20:00.000Z",
    });
    const payload = buildComparisonPayload({
      userId: USER,
      sessionA: evening,
      sessionB: morning,
      scorecardA: { ...scored, session_id: "s-e", overall_score: 90 },
      scorecardB: { ...scored, session_id: "s-m", overall_score: 60 },
      answers: [],
    });
    expect(payload.baseline.session_id).toBe("s-m");
    expect(payload.comparison.session_id).toBe("s-e");
    expect(payload.deltas.overall_score).toBe(30);
  });

  it("12. duplicate compare of the same pair is deterministic", () => {
    const args = {
      userId: USER,
      sessionA: makeSession("s-a", "2026-08-20T09:00:00.000Z", {
        ended_at: "2026-08-20T09:20:00.000Z",
      }),
      sessionB: makeSession("s-b", "2026-08-22T09:00:00.000Z", {
        ended_at: "2026-08-22T09:25:00.000Z",
      }),
      scorecardA: { ...scored, session_id: "s-a" },
      scorecardB: { ...scored, session_id: "s-b", overall_score: 80 },
      answers: [],
    };
    const first = buildComparisonPayload(args);
    const second = buildComparisonPayload(args);
    expect(second).toEqual(first);
  });
});
