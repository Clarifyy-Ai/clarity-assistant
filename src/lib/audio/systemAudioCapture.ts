// System audio capture (Chrome / Edge only)
// NOTE: User MUST choose "Share audio" in the share picker.
import { captureSystemAudioViaTabShare } from "@/lib/capture/tabAudioCapture";

export async function startSystemAudioCapture(): Promise<MediaStream> {
  try {
    // Route through the centralised tab-share helper so privacy hints are
    // applied (guides picker to "This Tab", suppresses monitor surfaces).
    return await captureSystemAudioViaTabShare({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    } as MediaTrackConstraints);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "NotAllowedError") {
      throw new Error("Permission denied. Please allow system audio capture.");
    }
    throw new Error(
      "System audio capture failed: " +
        (err instanceof Error ? err.message : String(err))
    );
  }
}

export function stopSystemAudioCapture(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}
