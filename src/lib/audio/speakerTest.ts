/**
 * Enumerate audio output devices and play a short test tone.
 * Used by Pre-Session Setup (BUG-13) — no camera checks.
 */

import type { AudioDevice } from "@/types/audio.types";

export async function enumerateAudioOutputDevices(): Promise<AudioDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];

  // Labels for outputs often require a prior mic permission grant.
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

/**
 * Play a short 880Hz beep (~0.35s). Uses setSinkId when supported.
 * Returns true if playback started without throwing.
 */
export async function playSpeakerTestTone(
  deviceId?: string | null,
): Promise<boolean> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return false;

  const ctx = new AudioCtx();
  try {
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    // Prefer routing via HTMLAudioElement + setSinkId when a device is chosen.
    if (deviceId && typeof (HTMLMediaElement.prototype as HTMLMediaElement & { setSinkId?: unknown }).setSinkId === "function") {
      const dest = ctx.createMediaStreamDestination();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.15;
      osc.connect(gain);
      gain.connect(dest);

      const audio = new Audio();
      audio.srcObject = dest.stream;
      try {
        await (audio as HTMLMediaElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(deviceId);
      } catch {
        // Fall through to default output if sink switch fails
      }
      await audio.play();
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      osc.stop(ctx.currentTime + 0.4);
      await new Promise((r) => setTimeout(r, 450));
      audio.pause();
      audio.srcObject = null;
      return true;
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.stop(ctx.currentTime + 0.4);
    await new Promise((r) => setTimeout(r, 450));
    return true;
  } catch {
    return false;
  } finally {
    void ctx.close().catch(() => {});
  }
}
