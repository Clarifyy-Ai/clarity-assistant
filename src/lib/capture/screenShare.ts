// src/lib/capture/screenShare.ts — Screen-share helpers with privacy capture

/**
 * Screen-share helpers that keep the overlay out of shared video.
 *
 * Strategy (in order of preference):
 *   1. Element Capture  — `RestrictionTarget.fromElement` + `track.restrictTo()`
 *      Captures ONLY the strict DOM subtree of targetElement.
 *   2. Region Capture   — `CropTarget.fromElement` + `track.cropTo()`
 *      Crops the video stream to the bounding rect of targetElement.
 *
 * Both use privacy-preserving `getDisplayMedia` hints so the browser
 * picker defaults to "This Tab" rather than "Entire Screen".
 *
 * NOTE: These APIs are Chrome 104+ (Region) / Chrome 116+ (Element).
 * Firefox and Safari will fall back gracefully to a plain tab share.
 */

// ── Type augmentation for experimental APIs ──────────────────────────────────

declare global {
  interface MediaStreamTrack {
    restrictTo?(target: RestrictionTarget): Promise<void>;
    cropTo?(target: CropTarget): Promise<void>;
  }
}

interface RestrictionTarget {
  /* opaque handle */ _brand: "RestrictionTarget";
}
interface RestrictionTargetConstructor {
  fromElement(element: Element): Promise<RestrictionTarget>;
}

interface CropTarget {
  /* opaque handle */ _brand: "CropTarget";
}
interface CropTargetConstructor {
  fromElement(element: Element): Promise<CropTarget>;
}

declare const RestrictionTarget: RestrictionTargetConstructor | undefined;
declare const CropTarget: CropTargetConstructor | undefined;

// ── Shared getDisplayMedia constraints ──────────────────────────────────────

function getDisplayMediaConstraints(): DisplayMediaStreamOptions {
  return {
    video: {
      // @ts-ignore — Chrome-only hints not yet in TS lib
      displaySurface: "browser",
    },
    audio: false,
    // @ts-ignore — Chrome screen-sharing privacy controls (M107+)
    selfBrowserSurface:    "exclude",
    monitorTypeSurfaces:   "exclude",
    surfaceSwitching:      "include",
    systemAudio:           "exclude",
  } as any;
}

// ── 1. Element Capture ───────────────────────────────────────────────────────

export async function startTabShareElementCapture(
  targetElement: HTMLElement
): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getDisplayMedia(
    getDisplayMediaConstraints()
  );

  const [track] = stream.getVideoTracks();

  if (
    typeof RestrictionTarget !== "undefined" &&
    typeof track.restrictTo === "function"
  ) {
    try {
      const target = await RestrictionTarget.fromElement(targetElement);
      await track.restrictTo(target);
      console.info("[screenShare] Element Capture active — overlay excluded.");
      return stream;
    } catch (err) {
      console.warn("[screenShare] Element Capture failed, trying Region Capture:", err);
    }
  }

  return applyRegionCapture(stream, track, targetElement);
}

// ── 2. Region Capture ────────────────────────────────────────────────────────

export async function startTabShareRegionCapture(
  targetElement: HTMLElement
): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getDisplayMedia(
    getDisplayMediaConstraints()
  );

  const [track] = stream.getVideoTracks();
  return applyRegionCapture(stream, track, targetElement);
}

// ── Shared Region Capture helper ─────────────────────────────────────────────

async function applyRegionCapture(
  stream: MediaStream,
  track: MediaStreamTrack,
  targetElement: HTMLElement
): Promise<MediaStream> {
  if (
    typeof CropTarget !== "undefined" &&
    typeof track.cropTo === "function"
  ) {
    try {
      const cropTarget = await CropTarget.fromElement(targetElement);
      await track.cropTo(cropTarget);
      console.info("[screenShare] Region Capture active — overlay cropped out.");
    } catch (err) {
      console.warn("[screenShare] Region Capture failed — returning uncropped stream:", err);
    }
  } else {
    console.info("[screenShare] Region Capture not supported — returning full tab stream.");
  }
  return stream;
}

// ── Convenience helpers ──────────────────────────────────────────────────────

export async function startBestTabShare(
  targetElement: HTMLElement
): Promise<MediaStream> {
  return startTabShareElementCapture(targetElement);
}

export async function startTabShareBestEffort(
  targetElement: Element
): Promise<MediaStream> {
  return startTabShareElementCapture(targetElement as HTMLElement);
}

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
