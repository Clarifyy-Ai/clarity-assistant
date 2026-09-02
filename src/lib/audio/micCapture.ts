// ─────────────────────────────────────────────────────────────────
// micCapture.ts
// Minimal microphone capture utility — used in onboarding and tests
// ─────────────────────────────────────────────────────────────────

import { acquireMicrophoneStream } from "@/lib/audio/micPermission";

export async function startMicCapture(
  deviceId?: string | null
): Promise<MediaStream> {
  const result = await acquireMicrophoneStream({ deviceId });
  return result.stream;
}

export function stopMicCapture(stream: MediaStream | null): void {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
}
