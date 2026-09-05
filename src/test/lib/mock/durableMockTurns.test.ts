import { describe, expect, it } from "vitest";
import { buildDurableTurnsFromProgress } from "@/lib/mock/durableMockTurns";

describe("durableMockTurns answer_source", () => {
  it("preserves typed, mixed, and spoken sources", () => {
    const turns = buildDurableTurnsFromProgress({
      sessionId: "s1",
      questions: [{ id: "q1", question_text: "Tell me about X" }],
      answers: [
        {
          question_id: "q1",
          question_text: "Tell me about X",
          answer_text: "typed only",
          skipped: false,
          question_index: 0,
          timestamp: "2026-09-05T00:00:00Z",
          answer_source: "typed",
        },
        {
          question_id: "q2",
          question_text: "Q2",
          answer_text: "both",
          skipped: false,
          question_index: 1,
          timestamp: "2026-09-05T00:01:00Z",
          answer_source: "mixed",
        },
      ],
    });
    expect(turns[0]?.answer_source).toBe("typed");
    expect(turns[1]?.answer_source).toBe("mixed");
  });
});
