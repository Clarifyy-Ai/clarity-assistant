import { describe, expect, it } from "vitest";
import {
  deriveShareAudioState,
  shouldShowShareAudioPrompt,
} from "@/lib/audio/shareAudioState";
import { practiceCoachStylePayload } from "@/lib/ai/practiceCoachContract";
import { classifyEdgeError, userMessageForEdgeError } from "@/lib/network/edgeErrors";

describe("shareAudioState", () => {
  it("returns ACTIVE when channel health is active", () => {
    expect(
      deriveShareAudioState({
        requested: true,
        hasStream: true,
        channelActive: true,
        channelConnecting: false,
        channelSilent: false,
        denied: false,
        unsupported: false,
        failed: false,
        paused: false,
      }),
    ).toBe("ACTIVE");
  });

  it("does not prompt share when active", () => {
    expect(shouldShowShareAudioPrompt("ACTIVE")).toBe(false);
    expect(shouldShowShareAudioPrompt("NOT_STARTED")).toBe(true);
  });
});

describe("practiceCoachStylePayload", () => {
  it("maps legacy hint style values", () => {
    expect(practiceCoachStylePayload({ hintStyle: "detailed" }).hint_style).toBe("full_answer");
    expect(practiceCoachStylePayload({ hintStyle: "minimal" }).hint_style).toBe("keywords_only");
  });
});

describe("edgeErrors", () => {
  it("classifies provider 503 as retryable PROVIDER_ERROR", () => {
    const parsed = classifyEdgeError({ status: 503, code: "PROVIDER_UNAVAILABLE", message: "down" });
    expect(parsed.kind).toBe("PROVIDER_ERROR");
    expect(parsed.retryable).toBe(true);
    expect(userMessageForEdgeError(parsed)).toMatch(/temporarily unavailable/i);
  });

  it("classifies insufficient credits", () => {
    const parsed = classifyEdgeError({ status: 402, code: "INSUFFICIENT_CREDITS", message: "no credits" });
    expect(parsed.kind).toBe("CREDIT_ERROR");
  });
});
