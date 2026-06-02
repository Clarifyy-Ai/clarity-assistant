// ✅ FIX P4-A: Cache enumerateDevices results for 30s to avoid repeated permission prompts.

import type { AudioDevice } from "@/types/audio.types";

const CACHE_TTL_MS = 30_000;

let cachedDevices: AudioDevice[] | null = null;
let cacheExpiresAt = 0;
let inflight: Promise<AudioDevice[]> | null = null;

async function enumerateFresh(): Promise<AudioDevice[]> {
  const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  tempStream.getTracks().forEach((t) => t.stop());

  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === "audioinput")
    .map((d, i) => ({
      deviceId: d.deviceId,
      label: d.label || `Microphone ${i + 1}`,
      kind: "audioinput" as const,
      isDefault: d.deviceId === "default" || i === 0,
    }));
}

export function invalidateAudioDeviceCache(): void {
  cachedDevices = null;
  cacheExpiresAt = 0;
  inflight = null;
}

export async function getCachedAudioDevices(
  forceRefresh = false,
): Promise<AudioDevice[]> {
  const now = Date.now();
  if (!forceRefresh && cachedDevices && now < cacheExpiresAt) {
    return cachedDevices;
  }

  if (!inflight) {
    inflight = enumerateFresh()
      .then((devices) => {
        cachedDevices = devices;
        cacheExpiresAt = Date.now() + CACHE_TTL_MS;
        return devices;
      })
      .finally(() => {
        inflight = null;
      });
  }

  return inflight;
}
