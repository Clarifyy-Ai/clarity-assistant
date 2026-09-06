import { describe, expect, it } from "vitest";
import { formatSessionHistoryForAI } from "@/lib/ai/userApplicationContext";
import type { SessionHistoryItem } from "@/lib/session/sessionHistoryTypes";

function item(partial: Partial<SessionHistoryItem>): SessionHistoryItem {
  return {
    sessionId: "s1",
    sourceId: "s1",
    sourceKind: "interview",
    userId: "u1",
    sessionType: "mock_interview",
    title: "Mock Interview",
    status: "completed",
    lastActivityAt: "2026-09-01T10:00:00.000Z",
    detailRoute: "/app/mock",
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    ...partial,
  };
}

describe("formatSessionHistoryForAI", () => {
  it("builds history block and summaries from practice sessions", () => {
    const result = formatSessionHistoryForAI([
      item({
        role: "Backend Engineer",
        company: "Acme",
        score: 72,
      }),
      item({
        sessionType: "government_exam",
        title: "UPSC",
        score: 55,
      }),
    ]);

    expect(result.block).toMatch(/Recent practice history/i);
    expect(result.block).toMatch(/Backend Engineer/);
    expect(result.snippets).toHaveLength(1);
    expect(result.recentAnswerSummaries[0]?.question).toMatch(/Mock Interview/i);
  });
});
