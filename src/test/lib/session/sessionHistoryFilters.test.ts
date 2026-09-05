import { describe, expect, it } from "vitest";
import {
  isCompletedSessionStatus,
  parseHistorySearchParams,
  sessionMatchesTypeFilter,
  sessionTypeLabel,
  typesForChip,
  writeHistorySearchParams,
} from "@/lib/session/sessionHistoryFilters";
import {
  sessionHistoryScoreDisplay,
  sessionHistoryTypeLabel,
  sessionHistoryContextLine,
  type SessionHistoryItem,
} from "@/lib/session/sessionHistoryTypes";
import {
  isScoreEligibleStatus,
  matchesCountBucket,
} from "@/lib/session/sessionCountPolicy";

function item(partial: Partial<SessionHistoryItem>): SessionHistoryItem {
  return {
    sessionId: "1",
    sourceId: "1",
    sourceKind: "interview",
    userId: "u",
    sessionType: "mock_interview",
    title: "Mock",
    status: "completed",
    lastActivityAt: "2026-01-01T00:00:00Z",
    detailRoute: "/app/sessions/1",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

describe("session history filters", () => {
  it("maps legacy rehearsal overlay rows to Live Copilot chip", () => {
    expect(sessionMatchesTypeFilter("rehearsal", "live_copilot")).toBe(true);
    expect(sessionMatchesTypeFilter("live", "live_copilot")).toBe(true);
  });

  it("maps rehearsal to the Practice chip", () => {
    expect(sessionMatchesTypeFilter("rehearsal", "practice")).toBe(true);
    expect(sessionMatchesTypeFilter("practice", "practice")).toBe(true);
    expect(sessionMatchesTypeFilter("live", "practice")).toBe(false);
  });

  it("labels Live Copilot and Answer Bank", () => {
    expect(sessionTypeLabel({ type: "rehearsal", source_type: "answer_bank" })).toBe(
      "Answer Bank practice",
    );
    expect(sessionTypeLabel({ type: "live" })).toBe("Live Copilot");
    expect(sessionTypeLabel({ sessionSubtype: "live_copilot", sessionType: "practice_coach" })).toBe(
      "Live Copilot",
    );
  });

  it("treats completed as a History-ready status without transcript", () => {
    expect(isCompletedSessionStatus("completed")).toBe(true);
    expect(isCompletedSessionStatus("active")).toBe(false);
  });

  it("maps chips to RPC type arrays", () => {
    expect(typesForChip("all")).toBeUndefined();
    expect(typesForChip("live_copilot")).toEqual(["live_copilot"]);
    expect(typesForChip("government_exam")).toEqual(["government_exam"]);
  });

  it("round-trips URL search params", () => {
    const sp = writeHistorySearchParams(new URLSearchParams(), {
      typeChip: "assessment",
      statusChip: "completed",
      q: "UPSC",
      sort: "oldest",
    });
    const parsed = parseHistorySearchParams(sp);
    expect(parsed.typeChip).toBe("assessment");
    expect(parsed.statusChip).toBe("completed");
    expect(parsed.search).toBe("UPSC");
    expect(parsed.sort).toBe("oldest");
    expect(parsed.types).toEqual(["assessment"]);
  });
});

describe("session history score display", () => {
  it("does not convert missing scores to zero", () => {
    expect(sessionHistoryScoreDisplay(item({ score: null, resultLabel: null }))).toBe(
      "Not scored",
    );
  });

  it("prefers resultLabel and formats marks/tests", () => {
    expect(sessionHistoryScoreDisplay(item({ resultLabel: "12/100" }))).toBe("12/100");
    expect(
      sessionHistoryScoreDisplay(
        item({ score: 80, scoreUnit: "percent", resultLabel: null }),
      ),
    ).toBe("80%");
  });

  it("labels canonical types", () => {
    expect(sessionHistoryTypeLabel({ sessionType: "government_exam" })).toBe("Government Exam");
    expect(
      sessionHistoryTypeLabel({ sessionType: "practice_coach", sessionSubtype: "live_copilot" }),
    ).toBe("Live Copilot");
  });

  it("labels assessment rows with role + objective context", () => {
    expect(
      sessionHistoryContextLine(
        item({
          sessionType: "assessment",
          title: "Backend Developer Assessment",
          role: "backend-developer",
          sessionSubtype: "role_readiness",
          assessmentName: "Backend Developer Assessment",
        }),
      ),
    ).toMatch(/Backend Engineer.*role readiness/i);
  });
});

describe("session count policy", () => {
  it("keeps score eligibility separate from missing scores", () => {
    expect(isScoreEligibleStatus("completed")).toBe(true);
    expect(isScoreEligibleStatus("active")).toBe(false);
    expect(matchesCountBucket("cancelled", "history_visible")).toBe(false);
    expect(matchesCountBucket("completed", "history_visible")).toBe(true);
  });
});
