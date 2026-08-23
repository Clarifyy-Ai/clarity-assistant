/**
 * Enumerate audio output devices and play a short test tone.
 * One controlled playback at a time — rapid clicks cannot overlap.
 */

import type { AudioDevice } from "@/types/audio.types";
import { SpeakerState } from "@/lib/audio/precheckStates";
import { supportsOutputDeviceSelection } from "@/lib/audio/micDevicePersistence";

export type SpeakerTestResult = {
  state: SpeakerState;
  started: boolean;
  generation: number;
};

type HtmlAudioWithSink = HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> };

let playGeneration = 0;
let activeGeneration = 0;
let speakerCtx: AudioContext | null = null;
let speakerAudio: HTMLAudioElement | null = null;
let activeOsc: OscillatorNode | null = null;
let activeGain: GainNode | null = null;
let playing = false;
let cancelCurrent: (() => void) | null = null;

export function isSpeakerTestPlaying(): boolean {
  return playing;
}

export function getSpeakerPlayGeneration(): number {
  return playGeneration;
}

function getAudioContextCtor(): typeof AudioContext | null {
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ||
    null
  );
}

function getOrCreateSpeakerContext(): AudioContext {
  const AudioCtx = getAudioContextCtor();
  if (!AudioCtx) {
    throw new Error("AudioContext is not supported");
  }
  if (!speakerCtx || speakerCtx.state === "closed") {
    speakerCtx = new AudioCtx();
  }
  return speakerCtx;
}

function getOrCreateSpeakerAudio(): HTMLAudioElement {
  if (!speakerAudio) {
    speakerAudio = new Audio();
  }
  return speakerAudio;
}

function stopActiveGraph(): void {
  try {
    activeOsc?.stop();
  } catch {
    // already stopped
  }
  try {
    activeOsc?.disconnect();
    activeGain?.disconnect();
  } catch {
    // ignore
  }
  activeOsc = null;
  activeGain = null;
  if (speakerAudio) {
    try {
      speakerAudio.pause();
      speakerAudio.srcObject = null;
    } catch {
      // ignore
    }
  }
}

export function cancelSpeakerTest(): void {
  activeGeneration += 1;
  cancelCurrent?.();
  cancelCurrent = null;
  stopActiveGraph();
  playing = false;
}

export async function disposeSpeakerTestResources(): Promise<void> {
  cancelSpeakerTest();
  if (speakerAudio) {
    speakerAudio.srcObject = null;
    speakerAudio = null;
  }
  if (speakerCtx && speakerCtx.state !== "closed") {
    await speakerCtx.close().catch(() => {});
  }
  speakerCtx = null;
}

export async function enumerateAudioOutputDevices(): Promise<AudioDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];

  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === "audiooutput")
    .map((d, i) => ({
      deviceId: d.deviceId,
      label: d.label || `Speaker ${i + 1}`,
      kind: "audiooutput" as const,
      isDefault: d.deviceId === "default" || i === 0,
    }));
}

function isPlaybackBlocked(err: unknown): boolean {
  const name =
    err && typeof err === "object" && "name" in err
      ? String((err as { name?: string }).name)
      : "";
  return name === "NotAllowedError" || name === "NotSupportedError";
}

/**
 * Play a short 880Hz beep (~0.35s). Cancels any in-flight playback first.
 * Uses setSinkId when supported. Does not call remote APIs.
 */
export async function runSpeakerTest(deviceId?: string | null): Promise<SpeakerTestResult> {
  cancelSpeakerTest();
  const generation = ++playGeneration;
  activeGeneration = generation;
  playing = true;

  const AudioCtx = getAudioContextCtor();
  if (!AudioCtx) {
    playing = false;
    return { state: SpeakerState.DEVICE_UNAVAILABLE, started: false, generation };
  }

  let settled = false;
  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, ms);
      cancelCurrent = () => {
        window.clearTimeout(timer);
        resolve();
      };
    });

  try {
    const ctx = getOrCreateSpeakerContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    if (generation !== activeGeneration) {
      return { state: SpeakerState.NOT_CHECKED, started: false, generation };
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    osc.connect(gain);
    activeOsc = osc;
    activeGain = gain;

    const canRoute =
      Boolean(deviceId) && supportsOutputDeviceSelection();

    if (canRoute) {
      const dest = ctx.createMediaStreamDestination();
      gain.connect(dest);
      const audio = getOrCreateSpeakerAudio();
      audio.srcObject = dest.stream;
      try {
        await (audio as HtmlAudioWithSink).setSinkId?.(deviceId as string);
      } catch {
        // Default output if sink switch fails.
      }
      await audio.play();
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      osc.stop(ctx.currentTime + 0.4);
      await wait(450);
    } else {
      gain.connect(ctx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      osc.stop(ctx.currentTime + 0.4);
      await wait(450);
    }

    if (generation !== activeGeneration) {
      return { state: SpeakerState.NOT_CHECKED, started: false, generation };
    }
    settled = true;
    return { state: SpeakerState.READY, started: true, generation };
  } catch (err) {
    if (generation !== activeGeneration) {
      return { state: SpeakerState.NOT_CHECKED, started: false, generation };
    }
    if (isPlaybackBlocked(err)) {
      return { state: SpeakerState.PLAYBACK_BLOCKED, started: false, generation };
    }
    return { state: SpeakerState.ERROR, started: false, generation };
  } finally {
    if (generation === activeGeneration) {
      stopActiveGraph();
      playing = false;
      cancelCurrent = null;
    }
    if (!settled && generation === activeGeneration) {
      playing = false;
    }
  }
}

/** Backward-compatible boolean wrapper. */
export async function playSpeakerTestTone(deviceId?: string | null): Promise<boolean> {
  const result = await runSpeakerTest(deviceId);
  return result.state === SpeakerState.READY;
}
