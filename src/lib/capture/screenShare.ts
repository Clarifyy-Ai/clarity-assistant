/**
 * screenShare.ts — Tab-restricted screen sharing helpers.
 *
 * These utilities start a screen-capture stream that is RESTRICTED to the
 * main application content element so that the Clarify AI overlay is never
 * visible to remote viewers when the user shares "This Tab" in Zoom, Meet,
 * Teams, etc.
 *
 * Two approaches are provided (in order of preference):
 *
 * 1. Element Capture (Chrome 132+) — `startTabShareElementCapture`
 *    Uses `RestrictionTarget.fromElement` + `track.restrictTo` to hard-exclude
 *    every DOM subtree that is NOT the target element. The overlay is completely
 *    invisible even if it sits on top of the target element.
 *
 * 2. Region Capture (Chrome 104+) — `startTabShareRegionCapture`
 *    Uses `CropTarget.fromElement` + `track.cropTo` to crop the captured video
 *    to the bounding box of the target element. The overlay is excluded as long
 *    as it lives outside that bounding box (e.g. a fixed-position PiP window).
 *
 * Both helpers pass privacy-preserving `getDisplayMedia` hints that default the
 * browser picker to "This Tab" and de-emphasise "Entire Screen" / "Monitor".
 *
 * Usage — call `startTabShareElementCapture` first; fall back to
 * `startTabShareRegionCapture` if it throws; fall back to plain
 * `getDisplayMedia` as a last resort.
 *
 * The `targetElement` should be the main app root (e.g. `document.getElementById('root')`)
 * or a dedicated `#app-share-root` element that wraps only the content you
 * want remote viewers to see.
 *
 * IMPORTANT: These APIs are Chrome-only and behind flags in some Chrome
 * versions. Always wrap calls in try/catch and gracefully degrade.
 */

// ─── Browser API type augmentation ────────────────────────────────────────────
// Element Capture and Region Capture are experimental; TypeScript's lib.dom
// doesn't include them yet.

declare global {
  interface MediaStreamTrack {
    /** Element Capture — Chrome 132+ */
    restrictTo(target: unknown): Promise<void>;
    /** Region Capture — Chrome 104+ */
    cropTo(target: unknown): Promise<void>;
  }
}

interface RestrictionTargetStatic {
  fromElement(element: Element): Promise<unknown>;
}

interface CropTargetStatic {
  fromElement(element: Element): Promise<unknown>;
}

declare const RestrictionTarget: RestrictionTargetStatic;
declare const CropTarget: CropTargetStatic;

// ─── Privacy-preserving getDisplayMedia constraints ────────────────────────────
// These hints tell Chrome to:
//   - Default the picker to "This Tab" (displaySurface: 'browser')
//   - Exclude the page's own tab from the share candidates (selfBrowserSurface: 'exclude')
//   - Hide monitor-level entries in the picker (monitorTypeSurfaces: 'exclude')
//   - Allow the user to switch surfaces after sharing starts (surfaceSwitching: 'include')

/**
 * Chrome-specific privacy extras that can be spread into any getDisplayMedia
 * call to guide the picker toward "This Tab" and suppress monitor/screen-level
 * entries. These are non-standard and cast to `any` because TypeScript's
 * lib.dom.d.ts doesn't include them yet.
 */
export const DISPLAY_MEDIA_PRIVACY_EXTRAS = {
  selfBrowserSurface: "exclude",
  monitorTypeSurfaces: "exclude",
  surfaceSwitching: "include",
} as const;

const DISPLAY_MEDIA_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    displaySurface: "browser",
  } as MediaTrackConstraints,
  audio: false,
  // Chrome-specific privacy hints (cast to any — not in the TS types yet)
  ...(DISPLAY_MEDIA_PRIVACY_EXTRAS as any),
};

/**
 * startTabShareElementCapture
 *
 * Starts a tab share stream and applies Element Capture so that ONLY the
 * `targetElement` subtree is sent to remote viewers. The Clarify AI overlay
 * (which lives in a separate DOM subtree / PiP window) is completely excluded.
 *
 * Requires Chrome 132+. Throws `ElementCaptureNotSupported` if the browser
 * doesn't support `RestrictionTarget`.
 */
export async function startTabShareElementCapture(
  targetElement: HTMLElement
): Promise<MediaStream> {
  if (
    typeof RestrictionTarget === "undefined" ||
    typeof RestrictionTarget.fromElement !== "function"
  ) {
    throw new Error("ElementCaptureNotSupported");
  }

  const stream = await (navigator.mediaDevices as any).getDisplayMedia(
    DISPLAY_MEDIA_CONSTRAINTS
  );

  const [videoTrack] = stream.getVideoTracks();
  if (!videoTrack) return stream;

  try {
    const restrictionTarget = await RestrictionTarget.fromElement(targetElement);
    await videoTrack.restrictTo(restrictionTarget);
  } catch (err) {
    // restrictTo failed — stop the stream and re-throw so the caller can fall
    // back to Region Capture.
    stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    throw err;
  }

  return stream;
}

/**
 * startTabShareRegionCapture
 *
 * Starts a tab share stream and applies Region Capture to crop the captured
 * video to the bounding box of `targetElement`. Content outside the bounding
 * box (e.g. a fixed-position overlay) is cropped out and not visible to
 * remote viewers.
 *
 * Requires Chrome 104+. Throws `RegionCaptureNotSupported` if the browser
 * doesn't support `CropTarget`.
 */
export async function startTabShareRegionCapture(
  targetElement: HTMLElement
): Promise<MediaStream> {
  if (
    typeof CropTarget === "undefined" ||
    typeof CropTarget.fromElement !== "function"
  ) {
    throw new Error("RegionCaptureNotSupported");
  }

  const stream = await (navigator.mediaDevices as any).getDisplayMedia(
    DISPLAY_MEDIA_CONSTRAINTS
  );

  const [videoTrack] = stream.getVideoTracks();
  if (!videoTrack) return stream;

  try {
    const cropTarget = await CropTarget.fromElement(targetElement);
    await videoTrack.cropTo(cropTarget);
  } catch (err) {
    stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    throw err;
  }

  return stream;
}

/**
 * startTabShareBestEffort
 *
 * Convenience helper that tries Element Capture → Region Capture → plain
 * getDisplayMedia in sequence, returning the first successful stream.
 * This is the recommended entry point for callers.
 */
export async function startTabShareBestEffort(
  targetElement: HTMLElement
): Promise<MediaStream> {
  // 1. Element Capture (best — hard-excludes overlay)
  try {
    return await startTabShareElementCapture(targetElement);
  } catch {
    // Element Capture not supported or failed
  }

  // 2. Region Capture (good — crops to target bounding box)
  try {
    return await startTabShareRegionCapture(targetElement);
  } catch {
    // Region Capture not supported or failed
  }

  // 3. Plain getDisplayMedia with privacy hints (fallback)
  return (navigator.mediaDevices as any).getDisplayMedia(
    DISPLAY_MEDIA_CONSTRAINTS
  );
}

// ─── System audio capture (tab-share audio only) ──────────────────────────────

/**
 * captureSystemAudioViaTabShare
 *
 * Starts a `getDisplayMedia` stream specifically for capturing system / tab
 * audio (e.g. the interviewer's voice from a browser-based video call).
 * Applies the same privacy hints as the video-share helpers so the picker
 * defaults to "This Tab" and de-emphasises monitor-level surfaces.
 *
 * The minimal video track is discarded immediately — only the audio track is
 * returned. Throws if the user denies permission or if no audio track is
 * present (i.e. the user forgot to check "Share audio").
 *
 * This is the single entry point that ALL system-audio capture call sites
 * should use so that privacy hints are consistently applied.
 */
export async function captureSystemAudioViaTabShare(audioConstraints?: MediaTrackConstraints): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("getDisplayMedia not supported in this browser");
  }

  const constraints = {
    audio: audioConstraints ?? {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      sampleRate: 16000,
    },
    video: {
      width: { ideal: 1 },
      height: { ideal: 1 },
    },
    // Privacy hints — guide picker to "This Tab", suppress monitor entries
    ...(DISPLAY_MEDIA_PRIVACY_EXTRAS as any),
  };

  const stream = await (navigator.mediaDevices as any).getDisplayMedia(constraints);

  // Discard the video track — we only need audio
  stream.getVideoTracks().forEach((t: MediaStreamTrack) => t.stop());

  if (stream.getAudioTracks().length === 0) {
    throw new Error(
      "No audio track detected. Please check 'Share audio' / 'Share tab audio' in the picker."
    );
  }

  return stream;
}
