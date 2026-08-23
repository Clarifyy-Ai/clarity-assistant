/**
 * Explicit cross-store reset for overlay product sessions.
 * Do not rely on component unmount to prevent Live ↔ Mock leakage.
 */

import { useAudioStore } from "@/store/audioStore";
import { useOverlayStore } from "@/store/overlayStore";
import { useSessionStore } from "@/store/sessionStore";
import { getOverlaySessionAuthority } from "@/store/overlaySessionAuthorityStore";
import { stopBrowserTts } from "@/lib/mock/mockTts";

export type TransientResetOptions = {
  /** When true, also hide the overlay portal. Default true on full teardown. */
  hideOverlay?: boolean;
  /** Stop TTS (mock). Default true. */
  stopTts?: boolean;
  /**
   * When true, mark any in-flight product ownership terminal and clear it.
   * Use for setup soft-clear / cross-product switches before a new begin().
   */
  releaseAuthority?: boolean;
};

/**
 * Clear all session-scoped transient state shared by Live and Mock.
 * Preserves overlay user preferences (persisted partialize).
 */
export function resetTransientOverlaySessionStores(
  options: TransientResetOptions = {},
): void {
  const {
    hideOverlay = true,
    stopTts = true,
    releaseAuthority = false,
  } = options;

  if (releaseAuthority) {
    const auth = getOverlaySessionAuthority();
    if (auth.lifecycle !== "idle" && auth.generation > 0) {
      auth.markTerminal(auth.generation, "CANCELLED");
      auth.clearToIdle(auth.generation);
    }
  }

  if (stopTts) {
    try {
      stopBrowserTts();
    } catch {
      /* ignore */
    }
  }

  const overlay = useOverlayStore.getState();
  overlay.resetSessionState();
  if (hideOverlay) {
    overlay.hideOverlay();
  }

  // Full audio reset stops mic / tab capture / Deepgram clients.
  useAudioStore.getState().resetAudio();

  useSessionStore.getState().resetSession();
}
