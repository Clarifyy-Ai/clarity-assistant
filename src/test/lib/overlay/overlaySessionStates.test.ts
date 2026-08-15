import { describe, it, expect } from "vitest";
import { pipelineStateFromErrorMessage } from "@/lib/overlay/overlaySessionStates";

describe("pipelineStateFromErrorMessage", () => {
  it("maps transcription failures to audio_unavailable, not AI unavailable", () => {
    expect(pipelineStateFromErrorMessage("Live transcription unavailable")).toBe(
      "audio_unavailable",
    );
    expect(pipelineStateFromErrorMessage("Deepgram websocket closed")).toBe(
      "audio_unavailable",
    );
  });

  it("maps credit and rate-limit copy", () => {
    expect(pipelineStateFromErrorMessage("Not enough credits. Need 10, have 2.")).toBe(
      "insufficient_credits",
    );
    expect(pipelineStateFromErrorMessage("429 rate limited")).toBe("rate_limited");
  });

  it("maps generic model failures to ai_provider_unavailable", () => {
    expect(pipelineStateFromErrorMessage("Gemini returned 503")).toBe(
      "ai_provider_unavailable",
    );
  });
});
