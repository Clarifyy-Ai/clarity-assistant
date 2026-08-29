// ─────────────────────────────────────────────────────────────────
// micCapture.ts
// Minimal microphone capture utility — used in onboarding and tests
// ─────────────────────────────────────────────────────────────────

export async function startMicCapture(
  deviceId?: string | null
): Promise<MediaStream> {
  const constraints: MediaStreamConstraints = {
    audio: deviceId
      ? { deviceId: { exact: deviceId } }
      : { echoCancellation: true, noiseSuppression: true },
    video: false,
  };

  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    // Allow the caller to handle errors or map them centrally
    throw err;
  }
}

export function stopMicCapture(stream: MediaStream | null): void {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
}
