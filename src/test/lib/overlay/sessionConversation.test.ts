import { describe, expect, it } from "vitest";
import {
  buildSessionConversationTimeline,
  chatAttentionBannerCopy,
  isChatRecoveryReason,
  isLowConfidenceInterviewerSpeech,
  resolveChatRecoveryReason,
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

describe("resolveChatRecoveryReason", () => {
  it("keeps explicit recovery reasons", () => {
    expect(
      resolveChatRecoveryReason({
        chatAttentionReason: "audio_unavailable",
        sessionPipelineState: "listening",
      }),
    ).toBe("audio_unavailable");
  });

  it("falls back to pipeline state when opening Chat cleared the pulse only", () => {
    expect(
      resolveChatRecoveryReason({
        chatAttentionReason: null,
        sessionPipelineState: "audio_unavailable",
      }),
    ).toBe("audio_unavailable");
  });

  it("returns null for normal coach chat", () => {
    expect(
      resolveChatRecoveryReason({
        chatAttentionReason: null,
        sessionPipelineState: "listening",
      }),
    ).toBeNull();
    expect(isChatRecoveryReason(null)).toBe(false);
    expect(isChatRecoveryReason("audio_unavailable")).toBe(true);
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
