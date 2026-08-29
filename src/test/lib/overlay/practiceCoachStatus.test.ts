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
      deepgramStatus: "error",
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
      deepgramStatus: "error",
      pipelineStatus: "unavailable",
    });
    expect(warnings.some((w) => w.id === "mic-denied")).toBe(true);
    expect(warnings.some((w) => w.id === "stt-unavailable")).toBe(false);
  });

  it("includes session restore reconnect info", () => {
    const warnings = buildPracticeCoachWarnings({
      micState: "not_checked",
      tokenState: "idle",
      deepgramStatus: "disconnected",
      pipelineStatus: "idle",
      sessionRestored: true,
      needsMicReconnect: true,
    });
    expect(warnings.some((w) => w.id === "session-restored-reconnect-mic")).toBe(true);
  });
});
