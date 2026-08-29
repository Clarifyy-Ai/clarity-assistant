import { describe, expect, it } from "vitest";
import { ApiClientError } from "@/lib/api/apiClient";
import { checkSttHealth, classifySttFailure } from "@/lib/audio/sttHealthCheck";
import {
  createOperationGuard,
  isLocalAudioReadyForVoice,
  MIC_STATUS_COPY,
  micAndSttSummary,
  MicState,
  SpeakerState,
  SttState,
} from "@/lib/audio/precheckStates";

describe("STT health is independent of microphone hardware", () => {
  it("maps Deepgram 503 to STT_UNAVAILABLE", () => {
    const result = classifySttFailure(
      new ApiClientError({
        message: "Transcription service is not configured",
        status: 503,
        code: "SERVICE_UNAVAILABLE",
      }),
    );
    expect(result.state).toBe(SttState.STT_UNAVAILABLE);
  });

  it("does not change microphone READY when STT is down", () => {
    expect(MIC_STATUS_COPY[MicState.READY]).toBe("Microphone ready");
    expect(micAndSttSummary(MicState.READY, SttState.STT_UNAVAILABLE)).toBe("Microphone ready");
    expect(isLocalAudioReadyForVoice(MicState.READY, SpeakerState.READY)).toBe(true);
  });

  it("does not treat STT failure as a microphone failure", async () => {
    const result = await checkSttHealth({
      fetchToken: async () => {
        throw new ApiClientError({ message: "unavailable", status: 503, code: "SERVICE_UNAVAILABLE" });
      },
    });
    expect(result.state).toBe(SttState.STT_UNAVAILABLE);
    expect(MicState.READY).not.toBe(result.state);
  });

  it("marks STT ready only when a token is present", async () => {
    await expect(checkSttHealth({ fetchToken: async () => ({ token: "tok" }) })).resolves.toMatchObject({
      state: SttState.STT_READY,
    });
    await expect(checkSttHealth({ fetchToken: async () => ({}) })).resolves.toMatchObject({
      state: SttState.STT_UNAVAILABLE,
    });
  });
});

describe("stale async precheck results", () => {
  it("only the latest operation is current", async () => {
    const guard = createOperationGuard();
    const first = guard.next();
    const second = guard.next();
    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
    await Promise.resolve();
    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
  });

  it("invalidate drops in-flight operations", () => {
    const guard = createOperationGuard();
    const op = guard.next();
    guard.invalidate();
    expect(op.isCurrent()).toBe(false);
  });
});
