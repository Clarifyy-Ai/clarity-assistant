import { describe, expect, it } from "vitest";
import {
  BASELINE_RULE,
  COMPARISON_SOURCE_VERSION,
  CompareSessionsError,
  assertOwnedByUser,
  buildComparisonPayload,
  canEnableCompare,
  companyFromTitle,
  compareErrorUserMessage,
  durationSeconds,
  formatSessionDateTime,
  isComparableSession,
  numericDelta,
  orderBaselineAndComparison,
  questionCounts,
  resolveDisplayTimeZone,
  sessionPickerLabel,
  type ScorecardRowInput,
  type SessionAnswerRowInput,
  type SessionRowInput,
} from "@/lib/analytics/sessionComparison";

const USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function session(overrides: Partial<SessionRowInput> = {}): SessionRowInput {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    user_id: USER_A,
    title: "Mock — Acme",
    type: "mock",
    status: "completed",
    lifecycle_status: "COMPLETED",
    deleted_at: null,
    started_at: "2026-08-20T10:00:00.000Z",
    ended_at: "2026-08-20T10:18:00.000Z",
    created_at: "2026-08-20T10:00:00.000Z",
    questions_asked: 4,
    answers_generated: 3,
    avg_wpm: 120,
    filler_words: 2,
    ...overrides,
  };
}

function scorecard(overrides: Partial<ScorecardRowInput> = {}): ScorecardRowInput {
  return {
    session_id: "11111111-1111-4111-8111-111111111111",
    user_id: USER_A,
    overall_score: 70,
    communication: 72,
    technical: 68,
    problem_solving: 71,
    confidence: 65,
    details: { filler_rate: 1.2, wpm_avg: 118 },
    generated_at: "2026-08-20T10:20:00.000Z",
    ...overrides,
  };
}

describe("session comparison engine", () => {
  it("maps older session to baseline and newer to comparison", () => {
    const older = session({
      id: "11111111-1111-4111-8111-111111111111",
      started_at: "2026-08-20T10:00:00.000Z",
    });
    const newer = session({
      id: "22222222-2222-4222-8222-222222222222",
      started_at: "2026-08-22T15:30:00.000Z",
      ended_at: "2026-08-22T15:50:00.000Z",
      created_at: "2026-08-22T15:30:00.000Z",
    });
    const ordered = orderBaselineAndComparison(newer, older);
    expect(ordered.baseline.id).toBe(older.id);
    expect(ordered.comparison.id).toBe(newer.id);

    const payload = buildComparisonPayload({
      userId: USER_A,
      sessionA: newer,
      sessionB: older,
      scorecardA: scorecard({
        session_id: newer.id,
        overall_score: 82,
        communication: 80,
        details: { filler_rate: 0.4, wpm_avg: 130 },
      }),
      scorecardB: scorecard({ session_id: older.id, overall_score: 70 }),
      answers: [],
      timeZone: "UTC",
    });

    expect(payload.baseline_rule).toBe(BASELINE_RULE);
    expect(payload.source_version).toBe(COMPARISON_SOURCE_VERSION);
    expect(payload.baseline.session_id).toBe(older.id);
    expect(payload.comparison.session_id).toBe(newer.id);
    expect(payload.deltas.overall_score).toBe(12);
  });

  it("uses same-date different times for ordering", () => {
    const morning = session({
      id: "11111111-1111-4111-8111-111111111111",
      started_at: "2026-08-22T08:00:00.000Z",
    });
    const evening = session({
      id: "22222222-2222-4222-8222-222222222222",
      started_at: "2026-08-22T20:00:00.000Z",
      ended_at: "2026-08-22T20:20:00.000Z",
      created_at: "2026-08-22T20:00:00.000Z",
    });
    const ordered = orderBaselineAndComparison(evening, morning);
    expect(ordered.baseline.id).toBe(morning.id);
  });

  it("rejects duplicate session selection", () => {
    const s = session();
    expect(() =>
      buildComparisonPayload({
        userId: USER_A,
        sessionA: s,
        sessionB: s,
        scorecardA: scorecard(),
        scorecardB: scorecard(),
        answers: [],
      }),
    ).toThrow(CompareSessionsError);
    try {
      buildComparisonPayload({
        userId: USER_A,
        sessionA: s,
        sessionB: s,
        scorecardA: scorecard(),
        scorecardB: scorecard(),
        answers: [],
      });
    } catch (error) {
      expect((error as CompareSessionsError).code).toBe("DUPLICATE_SESSION");
    }
  });

  it("rejects incomplete sessions", () => {
    const completed = session();
    const incomplete = session({
      id: "22222222-2222-4222-8222-222222222222",
      status: "active",
      lifecycle_status: "IN_PROGRESS",
      ended_at: null,
    });
    expect(() =>
      buildComparisonPayload({
        userId: USER_A,
        sessionA: completed,
        sessionB: incomplete,
        scorecardA: scorecard(),
        scorecardB: scorecard({ session_id: incomplete.id }),
        answers: [],
      }),
    ).toThrow(/completed/i);
  });

  it("rejects unscored sessions", () => {
    const a = session();
    const b = session({
      id: "22222222-2222-4222-8222-222222222222",
      started_at: "2026-08-22T10:00:00.000Z",
    });
    expect(() =>
      buildComparisonPayload({
        userId: USER_A,
        sessionA: a,
        sessionB: b,
        scorecardA: scorecard(),
        scorecardB: null,
        answers: [],
      }),
    ).toThrow(/scorecard/i);
  });

  it("blocks User A from comparing User B sessions", () => {
    const own = session();
    const foreign = session({
      id: "22222222-2222-4222-8222-222222222222",
      user_id: USER_B,
    });
    expect(() => assertOwnedByUser(foreign, USER_A)).toThrow(CompareSessionsError);
    expect(() =>
      buildComparisonPayload({
        userId: USER_A,
        sessionA: own,
        sessionB: foreign,
        scorecardA: scorecard(),
        scorecardB: scorecard({ session_id: foreign.id, user_id: USER_B }),
        answers: [],
      }),
    ).toThrow(/own sessions/i);
  });

  it("does not convert missing metrics to zero", () => {
    expect(numericDelta(null, 12)).toBeNull();
    expect(numericDelta(18, null)).toBeNull();
    expect(numericDelta(undefined, 0)).toBeNull();
    expect(numericDelta(18, 12)).toBe(6);

    const older = session();
    const newer = session({
      id: "22222222-2222-4222-8222-222222222222",
      started_at: "2026-08-22T10:00:00.000Z",
      ended_at: null,
      avg_wpm: null,
    });
    const payload = buildComparisonPayload({
      userId: USER_A,
      sessionA: older,
      sessionB: newer,
      scorecardA: scorecard({ details: { filler_rate: 1.2, wpm_avg: 118 } }),
      scorecardB: scorecard({
        session_id: newer.id,
        overall_score: 74,
        communication: null,
        technical: null,
        problem_solving: null,
        confidence: null,
        details: {},
      }),
      answers: [],
      timeZone: "UTC",
    });
    expect(payload.comparison.duration_seconds).toBeNull();
    expect(payload.comparison.duration_minutes).toBeNull();
    expect(payload.deltas.duration_seconds).toBeNull();
    expect(payload.deltas.filler_rate).toBeNull();
    expect(payload.deltas.communication).toBeNull();
    expect(payload.comparison.speech.filler_rate).toBeNull();
  });

  it("calculates nonnegative duration from started_at/ended_at", () => {
    expect(durationSeconds("2026-08-20T10:00:00.000Z", "2026-08-20T10:18:00.000Z")).toBe(18 * 60);
    expect(durationSeconds("2026-08-20T10:18:00.000Z", "2026-08-20T10:00:00.000Z")).toBeNull();
    expect(durationSeconds(null, "2026-08-20T10:18:00.000Z")).toBeNull();
    expect(durationSeconds("2026-08-20T10:00:00.000Z", null)).toBeNull();
  });

  it("counts questions from session_answers, not a fabricated session_questions table", () => {
    const s = session({ questions_asked: 99, answers_generated: 99 });
    const answers: SessionAnswerRowInput[] = [
      { session_id: s.id, question: "Q1", answer: "A1" },
      { session_id: s.id, question: "Q2", answer: "  " },
      { session_id: s.id, question: "Q3", answer: null },
    ];
    expect(questionCounts(s, answers)).toEqual({
      question_count: 3,
      answered_count: 1,
      unanswered_count: 2,
    });
  });

  it("falls back to session counters when answers are missing", () => {
    const s = session({ questions_asked: 5, answers_generated: 2 });
    expect(questionCounts(s, [])).toEqual({
      question_count: 5,
      answered_count: 2,
      unanswered_count: 3,
    });
  });

  it("formats dates in the requested timezone without reversing UTC storage", () => {
    const iso = "2026-08-22T16:55:00.000Z";
    expect(formatSessionDateTime(iso, "UTC")).toMatch(/4:55/);
    expect(formatSessionDateTime(iso, "America/New_York")).toMatch(/12:55/);
    expect(formatSessionDateTime(iso, "Asia/Kolkata")).toMatch(/10:25/);
    expect(resolveDisplayTimeZone("Not/AZone")).not.toBe("Not/AZone");
  });

  it("extracts company from session title", () => {
    expect(companyFromTitle("Rehearsal — Microsoft")).toBe("Microsoft");
    expect(companyFromTitle("Mock - Google")).toBe("Google");
    expect(companyFromTitle("Practice")).toBeNull();
  });

  it("disables compare until two different comparable sessions are selected", () => {
    expect(canEnableCompare({
      sessionAId: "",
      sessionBId: "b",
      sessionAComparable: true,
      sessionBComparable: true,
    }).enabled).toBe(false);
    expect(canEnableCompare({
      sessionAId: "a",
      sessionBId: "a",
      sessionAComparable: true,
      sessionBComparable: true,
    }).reason).toMatch(/different/i);
    expect(canEnableCompare({
      sessionAId: "a",
      sessionBId: "b",
      sessionAComparable: true,
      sessionBComparable: false,
    }).enabled).toBe(false);
    expect(canEnableCompare({
      sessionAId: "a",
      sessionBId: "b",
      sessionAComparable: true,
      sessionBComparable: true,
    }).enabled).toBe(true);
  });

  it("hides PostgREST internals from user-facing errors", () => {
    expect(compareErrorUserMessage("PGRST200", "Could not find a relationship between sessions and session_questions")).not.toMatch(/PGRST|session_questions/i);
    expect(compareErrorUserMessage("SESSION_NOT_FOUND")).toMatch(/could not be found/i);
  });

  it("builds picker labels with date, type, company, and score state", () => {
    const label = sessionPickerLabel({
      dateIso: "2026-08-22T16:55:00.000Z",
      timeZone: "UTC",
      sessionType: "rehearsal",
      company: "Microsoft",
      score: 82,
      scoreStatus: "scored",
      completionState: "completed",
    });
    expect(label).toContain("Microsoft");
    expect(label).toContain("Score 82");
    expect(label).toContain("Rehearsal");
  });

  it("does not treat incomplete sessions as comparable even with a leftover scorecard", () => {
    const incomplete = session({ status: "active", lifecycle_status: "IN_PROGRESS" });
    expect(isComparableSession(incomplete, scorecard())).toBe(false);
  });
});
