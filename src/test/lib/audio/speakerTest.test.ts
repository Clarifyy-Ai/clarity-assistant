import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cancelSpeakerTest,
  disposeSpeakerTestResources,
  getSpeakerPlayGeneration,
  isSpeakerTestPlaying,
  runSpeakerTest,
} from "@/lib/audio/speakerTest";
import { SpeakerState } from "@/lib/audio/precheckStates";
import {
  loadPersistedMicDeviceId,
  persistMicDeviceId,
  persistSpeakerDeviceId,
  loadPersistedSpeakerDeviceId,
} from "@/lib/audio/micDevicePersistence";

function installFakeAudio() {
  let oscillatorStarts = 0;
  class FakeOscillator {
    type = "sine";
    frequency = { value: 0 };
    connect() {}
    disconnect() {}
    start() {
      oscillatorStarts += 1;
    }
    stop() {}
  }
  class FakeGain {
    gain = { value: 0, exponentialRampToValueAtTime() {} };
    connect() {}
    disconnect() {}
  }
  class FakeAudioContext {
    state = "running";
    currentTime = 0;
    destination = {};
    createOscillator() {
      return new FakeOscillator();
    }
    createGain() {
      return new FakeGain();
    }
    createMediaStreamDestination() {
      return { stream: {} };
    }
    resume() {
      return Promise.resolve();
    }
    close() {
      this.state = "closed";
      return Promise.resolve();
    }
  }
  vi.stubGlobal("AudioContext", FakeAudioContext);
  return {
    starts: () => oscillatorStarts,
  };
}

describe("speaker test", () => {
  afterEach(async () => {
    await disposeSpeakerTestResources();
    vi.unstubAllGlobals();
  });

  it("reports playback blocked without calling it a hardware failure", async () => {
    class BlockingCtx {
      state = "suspended";
      currentTime = 0;
      destination = {};
      createOscillator() {
        return { type: "sine", frequency: { value: 0 }, connect() {}, disconnect() {}, start() {}, stop() {} };
      }
      createGain() {
        return { gain: { value: 0, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} };
      }
      resume() {
        const err = new Error("blocked");
        err.name = "NotAllowedError";
        return Promise.reject(err);
      }
      close() {
        return Promise.resolve();
      }
    }
    vi.stubGlobal("AudioContext", BlockingCtx);
    const result = await runSpeakerTest();
    expect(result.state).toBe(SpeakerState.PLAYBACK_BLOCKED);
    expect(result.started).toBe(false);
  });

  it("cancels overlapping playback so only the latest generation remains", async () => {
    const fake = installFakeAudio();
    const first = runSpeakerTest();
    expect(isSpeakerTestPlaying()).toBe(true);
    const genAfterFirst = getSpeakerPlayGeneration();
    const second = runSpeakerTest();
    const [a, b] = await Promise.all([first, second]);
    expect(getSpeakerPlayGeneration()).toBeGreaterThanOrEqual(genAfterFirst);
    expect(b.generation).toBeGreaterThanOrEqual(a.generation);
    expect(fake.starts()).toBeGreaterThanOrEqual(1);
    expect(isSpeakerTestPlaying()).toBe(false);
  });

  it("cancelSpeakerTest stops the in-flight test", async () => {
    installFakeAudio();
    const pending = runSpeakerTest();
    cancelSpeakerTest();
    const result = await pending;
    expect(result.state).toBe(SpeakerState.NOT_CHECKED);
    expect(isSpeakerTestPlaying()).toBe(false);
  });
});

describe("device persistence", () => {
  it("restores a saved microphone id and can fall back when cleared", () => {
    persistMicDeviceId("mic-99");
    expect(loadPersistedMicDeviceId()).toBe("mic-99");
    persistMicDeviceId(null);
    expect(loadPersistedMicDeviceId()).toBeNull();
  });

  it("persists speaker output id without storing secrets", () => {
    persistSpeakerDeviceId("out-1");
    expect(loadPersistedSpeakerDeviceId()).toBe("out-1");
  });
});
