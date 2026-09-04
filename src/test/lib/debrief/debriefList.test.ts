import { describe, expect, it } from "vitest";
import {
  annotateSessionsWithContentFlags,
  filterDebriefListItems,
  filterPendingDebriefSessions,
  isDebriefEligibleSession,
  mergeDebriefListItems,
} from "@/lib/debrief/debriefList";

describe("isDebriefEligibleSession", () => {
  it("requires completed status when status is provided", () => {
    expect(
      isDebriefEligibleSession({
        status: "active",
        questions_asked: 3,
        type: "mock",
      }),
    ).toBe(false);
  });

  it("rejects non-interview types", () => {
    expect(
      isDebriefEligibleSession({
        status: "completed",
        questions_asked: 2,
        type: "gov_exam",
      }),
    ).toBe(false);
  });

  it("accepts completed mock with questions asked", () => {
    expect(
      isDebriefEligibleSession({
        status: "completed",
        questions_asked: 1,
        type: "mock",
      }),
    ).toBe(true);
  });

  it("accepts completed live with overall_score even if questions_asked is 0", () => {
    expect(
      isDebriefEligibleSession({
        status: "completed",
        questions_asked: 0,
        overall_score: 72,
        type: "live",
      }),
    ).toBe(true);
  });

  it("accepts Pro-like session with answers but no score / questions_asked", () => {
    expect(
      isDebriefEligibleSession({
        status: "completed",
        questions_asked: 0,
        overall_score: null,
        type: "practice",
        hasAnswers: true,
      }),
    ).toBe(true);
  });

  it("accepts session with transcript only", () => {
    expect(
      isDebriefEligibleSession({
        status: "completed",
        questions_asked: 0,
        overall_score: null,
        type: "live",
        hasTranscript: true,
      }),
    ).toBe(true);
  });

  it("rejects zero-content completed sessions", () => {
    expect(
      isDebriefEligibleSession({
        status: "completed",
        questions_asked: 0,
        overall_score: null,
        type: "practice",
        hasAnswers: false,
        hasTranscript: false,
      }),
    ).toBe(false);
  });
  it("accepts completed rehearsal (Practice Coach) with transcript", () => {
    expect(
      isDebriefEligibleSession({
        status: "completed",
        questions_asked: 0,
        overall_score: null,
        type: "rehearsal",
        hasTranscript: true,
      }),
    ).toBe(true);
  });

  it("accepts Pro/Max mock with questions asked", () => {
    expect(
      isDebriefEligibleSession({
        status: "completed",
        questions_asked: 2,
        type: "mock",
      }),
    ).toBe(true);
  });

  it("rejects warmup sessions", () => {
    expect(
      isDebriefEligibleSession({
        status: "completed",
        questions_asked: 2,
        type: "warmup",
      }),
    ).toBe(false);
  });
});

describe("annotateSessionsWithContentFlags", () => {
  it("marks answer and transcript ids", () => {
    const annotated = annotateSessionsWithContentFlags(
      [{ id: "a" }, { id: "b" }],
      ["a"],
      ["b"],
    );
    expect(annotated[0]).toMatchObject({ id: "a", hasAnswers: true, hasTranscript: false });
    expect(annotated[1]).toMatchObject({ id: "b", hasAnswers: false, hasTranscript: true });
  });
});

describe("filterPendingDebriefSessions", () => {
  const sessions = [
    {
      id: "s1",
      type: "mock",
      title: "Backend",
      overall_score: 80,
      created_at: "2026-09-01T10:00:00Z",
      questions_asked: 5,
      status: "completed",
    },
    {
      id: "s2",
      type: "live",
      title: "Behavioral",
      overall_score: null,
      created_at: "2026-09-02T10:00:00Z",
      questions_asked: 3,
      status: "completed",
    },
    {
      id: "s3",
      type: "mock",
      title: "Empty",
      overall_score: null,
      created_at: "2026-09-03T10:00:00Z",
      questions_asked: 0,
      status: "completed",
    },
    {
      id: "s4",
      type: "practice",
      title: "Pro unscored with answers",
      overall_score: null,
      created_at: "2026-09-04T10:00:00Z",
      questions_asked: 0,
      status: "completed",
      hasAnswers: true,
    },
  ];

  it("excludes sessions that already have a debrief", () => {
    const pending = filterPendingDebriefSessions(sessions, ["s1"]);
    expect(pending.map((s) => s.id)).toEqual(["s2", "s4"]);
  });

  it("excludes zero-content sessions but keeps answer-backed Pro sessions", () => {
    const pending = filterPendingDebriefSessions(sessions, []);
    expect(pending.map((s) => s.id)).toEqual(["s1", "s2", "s4"]);
  });
});

describe("mergeDebriefListItems", () => {
  it("merges debriefs, processing, and pending sessions sorted newest first", () => {
    const items = mergeDebriefListItems({
      debriefs: [
        {
          id: "d1",
          created_at: "2026-09-01T12:00:00Z",
          overall_grade: "B+",
          priority_focus: "Structure",
          session_id: "s1",
        },
      ],
      sessionsById: {
        s1: {
          id: "s1",
          type: "mock",
          title: "Backend",
          overall_score: 80,
          created_at: "2026-09-01T10:00:00Z",
        },
        s2: {
          id: "s2",
          type: "live",
          title: "Behavioral",
          overall_score: null,
          created_at: "2026-09-02T10:00:00Z",
        },
      },
      pendingSessions: [
        {
          id: "s2",
          type: "live",
          title: "Behavioral",
          overall_score: null,
          created_at: "2026-09-02T10:00:00Z",
          questions_asked: 3,
          status: "completed",
        },
        {
          id: "s3",
          type: "practice",
          title: "Also pending",
          overall_score: null,
          created_at: "2026-09-03T10:00:00Z",
          hasAnswers: true,
          status: "completed",
        },
      ],
      processingJobs: [
        {
          jobId: "j1",
          sessionId: "s2",
          status: "processing",
          updatedAt: "2026-09-02T11:00:00Z",
        },
      ],
    });

    expect(items.map((i) => i.kind)).toEqual(["pending", "processing", "debrief"]);
    expect(items.find((i) => i.kind === "pending")?.id).toBe("pending:s3");
  });

  it("surfaces failed jobs and prefers them over pending for the same session", () => {
    const items = mergeDebriefListItems({
      debriefs: [],
      sessionsById: {
        r1: {
          id: "r1",
          type: "rehearsal",
          title: "Practice Coach",
          overall_score: 70,
          created_at: "2026-09-03T10:00:00Z",
        },
      },
      pendingSessions: [
        {
          id: "r1",
          type: "rehearsal",
          title: "Practice Coach",
          overall_score: 70,
          created_at: "2026-09-03T10:00:00Z",
          hasTranscript: true,
          status: "completed",
        },
      ],
      failedJobs: [
        {
          jobId: "jf1",
          sessionId: "r1",
          updatedAt: "2026-09-03T11:00:00Z",
          errorCode: "AI_TIMEOUT",
          errorMessage: "Timed out",
        },
      ],
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe("failed");
  });

  it("prefers processing over failed for the same session", () => {
    const items = mergeDebriefListItems({
      debriefs: [],
      sessionsById: {},
      pendingSessions: [],
      processingJobs: [
        {
          jobId: "jp1",
          sessionId: "r1",
          status: "queued",
          updatedAt: "2026-09-03T12:00:00Z",
        },
      ],
      failedJobs: [
        {
          jobId: "jf1",
          sessionId: "r1",
          updatedAt: "2026-09-03T11:00:00Z",
        },
      ],
    });

    expect(items.map((i) => i.kind)).toEqual(["processing"]);
  });
});

describe("filterDebriefListItems", () => {
  const items = mergeDebriefListItems({
    debriefs: [
      {
        id: "d1",
        created_at: "2026-09-01T12:00:00Z",
        overall_grade: "A-",
        priority_focus: "Metrics",
        session_id: "s1",
      },
    ],
    sessionsById: {
      s1: {
        id: "s1",
        type: "mock",
        title: "System Design",
        overall_score: 90,
        created_at: "2026-09-01T10:00:00Z",
      },
    },
    pendingSessions: [
      {
        id: "s2",
        type: "live",
        title: "Behavioral",
        overall_score: null,
        created_at: "2026-09-02T10:00:00Z",
      },
    ],
  });

  it("matches pending by title", () => {
    expect(filterDebriefListItems(items, "behavioral")).toHaveLength(1);
    expect(filterDebriefListItems(items, "behavioral")[0]?.kind).toBe("pending");
  });

  it("matches saved debrief by grade", () => {
    expect(filterDebriefListItems(items, "a-")).toHaveLength(1);
    expect(filterDebriefListItems(items, "a-")[0]?.kind).toBe("debrief");
  });

  it("returns all when search empty", () => {
    expect(filterDebriefListItems(items, "  ")).toHaveLength(2);
  });
});
