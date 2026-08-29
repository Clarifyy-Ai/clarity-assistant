import { describe, expect, it } from "vitest";
import {
  CompareSessionsError,
  assertOwnedByUser,
  buildComparisonPayload,
  type SessionRowInput,
} from "@/lib/analytics/sessionComparison";

const USER_A = "user-a-111";
const USER_B = "user-b-222";

function ownedSession(userId: string, id: string): SessionRowInput {
  return {
    id,
    user_id: userId,
    title: "Mock — Acme",
    type: "mock",
    status: "completed",
    lifecycle_status: "COMPLETED",
    deleted_at: null,
    started_at: "2026-08-20T10:00:00.000Z",
    ended_at: "2026-08-20T10:18:00.000Z",
    created_at: "2026-08-20T10:00:00.000Z",
    questions_asked: 3,
    answers_generated: 3,
    avg_wpm: 110,
    filler_words: 1,
  };
}

const score = {
  session_id: "s1",
  user_id: USER_A,
  overall_score: 70,
  communication: 70,
  technical: 70,
  problem_solving: 70,
  confidence: 70,
  details: { filler_rate: 1, wpm_avg: 110 },
};

describe("Compare Sessions ownership isolation", () => {
  it("lets User A compare two of their own sessions", () => {
    const a = ownedSession(USER_A, "s1");
    const b = ownedSession(USER_A, "s2");
    b.started_at = "2026-08-22T10:00:00.000Z";
    b.ended_at = "2026-08-22T10:20:00.000Z";
    const payload = buildComparisonPayload({
      userId: USER_A,
      sessionA: a,
      sessionB: b,
      scorecardA: { ...score, session_id: "s1" },
      scorecardB: { ...score, session_id: "s2", overall_score: 80 },
      answers: [],
    });
    expect(payload.baseline.session_id).toBe("s1");
    expect(payload.comparison.session_id).toBe("s2");
  });

  it("does not let User A compare User B sessions, scorecards, or answers", () => {
    const own = ownedSession(USER_A, "s1");
    const foreign = ownedSession(USER_B, "s-b");
    expect(() => assertOwnedByUser(foreign, USER_A)).toThrow(CompareSessionsError);
    expect(() =>
      buildComparisonPayload({
        userId: USER_A,
        sessionA: own,
        sessionB: foreign,
        scorecardA: { ...score, session_id: "s1" },
        scorecardB: { ...score, session_id: "s-b", user_id: USER_B },
        answers: [
          { session_id: "s-b", question: "secret", answer: "User B answer" },
        ],
      }),
    ).toThrow(/own sessions/i);
  });

  it("does not let User B read User A sessions", () => {
    expect(() => assertOwnedByUser(ownedSession(USER_A, "s1"), USER_B)).toThrow(
      /own sessions/i,
    );
  });
});
