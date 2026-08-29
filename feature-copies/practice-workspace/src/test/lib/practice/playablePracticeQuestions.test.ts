import { describe, expect, it } from "vitest";
import {
  interviewTypeToLocalBankType,
  isInterviewishPlayableRow,
  mapPlayableToPracticeQuestion,
  resolvePracticeQuestions,
} from "@/lib/practice/playablePracticeQuestions";
import { getLocalMockQuestions } from "@/lib/mock/localQuestionBank";
import type { PlayableQuestion } from "@/lib/gov-exam/playableQuestions";

function playable(
  partial: Partial<PlayableQuestion> & { category?: string | null; tags?: string[] | null },
): PlayableQuestion & { category?: string | null; tags?: string[] | null } {
  return {
    id: partial.id ?? "q1",
    question_text: partial.question_text ?? "Tell me about a conflict.",
    question_type: partial.question_type ?? "SHORT_ANSWER",
    options: null,
    subject: partial.subject ?? "Interview",
    topic: partial.topic ?? "Behavioral",
    difficulty: partial.difficulty ?? "MEDIUM",
    category: partial.category ?? "interview",
    tags: partial.tags ?? ["behavioral"],
    exam_type: partial.exam_type ?? null,
  };
}

describe("practice workspace playable bank", () => {
  it("maps interview types to the local mock bank fallback", () => {
    expect(interviewTypeToLocalBankType("Behavioral")).toBe("behavioural");
    expect(interviewTypeToLocalBankType("System Design")).toBe("system_design");
    expect(interviewTypeToLocalBankType("Technical")).toBe("technical");
  });

  it("keeps interview-ish topics and drops gov-exam papers", () => {
    expect(isInterviewishPlayableRow(playable({ topic: "Behavioral", subject: "HR" }), "Behavioral")).toBe(true);
    expect(isInterviewishPlayableRow(playable({ topic: "Polity", subject: "GS", category: "UPSC", tags: [] }), "Behavioral")).toBe(false);
  });

  it("maps playable rows without answer keys and falls back to the local bank when empty", () => {
    const mapped = mapPlayableToPracticeQuestion(
      playable({ id: "p1", question_text: "Why this role?" }),
      "HR",
    );
    expect(mapped.question).toBe("Why this role?");
    expect(mapped).not.toHaveProperty("correct_answer");

    const local = getLocalMockQuestions({ type: "behavioural", count: 4, role: "PM", difficulty: "medium" });
    const empty = resolvePracticeQuestions({
      playable: [],
      interviewType: "Behavioral",
      localFallback: local,
      count: 4,
    });
    expect(empty.source).toBe("local");
    expect(empty.questions).toHaveLength(4);

    const fromBank = resolvePracticeQuestions({
      playable: [playable({ id: "bank-1" })],
      interviewType: "Behavioral",
      localFallback: local,
      count: 4,
    });
    expect(fromBank.source).toBe("playable");
    expect(fromBank.questions[0].id).toBe("bank-1");
  });
});
