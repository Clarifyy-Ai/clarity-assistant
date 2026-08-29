// src/lib/capture/tabAudioCapture.ts
// System audio capture via getDisplayMedia — separated to avoid
// module-resolution issues with the declare-global block in screenShare.ts.

import { startTabShareElementCapture } from "./screenShare";

/**
 * Alias used by useSafeTabShare — accepts Element (not just HTMLElement).
 */
export async function startTabShareBestEffort(
  targetElement: Element
): Promise<MediaStream> {
  return startTabShareElementCapture(targetElement as HTMLElement);
}

/**
 * Custom error code thrown when getDisplayMedia returned a stream but no
 * audio track — i.e. the user did not tick "Share audio" / "Share tab audio".
 * Callers (useAudioSession) use this to present a targeted recovery toast.
 */
export const NO_SHARE_AUDIO_ERROR_CODE = "NO_SHARE_AUDIO_TICKED" as const;

export class TabAudioCaptureError extends Error {
  code: typeof NO_SHARE_AUDIO_ERROR_CODE;
  constructor(message: string) {
    super(message);
    this.name = "TabAudioCaptureError";
    this.code = NO_SHARE_AUDIO_ERROR_CODE;
  }
}

/**
 * Capture system (tab) audio via getDisplayMedia with audio enabled.
 * Used by useSystemAudio, audioCapture, and systemAudioCapture.
 *
 * Constraint notes:
 * - `displaySurface: "browser"` is only a HINT; user can still pick a
 *   window or entire screen. We keep it so the picker pre-selects the
 *   tab list, which is the most-common interview surface.
 * - We do NOT set `monitorTypeSurfaces: "exclude"` — that hides the
 *   "Entire screen" option, which on Linux and on Windows + Zoom/Teams
 *   desktop clients is the ONLY surface that delivers meeting audio.
 * - We do NOT set `selfBrowserSurface: "exclude"` per project policy
 *   (memory: P0-2 Stealth Removed).
 */
export async function captureSystemAudioViaTabShare(
  audioConstraints?: MediaTrackConstraints
): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      // @ts-ignore — Chromium-only hint, harmless elsewhere
      displaySurface: "browser",
    },
    audio: audioConstraints ?? true,
    // @ts-ignore — Chromium-only hint
    surfaceSwitching: "include",
    systemAudio: "include",
  } as any);

  // Strip the video track — caller only needs audio
  stream.getVideoTracks().forEach((t) => t.stop());

  if (stream.getAudioTracks().length === 0) {
    // Stop any stragglers so we don't leak a green recording indicator
    stream.getTracks().forEach((t) => t.stop());
    throw new TabAudioCaptureError(
      "No audio track received — the \"Share tab audio\" checkbox wasn't ticked in the share dialog.",
    );
  }

  return new MediaStream(stream.getAudioTracks());
}
