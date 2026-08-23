import { describe, it, expect } from "vitest";
import {
  canBecomeInterviewerQuestion,
  createLiveHintOperationId,
} from "@/lib/audio/liveQuestionGate";

describe("canBecomeInterviewerQuestion", () => {
  it("accepts interviewer channel + question syntax", () => {
    expect(
      canBecomeInterviewerQuestion({
        speaker: "interviewer",
        text: "Tell me about a time you led a project.",
        isFinal: true,
        confidence: 0.9,
        hasInterviewerChannel: true,
      }),
    ).toBe(true);
  });

  it("rejects candidate speech even when question-shaped", () => {
    expect(
      canBecomeInterviewerQuestion({
        speaker: "candidate",
        text: "What is your biggest strength?",
        isFinal: true,
        confidence: 0.95,
        hasInterviewerChannel: true,
      }),
    ).toBe(false);
  });

  it("rejects unknown speaker", () => {
    expect(
      canBecomeInterviewerQuestion({
        speaker: "unknown",
        text: "How would you design a cache?",
        isFinal: true,
        hasInterviewerChannel: true,
      }),
    ).toBe(false);
  });

  it("rejects when tab/interviewer channel is missing", () => {
    expect(
      canBecomeInterviewerQuestion({
        speaker: "interviewer",
        text: "Walk me through your resume.",
        isFinal: true,
        hasInterviewerChannel: false,
      }),
    ).toBe(false);
  });

  it("rejects low-confidence ambiguous speech", () => {
    expect(
      canBecomeInterviewerQuestion({
        speaker: "interviewer",
        text: "Can you explain your approach here?",
        isFinal: true,
        confidence: 0.2,
        hasInterviewerChannel: true,
      }),
    ).toBe(false);
  });

  it("rejects interim results", () => {
    expect(
      canBecomeInterviewerQuestion({
        speaker: "interviewer",
        text: "What is your experience with React?",
        isFinal: false,
        hasInterviewerChannel: true,
      }),
    ).toBe(false);
  });
});

describe("createLiveHintOperationId", () => {
  it("returns distinct ids for the same question", () => {
    const a = createLiveHintOperationId("sess-1", "q-id-1");
    const b = createLiveHintOperationId("sess-1", "q-id-1");
    expect(a).not.toBe(b);
    expect(a.startsWith("hint-op:")).toBe(true);
  });
});
