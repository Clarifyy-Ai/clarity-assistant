// src/lib/audio/tabAudioGuide.ts
//
// Pre-share guidance for tab/system-audio capture.
//
// Replaces the previous non-blocking sonner toast with a real modal
// dialog that BLOCKS until the user confirms. This is critical because
// the OS-level share picker opens within ~100ms of getDisplayMedia()
// and covers any toast, so users were clicking "Share" without ticking
// the "Share tab audio" checkbox, landing in mic-only mode.
//
// API:
//   confirmTabAudioCapture()   — returns Promise<boolean>. Resolves true
//                                when the user clicks "Continue", false
//                                when they click "Skip — mic only" or
//                                close the dialog.
//   acknowledgeTabAudioGuide() — marks the session as acked so future
//                                prompts (within the same session) auto-
//                                resolve true without showing the modal.
//   subscribeTabAudioGuide()   — internal: used by TabAudioGuideHost to
//                                listen for requests. Returns unsub fn.

import { toast } from "sonner";

const TAB_AUDIO_GUIDE_KEY = "clarify:tab_audio_guide_ack_v1";

type GuideListener = (
  resolve: (value: boolean) => void,
) => void;

let listener: GuideListener | null = null;
// Queue any requests that arrive before the host mounts (e.g. fast wizard
// → start path). The host will drain them on mount.
const pending: Array<(value: boolean) => void> = [];

export function subscribeTabAudioGuide(fn: GuideListener): () => void {
  listener = fn;
  // Drain queue
  while (pending.length > 0) {
    const resolve = pending.shift()!;
    fn(resolve);
  }
  return () => {
    if (listener === fn) listener = null;
  };
}

/** Call from pre-session wizard when system audio is enabled. */
export function acknowledgeTabAudioGuide(): void {
  try {
    sessionStorage.setItem(TAB_AUDIO_GUIDE_KEY, "1");
  } catch {
    // ignore private mode
  }
}

function isAcknowledged(): boolean {
  try {
    return sessionStorage.getItem(TAB_AUDIO_GUIDE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Show a blocking modal explaining the "Share tab audio" checkbox.
 * Resolves true when capture may proceed, false when the user opts out.
 *
 * If the host modal is not mounted yet, the request is queued and
 * resolved as soon as the host appears.
 *
 * If the user already acknowledged this session, resolves immediately.
 */
export function confirmTabAudioCapture(): Promise<boolean> {
  if (isAcknowledged()) return Promise.resolve(true);

  return new Promise<boolean>((resolve) => {
    const wrappedResolve = (value: boolean) => {
      if (value) acknowledgeTabAudioGuide();
      resolve(value);
    };

    if (listener) {
      listener(wrappedResolve);
    } else {
      pending.push(wrappedResolve);
      // Fallback safety: if no host appears within 3s, fall back to the
      // old toast + proceed behaviour so we never deadlock a session.
      setTimeout(() => {
        const idx = pending.indexOf(wrappedResolve);
        if (idx !== -1) {
          pending.splice(idx, 1);
          toast.info("Share tab audio", {
            description:
              "When the share dialog opens: pick your interview tab or window, tick \"Share tab audio\", then click Share.",
            duration: 10_000,
          });
          wrappedResolve(true);
        }
      }, 3000);
    }
  });
}
