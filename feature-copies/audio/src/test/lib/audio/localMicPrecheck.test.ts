import { describe, expect, it, vi } from "vitest";
import {
  classifyGetUserMediaError,
  detectAudioSignal,
  mapMediaInputs,
  resolveInputDevice,
  rmsFromTimeDomain,
  runLocalMicCheck,
} from "@/lib/audio/localMicPrecheck";
import { MicState } from "@/lib/audio/precheckStates";

function mediaError(name: string): Error {
  const err = new Error(name);
  err.name = name;
  return err;
}

describe("local microphone precheck", () => {
  it("classifies permission vs hardware errors", () => {
    expect(classifyGetUserMediaError(mediaError("NotAllowedError"))).toBe(MicState.PERMISSION_DENIED);
    expect(classifyGetUserMediaError(mediaError("NotFoundError"))).toBe(MicState.DEVICE_UNAVAILABLE);
    expect(classifyGetUserMediaError(mediaError("OverconstrainedError"))).toBe(MicState.DEVICE_UNAVAILABLE);
    expect(classifyGetUserMediaError(mediaError("NotReadableError"))).toBe(MicState.DEVICE_UNAVAILABLE);
    expect(classifyGetUserMediaError(mediaError("AbortError"))).toBe(MicState.ERROR);
  });

  it("does not assume the first device is always valid", () => {
    const devices = [
      { deviceId: "a", label: "Built-in", kind: "audioinput" as const, isDefault: true },
      { deviceId: "b", label: "Headset", kind: "audioinput" as const, isDefault: false },
    ];
    expect(resolveInputDevice(devices, "b").device?.deviceId).toBe("b");
    const missing = resolveInputDevice(devices, "gone");
    expect(missing.usedFallback).toBe(true);
    expect(missing.preferredMissing).toBe(true);
    expect(missing.device?.deviceId).toBe("a");
    expect(resolveInputDevice([], "a").device).toBeNull();
  });

  it("maps enumerated inputs without requiring labels", () => {
    const mapped = mapMediaInputs([
      { deviceId: "1", kind: "audioinput", label: "", groupId: "g" } as MediaDeviceInfo,
      { deviceId: "2", kind: "audiooutput", label: "Speakers", groupId: "g" } as MediaDeviceInfo,
    ]);
    expect(mapped).toHaveLength(1);
    expect(mapped[0]?.label).toMatch(/Microphone/);
  });

  it("detects RMS signal vs silence", async () => {
    let rms = 0;
    const silent = await detectAudioSignal(() => rms, {
      windowMs: 30,
      sampleMs: 10,
      threshold: 0.01,
      now: (() => {
        let t = 0;
        return () => {
          t += 10;
          return t;
        };
      })(),
      sleep: async () => {},
    });
    expect(silent.heard).toBe(false);

    rms = 0.2;
    const heard = await detectAudioSignal(() => rms, {
      windowMs: 1000,
      sampleMs: 10,
      threshold: 0.01,
      now: (() => {
        let t = 0;
        return () => {
          t += 10;
          return t;
        };
      })(),
      sleep: async () => {},
    });
    expect(heard.heard).toBe(true);
  });

  it("computes RMS from a time-domain buffer", () => {
    expect(rmsFromTimeDomain([0, 0, 0, 0])).toBe(0);
    expect(rmsFromTimeDomain([1, -1, 1, -1])).toBe(1);
  });

  it("returns READY when permission, device, and signal succeed", async () => {
    const track = {
      readyState: "live",
      label: "Headset",
      stop: vi.fn(),
      getSettings: () => ({ deviceId: "mic-1" }),
    };
    const stream = { getAudioTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    const result = await runLocalMicCheck(
      { deviceId: "mic-1", signalWindowMs: 20 },
      {
        mediaDevicesSupported: true,
        audioContextSupported: true,
        isSecureContext: true,
        getUserMedia: async () => stream,
        enumerateDevices: async () =>
          [
            { deviceId: "mic-1", kind: "audioinput", label: "Headset", groupId: "g" },
          ] as MediaDeviceInfo[],
        createAnalyser: () => ({ getRms: () => 0.2, disconnect: vi.fn() }),
        sleep: async () => {},
        now: Date.now,
      },
    );
    expect(result.state).toBe(MicState.READY);
    expect(result.deviceId).toBe("mic-1");
    expect(track.stop).toHaveBeenCalled();
  });

  it("returns NO_SIGNAL when permission is granted but RMS stays at zero", async () => {
    const track = {
      readyState: "live",
      label: "Mic",
      stop: vi.fn(),
      getSettings: () => ({ deviceId: "mic-1" }),
    };
    const stream = { getAudioTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    const result = await runLocalMicCheck(
      { signalWindowMs: 20 },
      {
        mediaDevicesSupported: true,
        audioContextSupported: true,
        isSecureContext: true,
        getUserMedia: async () => stream,
        enumerateDevices: async () =>
          [{ deviceId: "mic-1", kind: "audioinput", label: "Mic", groupId: "g" }] as MediaDeviceInfo[],
        createAnalyser: () => ({ getRms: () => 0, disconnect: vi.fn() }),
        sleep: async () => {},
        now: Date.now,
      },
    );
    expect(result.state).toBe(MicState.NO_SIGNAL);
    expect(track.stop).toHaveBeenCalled();
  });

  it("returns PERMISSION_DENIED without treating it as an STT failure", async () => {
    const result = await runLocalMicCheck(
      {},
      {
        mediaDevicesSupported: true,
        audioContextSupported: true,
        isSecureContext: true,
        getUserMedia: async () => {
          throw mediaError("NotAllowedError");
        },
      },
    );
    expect(result.state).toBe(MicState.PERMISSION_DENIED);
  });

  it("returns DEVICE_UNAVAILABLE when no microphone exists", async () => {
    const result = await runLocalMicCheck(
      {},
      {
        mediaDevicesSupported: true,
        audioContextSupported: true,
        isSecureContext: true,
        getUserMedia: async () => {
          throw mediaError("NotFoundError");
        },
      },
    );
    expect(result.state).toBe(MicState.DEVICE_UNAVAILABLE);
  });

  it("falls back when the preferred device disappears", async () => {
    const track = {
      readyState: "live",
      label: "Other",
      stop: vi.fn(),
      getSettings: () => ({ deviceId: "mic-2" }),
    };
    const stream = { getAudioTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
      const audio = constraints.audio;
      if (audio && typeof audio === "object" && "deviceId" in audio) {
        throw mediaError("OverconstrainedError");
      }
      return stream;
    });
    const result = await runLocalMicCheck(
      { deviceId: "missing", signalWindowMs: 20 },
      {
        mediaDevicesSupported: true,
        audioContextSupported: true,
        isSecureContext: true,
        getUserMedia,
        enumerateDevices: async () =>
          [{ deviceId: "mic-2", kind: "audioinput", label: "Other", groupId: "g" }] as MediaDeviceInfo[],
        createAnalyser: () => ({ getRms: () => 0.2, disconnect: vi.fn() }),
        sleep: async () => {},
        now: Date.now,
      },
    );
    expect(result.state).toBe(MicState.READY);
    expect(result.usedFallback).toBe(true);
    expect(result.deviceId).toBe("mic-2");
  });

  it("ignores aborted in-flight checks after cleanup", async () => {
    const ac = new AbortController();
    const pending = runLocalMicCheck(
      { signal: ac.signal, signalWindowMs: 5000 },
      {
        mediaDevicesSupported: true,
        audioContextSupported: true,
        isSecureContext: true,
        getUserMedia: async () => {
          ac.abort();
          throw new DOMException("Aborted", "AbortError");
        },
      },
    );
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
