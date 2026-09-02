import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  acquireMicrophoneStream,
  buildMicrophoneConstraints,
  canHydrateDeviceLabels,
  MicrophoneAccessError,
  microphoneSetupHint,
  restoredSessionToast,
  shouldShowMicrophonePrompt,
} from "@/lib/audio/micPermission";
import {
  getCachedAudioDevices,
  invalidateAudioDeviceCache,
} from "@/lib/audio/audioDeviceCache";

function fakeStream(): MediaStream {
  return {
    getTracks: () => [],
    getAudioTracks: () => [],
  } as unknown as MediaStream;
}

function gumError(name: string): Error {
  const err = new Error(name);
  err.name = name;
  return err;
}

describe("acquireMicrophoneStream", () => {
  it("reuses a granted permission and does not mark a browser prompt", async () => {
    const getUserMedia = vi.fn(async () => fakeStream());
    const result = await acquireMicrophoneStream(
      {},
      {
        queryPermission: async () => "granted",
        getUserMedia,
        enumerateDevices: async () => [
          { kind: "audioinput", deviceId: "mic-1", label: "Built-in" },
        ],
      },
    );
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(result.browserPrompted).toBe(false);
    expect(result.permission).toBe("granted");
    expect(shouldShowMicrophonePrompt(result.permission)).toBe(false);
    const constraints = getUserMedia.mock.calls[0]?.[0] as MediaStreamConstraints;
    expect(constraints.audio).toEqual(
      expect.objectContaining({ echoCancellation: true, channelCount: 1 }),
    );
    expect(JSON.stringify(constraints)).not.toContain('"exact"');
    expect(JSON.stringify(constraints)).not.toContain("sampleRate");
  });

  it("does not call getUserMedia when permission is denied", async () => {
    const getUserMedia = vi.fn(async () => fakeStream());
    const restored = { question: "Tell me about yourself", answers: 2 };
    await expect(
      acquireMicrophoneStream(
        {},
        { queryPermission: async () => "denied", getUserMedia },
      ),
    ).rejects.toMatchObject({
      name: "MicrophoneAccessError",
      audioCode: "PERMISSION_DENIED",
    });
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(restored).toEqual({ question: "Tell me about yourself", answers: 2 });
  });

  it("calls getUserMedia once when permission is prompt", async () => {
    const getUserMedia = vi.fn(async () => fakeStream());
    const result = await acquireMicrophoneStream(
      {},
      { queryPermission: async () => "prompt", getUserMedia },
    );
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(result.browserPrompted).toBe(true);
    expect(microphoneSetupHint("prompt")).toMatch(/when prompted/i);
  });

  it("treats granted + no audioinput devices as a device error without getUserMedia", async () => {
    const getUserMedia = vi.fn(async () => fakeStream());
    await expect(
      acquireMicrophoneStream(
        {},
        {
          queryPermission: async () => "granted",
          getUserMedia,
          enumerateDevices: async () => [
            { kind: "audiooutput", deviceId: "spk", label: "Speakers" },
          ],
        },
      ),
    ).rejects.toMatchObject({ audioCode: "DEVICE_NOT_FOUND" });
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("falls back from a preferred deviceId after OverconstrainedError", async () => {
    const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
      const audio = constraints.audio as MediaTrackConstraints;
      if (audio?.deviceId) throw gumError("OverconstrainedError");
      return fakeStream();
    });
    const result = await acquireMicrophoneStream(
      { deviceId: "stale-id" },
      {
        queryPermission: async () => "granted",
        getUserMedia,
        enumerateDevices: async () => [
          { kind: "audioinput", deviceId: "mic-1", label: "Headset" },
        ],
      },
    );
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(result.browserPrompted).toBe(false);
    const fallback = getUserMedia.mock.calls[1]?.[0] as MediaStreamConstraints;
    expect(JSON.stringify(fallback)).not.toContain("stale-id");
  });

  it("refresh/reconnect with granted permission is not a duplicate prompt", async () => {
    const getUserMedia = vi.fn(async () => fakeStream());
    const deps = {
      queryPermission: async () => "granted" as const,
      getUserMedia,
      enumerateDevices: async () => [
        { kind: "audioinput" as const, deviceId: "mic-1", label: "Built-in" },
      ],
    };
    const first = await acquireMicrophoneStream({}, deps);
    const second = await acquireMicrophoneStream({}, deps);
    expect(first.browserPrompted).toBe(false);
    expect(second.browserPrompted).toBe(false);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(restoredSessionToast(true, "granted")).toBe("Session restored.");
  });

  it("unavailable Permissions API still acquires once without claiming a prompt", async () => {
    const getUserMedia = vi.fn(async () => fakeStream());
    const result = await acquireMicrophoneStream(
      {},
      { queryPermission: async () => "unavailable", getUserMedia },
    );
    expect(result.browserPrompted).toBe(false);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });
});

describe("microphone restore copy", () => {
  it("only asks the user to allow access when permission is prompt or denied", () => {
    expect(microphoneSetupHint("granted", { restore: true })).toMatch(/Reconnecting/i);
    expect(microphoneSetupHint("denied")).toMatch(/blocked/i);
    expect(shouldShowMicrophonePrompt("granted")).toBe(false);
    expect(restoredSessionToast(false, "denied")).toMatch(/browser settings/i);
  });
});

describe("buildMicrophoneConstraints", () => {
  it("prefers ideal deviceId over exact + sampleRate", () => {
    const constraints = buildMicrophoneConstraints("mic-1");
    expect(constraints.audio).toEqual(
      expect.objectContaining({
        deviceId: { ideal: "mic-1" },
        echoCancellation: true,
      }),
    );
  });
});

describe("audio device cache label hydration", () => {
  afterEach(() => {
    invalidateAudioDeviceCache();
    vi.unstubAllGlobals();
  });

  it("does not call getUserMedia for labels when permission is prompt", async () => {
    const getUserMedia = vi.fn(async () => fakeStream());
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: { query: async () => ({ state: "prompt" }) },
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: async () => [
          { kind: "audioinput", deviceId: "mic-1", label: "" },
        ],
        getUserMedia,
      },
    });

    const devices = await getCachedAudioDevices(true);
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(canHydrateDeviceLabels("prompt")).toBe(false);
    expect(devices[0]?.label).toMatch(/Microphone/);
  });

  it("does not call getUserMedia for labels when permission is denied", async () => {
    const getUserMedia = vi.fn(async () => fakeStream());
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: { query: async () => ({ state: "denied" }) },
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: async () => [
          { kind: "audioinput", deviceId: "mic-1", label: "" },
        ],
        getUserMedia,
      },
    });

    await getCachedAudioDevices(true);
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});

describe("MicrophoneAccessError", () => {
  it("maps to a typed audio error for denied recovery UI", () => {
    const err = new MicrophoneAccessError(
      "PERMISSION_DENIED",
      "blocked",
      "allow it",
      false,
    );
    expect(err.toAudioError()).toEqual({
      code: "PERMISSION_DENIED",
      message: "blocked",
      recoverable: false,
      suggestion: "allow it",
    });
  });
});

describe("session restore media wiring", () => {
  const readRepo = (rel: string) =>
    readFileSync(resolve(process.cwd(), rel), "utf8");

  it("queries permission before capture and skips tab-share on restore", () => {
    const src = readRepo("src/hooks/useAudioSession.ts");
    expect(src).toContain("getMicPermissionState()");
    expect(src).toContain("startOpts?: AudioStartOptions");
    expect(src).toContain("isSystemAudioSupported() && !restore");
    expect(src).not.toMatch(
      /setMicState\("requesting_permission"\);\s*store\.setTokenState/,
    );
  });

  it("does not tell testers to reconnect the mic after a successful granted restore", () => {
    const src = readRepo("src/pages/app/live/LiveOverlay.tsx");
    expect(src).not.toContain("reconnect your microphone to continue transcription");
    expect(src).toContain("restoredSessionToast");
  });
});
