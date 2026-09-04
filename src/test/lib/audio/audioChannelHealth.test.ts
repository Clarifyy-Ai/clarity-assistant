import { describe, expect, it } from "vitest";
import {
  EMPTY_CHANNEL_METRICS,
  SILENT_SOURCE_GRACE_MS,
  buildChannelHealth,
  deriveChannelHealth,
  isChannelUiActive,
  worstTranscriptionHealth,
  type AudioChannelMetrics,
} from "@/lib/audio/audioChannelHealth";

function metrics(partial: Partial<AudioChannelMetrics>): AudioChannelMetrics {
  return { ...EMPTY_CHANNEL_METRICS, ...partial };
}

describe("audioChannelHealth — no false Active", () => {
  it("does not return active from stream object alone", () => {
    const status = deriveChannelHealth(
      metrics({
        hasStream: true,
        trackReadyState: "live",
        trackEnabled: true,
        sttSocketOpen: false,
        sttStatus: "idle",
        monitoringStartedAt: Date.now(),
      }),
    );
    expect(status).not.toBe("active");
    expect(isChannelUiActive(status)).toBe(false);
  });

  it("stays connecting until frames transmit", () => {
    const status = deriveChannelHealth(
      metrics({
        hasStream: true,
        trackReadyState: "live",
        trackEnabled: true,
        sttSocketOpen: true,
        sttStatus: "connected",
        receivedFrameCount: 0,
        transmittedFrameCount: 0,
        monitoringStartedAt: Date.now(),
      }),
    );
    expect(status).toBe("connecting");
  });

  it("becomes active when frames flow and energy is present", () => {
    const now = 1_000_000;
    const status = deriveChannelHealth(
      metrics({
        hasStream: true,
        trackReadyState: "live",
        trackEnabled: true,
        sttSocketOpen: true,
        sttStatus: "connected",
        receivedFrameCount: 12,
        transmittedFrameCount: 12,
        rmsLevel: 0.05,
        lastEnergyAt: now,
        monitoringStartedAt: now - 2_000,
      }),
      now,
    );
    expect(status).toBe("active");
  });

  it("becomes active from recent transcript without energy", () => {
    const now = 1_000_000;
    const status = deriveChannelHealth(
      metrics({
        hasStream: true,
        trackReadyState: "live",
        trackEnabled: true,
        sttSocketOpen: true,
        sttStatus: "connected",
        transmittedFrameCount: 8,
        rmsLevel: 0,
        lastTranscriptEventAt: now - 1_000,
        monitoringStartedAt: now - SILENT_SOURCE_GRACE_MS - 1_000,
      }),
      now,
    );
    expect(status).toBe("active");
  });

  it("detects silent_source after grace with frames but no energy/transcript", () => {
    const now = 1_000_000;
    const status = deriveChannelHealth(
      metrics({
        hasStream: true,
        trackReadyState: "live",
        trackEnabled: true,
        sttSocketOpen: true,
        sttStatus: "connected",
        transmittedFrameCount: 40,
        rmsLevel: 0,
        lastEnergyAt: null,
        lastTranscriptEventAt: null,
        monitoringStartedAt: now - SILENT_SOURCE_GRACE_MS - 500,
      }),
      now,
    );
    expect(status).toBe("silent_source");
    expect(isChannelUiActive(status)).toBe(false);
  });

  it("marks unavailable on connectFailed", () => {
    expect(
      deriveChannelHealth(
        metrics({
          hasStream: false,
          connectFailed: true,
        }),
      ),
    ).toBe("unavailable");
  });

  it("marks disconnected when track ended", () => {
    expect(
      deriveChannelHealth(
        metrics({
          hasStream: true,
          trackReadyState: "ended",
          sttSocketOpen: true,
          sttStatus: "connected",
          transmittedFrameCount: 5,
        }),
      ),
    ).toBe("disconnected");
  });

  it("reconnect path: ended then restored frames become active", () => {
    const now = 2_000_000;
    const ended = deriveChannelHealth(
      metrics({
        hasStream: true,
        trackReadyState: "ended",
        transmittedFrameCount: 10,
      }),
      now,
    );
    expect(ended).toBe("disconnected");

    const restored = deriveChannelHealth(
      metrics({
        hasStream: true,
        trackReadyState: "live",
        trackEnabled: true,
        sttSocketOpen: true,
        sttStatus: "connected",
        transmittedFrameCount: 3,
        rmsLevel: 0.08,
        lastEnergyAt: now,
        monitoringStartedAt: now,
      }),
      now,
    );
    expect(restored).toBe("active");
  });

  it("STT socket open without frames is not Active after grace (connecting then silent)", () => {
    const now = 3_000_000;
    const early = deriveChannelHealth(
      metrics({
        hasStream: true,
        trackReadyState: "live",
        trackEnabled: true,
        sttSocketOpen: true,
        sttStatus: "connected",
        transmittedFrameCount: 0,
        monitoringStartedAt: now - 1_000,
      }),
      now,
    );
    expect(early).toBe("connecting");

    const lateWithFramesNoEnergy = deriveChannelHealth(
      metrics({
        hasStream: true,
        trackReadyState: "live",
        trackEnabled: true,
        sttSocketOpen: true,
        sttStatus: "connected",
        transmittedFrameCount: 20,
        monitoringStartedAt: now - SILENT_SOURCE_GRACE_MS - 1,
      }),
      now,
    );
    expect(lateWithFramesNoEnergy).toBe("silent_source");
  });

  it("buildChannelHealth wraps status + metrics", () => {
    const snap = buildChannelHealth(
      metrics({
        hasStream: true,
        trackReadyState: "live",
        trackEnabled: true,
        sttSocketOpen: true,
        sttStatus: "connected",
        transmittedFrameCount: 5,
        rmsLevel: 0.1,
        lastEnergyAt: Date.now(),
        monitoringStartedAt: Date.now(),
      }),
    );
    expect(snap.status).toBe("active");
    expect(snap.metrics.transmittedFrameCount).toBe(5);
  });

  it("worstTranscriptionHealth prefers interviewer failure when dual expected", () => {
    expect(worstTranscriptionHealth("active", "silent_source", true)).toBe("silent_source");
    expect(worstTranscriptionHealth("active", "disconnected", false)).toBe("active");
  });
});
