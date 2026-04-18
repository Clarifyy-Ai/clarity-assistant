// System audio capture (Chrome / Edge only)
// NOTE: User MUST choose "Share audio" in the share picker.
import { captureSystemAudioViaTabShare } from "@/lib/capture/tabAudioCapture";

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ ECHO / FEEDBACK LOOP GUARD
//
// If the app uses TTS (or any local audio playback) to read AI answers aloud
// while system audio is being captured, the captured stream WILL include the
// app's own output. The transcription pipeline (Deepgram) will then re-feed
// AI-generated text back into the prompt, causing hallucination loops.
//
// Mitigations (apply at least ONE before enabling TTS during a live session):
//
//   1. Process exclusion (preferred — Electron only)
//      Use `desktopCapturer` with an explicit window/tab source instead of
//      a full-screen capture, and exclude this app's BrowserWindow from the
//      source list. The Chromium tab-capture API on Linux/Windows does not
//      capture audio from windows excluded via `setContentProtection(true)`
//      in many driver configs — verify on each target OS.
//
//   2. Mute mic during TTS playback
//      Wrap TTS playback with:
//        track.enabled = false; await playTTS(); track.enabled = true;
//      This is the simplest, browser-portable fix. The audio track stays
//      open (no re-prompt) but emits silence while the AI is speaking.
//
//   3. Echo cancellation via AudioContext
//      Pipe the system stream + a phase-inverted copy of the TTS output
//      buffer into an AudioWorklet. This requires sample-aligned timing and
//      is fragile — only use if (1) and (2) are unavailable.
//
//   4. Transcript filter (last resort)
//      After Deepgram returns a transcript, fuzzy-match against the most
//      recent AI response and discard high-similarity chunks before they
//      reach the LLM. Brittle — words spoken by a real interviewer that
//      coincidentally overlap will be dropped.
//
// Current implementation does NOT enforce any of these — TTS is disabled by
// default in the live overlay. If/when TTS is added, audit this guard first.
// ─────────────────────────────────────────────────────────────────────────────

export async function startSystemAudioCapture(): Promise<MediaStream> {
  try {
    // Route through the centralised tab-share helper so privacy hints are
    // applied (guides picker to "This Tab", suppresses monitor surfaces).
    return await captureSystemAudioViaTabShare({
      // echoCancellation MUST stay false here — we want raw interviewer audio.
      // Browser AEC would attempt to cancel based on default playback device,
      // which is incorrect for a tab-captured remote-participant stream.
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

/**
 * Convenience helper for callers that play TTS during live sessions.
 * Disables all audio tracks for the duration of the async callback,
 * then re-enables them. Prevents the captured stream from picking up
 * the app's own playback (mitigation #2 above).
 */
export async function withMutedCapture<T>(
  stream: MediaStream | null,
  fn: () => Promise<T>
): Promise<T> {
  const tracks = stream?.getAudioTracks() ?? [];
  tracks.forEach((t) => { t.enabled = false; });
  try {
    return await fn();
  } finally {
    tracks.forEach((t) => { t.enabled = true; });
  }
}
