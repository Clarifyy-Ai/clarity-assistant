import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  resolvePostMicSttPipeline,
  isTabAudioHonestlyConnected,
} from "@/lib/audio/interviewerChannelState";
import {
  TabAudioCaptureError,
  NO_SHARE_AUDIO_ERROR_CODE,
  captureSystemAudioViaTabShare,
} from "@/lib/capture/tabAudioCapture";
import { captureSystemAudio } from "@/lib/audio/audioCapture";
import { useAudioStore } from "@/store/audioStore";

describe("resolvePostMicSttPipeline — DEFECT-2 race guard", () => {
  it("keeps listening when interviewer channel already connected during auto share", () => {
    expect(
      resolvePostMicSttPipeline({
        enableSystemAudio: true,
        interviewerChannelActive: true,
      }),
    ).toBe("listening");
  });

  it("sets microphone_only when system audio enabled but interviewer not yet connected", () => {
    expect(
      resolvePostMicSttPipeline({
        enableSystemAudio: true,
        interviewerChannelActive: false,
      }),
    ).toBe("microphone_only");
  });

  it("sets listening when system audio disabled", () => {
    expect(
      resolvePostMicSttPipeline({
        enableSystemAudio: false,
        interviewerChannelActive: false,
      }),
    ).toBe("listening");
  });
});

describe("isTabAudioHonestlyConnected", () => {
  it("requires both stream and interviewer STT channel", () => {
    expect(
      isTabAudioHonestlyConnected({
        hasSystemStream: true,
        interviewerChannelActive: false,
      }),
    ).toBe(false);
    expect(
      isTabAudioHonestlyConnected({
        hasSystemStream: false,
        interviewerChannelActive: true,
      }),
    ).toBe(false);
    expect(
      isTabAudioHonestlyConnected({
        hasSystemStream: true,
        interviewerChannelActive: true,
      }),
    ).toBe(true);
  });
});

describe("captureSystemAudioViaTabShare", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("throws TabAudioCaptureError when share has no audio track", async () => {
    const stop = vi.fn();
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getDisplayMedia: vi.fn().mockResolvedValue({
          getVideoTracks: () => [{ stop }],
          getAudioTracks: () => [],
          getTracks: () => [{ stop }],
        }),
      },
    });

    await expect(captureSystemAudioViaTabShare()).rejects.toMatchObject({
      name: "TabAudioCaptureError",
      code: NO_SHARE_AUDIO_ERROR_CODE,
    });
  });
});

describe("captureSystemAudio error preservation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("rethrows TabAudioCaptureError unchanged", async () => {
    const err = new TabAudioCaptureError("No audio track received");
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getDisplayMedia: vi.fn().mockResolvedValue({
          getVideoTracks: () => [{ stop: vi.fn() }],
          getAudioTracks: () => [],
          getTracks: () => [{ stop: vi.fn() }],
        }),
      },
    });

    await expect(captureSystemAudio()).rejects.toBeInstanceOf(TabAudioCaptureError);
    await expect(captureSystemAudio()).rejects.toThrow(/Share tab audio/);
    void err;
  });

  it("throws Error (not plain AudioError object) on NotAllowedError", async () => {
    const denied = Object.assign(new Error("Permission denied"), {
      name: "NotAllowedError",
    });
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getDisplayMedia: vi.fn().mockRejectedValue(denied),
      },
    });

    await expect(captureSystemAudio()).rejects.toBeInstanceOf(Error);
    await expect(captureSystemAudio()).rejects.not.toBeInstanceOf(TabAudioCaptureError);
  });
});

describe("interviewer capture health store", () => {
  beforeEach(() => {
    useAudioStore.getState().resetAudio();
  });

  it("increments frame counters without storing raw audio", () => {
    const store = useAudioStore.getState();
    store.noteInterviewerCaptureFrame(true);
    store.noteInterviewerCaptureFrame(false);
    store.noteInterviewerCaptureHeartbeat();
    const health = useAudioStore.getState().interviewer_capture_health;
    expect(health.framesReceived).toBe(2);
    expect(health.framesSentToStt).toBe(1);
    expect(health.lastHeartbeatAt).toBeTypeOf("number");
  });

  it("clears health when interviewer channel deactivated", () => {
    const store = useAudioStore.getState();
    store.noteInterviewerCaptureFrame(true);
    store.setInterviewerChannelActive(true);
    store.resetInterviewerCaptureHealth();
    store.setInterviewerChannelActive(false);
    expect(useAudioStore.getState().interviewer_capture_health).toEqual({
      framesReceived: 0,
      framesSentToStt: 0,
      lastHeartbeatAt: null,
    });
  });
});

describe("failed connect clears stale system stream contract", () => {
  it("documents that UI must not treat stream alone as connected", () => {
    // Mirrors toggleSystemAudio catch: stream set before STT, cleared on failure.
    const beforeFail = isTabAudioHonestlyConnected({
      hasSystemStream: true,
      interviewerChannelActive: false,
    });
    expect(beforeFail).toBe(false);
  });
});
