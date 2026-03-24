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
 * Capture system (tab) audio via getDisplayMedia with audio enabled.
 * Used by useSystemAudio, audioCapture, and systemAudioCapture.
 */
export async function captureSystemAudioViaTabShare(
  audioConstraints?: MediaTrackConstraints
): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      // @ts-ignore
      displaySurface: "browser",
    },
    audio: audioConstraints ?? true,
    // @ts-ignore
    selfBrowserSurface: "exclude",
    monitorTypeSurfaces: "exclude",
    surfaceSwitching: "include",
    systemAudio: "include",
  } as any);

  // Strip the video track — caller only needs audio
  stream.getVideoTracks().forEach((t) => t.stop());

  if (stream.getAudioTracks().length === 0) {
    throw new Error("No audio track — user may not have checked 'Share audio'.");
  }

  return new MediaStream(stream.getAudioTracks());
}
