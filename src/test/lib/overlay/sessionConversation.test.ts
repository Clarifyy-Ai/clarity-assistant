import { describe, expect, it } from "vitest";
import {
  buildSessionConversationTimeline,
  chatAttentionBannerCopy,
  isLowConfidenceInterviewerSpeech,
} from "@/lib/overlay/sessionConversation";

describe("buildSessionConversationTimeline", () => {
  it("merges chat and hint history in chronological order", () => {
    const timeline = buildSessionConversationTimeline({
      chatHistory: [
        {
          id: "c1",
          role: "user",
          text: "How should I structure STAR?",
          timestamp: 200,
        },
        {
          id: "c2",
          role: "assistant",
          text: "Situation, Task, Action, Result.",
          timestamp: 300,
        },
      ],
      hintHistory: [
        {
          question: "Tell me about yourself",
          hint: "Lead with your strongest role.",
          timestamp: 100,
        },
      ],
    });

    expect(timeline.map((t) => t.role)).toEqual([
      "question",
      "suggestion",
      "user",
      "assistant",
    ]);
    expect(timeline[0].text).toBe("Tell me about yourself");
    expect(timeline[1].text).toBe("Lead with your strongest role.");
  });

  it("includes system notice for chat attention", () => {
    const timeline = buildSessionConversationTimeline({
      chatHistory: [],
      hintHistory: [],
      systemNotice: "Open Chat to type",
      systemNoticeAt: 50,
    });
    expect(timeline).toHaveLength(1);
    expect(timeline[0].role).toBe("system");
  });
});

describe("chatAttentionBannerCopy", () => {
  it("returns actionable copy for low confidence", () => {
    expect(chatAttentionBannerCopy("low_confidence")).toMatch(/Chat/i);
  });
});

describe("isLowConfidenceInterviewerSpeech", () => {
  it("detects interviewer finals below confidence threshold", () => {
    expect(
      isLowConfidenceInterviewerSpeech({
        speaker: "interviewer",
        text: "Can you walk me through a recent project?",
        isFinal: true,
        confidence: 0.2,
        hasInterviewerChannel: true,
      }),
    ).toBe(true);
  });

  it("ignores candidate speech and high confidence", () => {
    expect(
      isLowConfidenceInterviewerSpeech({
        speaker: "candidate",
        text: "Can you walk me through a recent project?",
        isFinal: true,
        confidence: 0.2,
        hasInterviewerChannel: true,
      }),
    ).toBe(false);
    expect(
      isLowConfidenceInterviewerSpeech({
        speaker: "interviewer",
        text: "Can you walk me through a recent project?",
        isFinal: true,
        confidence: 0.9,
        hasInterviewerChannel: true,
      }),
    ).toBe(false);
  });
});
