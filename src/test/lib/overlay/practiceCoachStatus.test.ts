import { describe, expect, it } from "vitest";
import {
  buildPracticeCoachWarnings,
  primaryPracticeCoachWarning,
} from "@/lib/overlay/practiceCoachStatus";

describe("practiceCoachStatus", () => {
  it("shows mic ready + STT unavailable separately when mic works but token failed", () => {
    const warnings = buildPracticeCoachWarnings({
      micState: "ready",
      tokenState: "failed",
      transcriptionProviderStatus: "error",
      pipelineStatus: "microphone_only",
    });
    const primary = primaryPracticeCoachWarning(warnings);
    expect(primary?.id).toBe("stt-unavailable");
    expect(primary?.title).toBe("Transcription unavailable");
    expect(warnings.some((w) => w.id === "mic-denied")).toBe(false);
  });

  it("deduplicates to permission denied when mic is blocked", () => {
    const warnings = buildPracticeCoachWarnings({
      micState: "permission_denied",
      tokenState: "failed",
      transcriptionProviderStatus: "error",
      pipelineStatus: "unavailable",
    });
    expect(warnings.some((w) => w.id === "mic-denied")).toBe(true);
    expect(warnings.some((w) => w.id === "stt-unavailable")).toBe(false);
  });

  it("includes session restore reconnect info", () => {
    const warnings = buildPracticeCoachWarnings({
      micState: "not_checked",
      tokenState: "idle",
      transcriptionProviderStatus: "idle",
      pipelineStatus: "idle",
      sessionRestored: true,
      needsMicReconnect: true,
    });
    expect(warnings.some((w) => w.id === "session-restored-reconnect-mic")).toBe(true);
  });

  it("does not nag to reconnect mic when restore reused a granted permission", () => {
    const warnings = buildPracticeCoachWarnings({
      micState: "ready",
      tokenState: "ready",
      transcriptionProviderStatus: "connected",
      pipelineStatus: "listening",
      sessionRestored: true,
      needsMicReconnect: false,
    });
    expect(warnings.some((w) => w.id === "session-restored-reconnect-mic")).toBe(false);
  });
});
