import { describe, expect, it } from "vitest";
import { isUncertainSpeakerSeparation } from "@/lib/audio/speakerSeparation";

describe("isUncertainSpeakerSeparation", () => {
  it("is false without interviewer channel", () => {
    expect(
      isUncertainSpeakerSeparation({
        isCapturing: true,
        hasInterviewerChannel: false,
        pipelineStatus: "listening",
        utterances: [
          { speaker: "unknown", text: "hello there friend", is_final: true, confidence: 0.2 },
          { speaker: "unknown", text: "more unknown speech", is_final: true, confidence: 0.2 },
        ],
      }),
    ).toBe(false);
  });

  it("is true when dual-channel finals include low-confidence interviewer speech", () => {
    expect(
      isUncertainSpeakerSeparation({
        isCapturing: true,
        hasInterviewerChannel: true,
        pipelineStatus: "transcribing",
        minConfidence: 0.45,
        utterances: [
          {
            speaker: "interviewer",
            text: "Can you walk me through your last project?",
            is_final: true,
            confidence: 0.2,
          },
        ],
      }),
    ).toBe(true);
  });

  it("is true when recent finals have multiple unknown speakers", () => {
    expect(
      isUncertainSpeakerSeparation({
        isCapturing: true,
        hasInterviewerChannel: true,
        pipelineStatus: "listening",
        utterances: [
          { speaker: "unknown", text: "first unknown", is_final: true, confidence: 0.9 },
          { speaker: "unknown", text: "second unknown", is_final: true, confidence: 0.9 },
        ],
      }),
    ).toBe(true);
  });

  it("is false for healthy dual-channel interviewer/candidate turns", () => {
    expect(
      isUncertainSpeakerSeparation({
        isCapturing: true,
        hasInterviewerChannel: true,
        pipelineStatus: "listening",
        utterances: [
          {
            speaker: "interviewer",
            text: "Tell me about a hard bug.",
            is_final: true,
            confidence: 0.92,
          },
          {
            speaker: "candidate",
            text: "It was a race in the cache layer.",
            is_final: true,
            confidence: 0.95,
          },
        ],
      }),
    ).toBe(false);
  });
});
