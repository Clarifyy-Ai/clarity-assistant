// src/lib/stealth/stealthActions.ts

import { useOverlayStore } from "@/store/overlayStore";
import { useUIStore } from "@/store/uiStore";
import {
  enableScreenCaptureBlocker,
  disableScreenCaptureBlocker,
  triggerPanicKill,
} from "@/lib/stealth/screenCaptureBlocker";

/**
 * Core entry point for enabling / disabling stealth mode at the app level.
 * When enabling, we also activate the OS-level screen capture blocker
 * (desktop) and stealth UI labels. When disabling, we fully tear it down.
 */
export async function setAppStealthMode(enabled: boolean) {
  // 1) Update client-side stores (labels, UI state)
  useOverlayStore.getState().setStealthMode(enabled);
  useUIStore.getState().setStealthMode(enabled);

  // 2) Activate / deactivate OS-level blocker (Electron desktop)
  //    In browser-only environments this is a no-op.
  try {
    if (enabled) {
      await enableScreenCaptureBlocker({
        excludeFromCapture: true,
        enableOpacityAutoFade: true,       // 15% fade when mouse leaves
        enableAutoHideOnFocusLoss: true,   // hide when focus moves away
      });
    } else {
      await disableScreenCaptureBlocker();
    }
  } catch (err) {
    console.error("[stealth] setAppStealthMode OS blocker failed:", err);
  }
}

/**
 * Convenience wrapper used by hotkeys (Ctrl+Shift+H) to toggle stealth.
 */
export async function toggleAppStealthMode() {
  const next = !useOverlayStore.getState().is_stealth_mode;
  await setAppStealthMode(next);
}

/**
 * Keep UI store in sync when overlay store changes elsewhere.
 * This does NOT touch the OS-level blocker; use setAppStealthMode()
 * when you actually want to turn stealth on/off.
 */
export function syncStealthFromOverlay() {
  const overlayVal = useOverlayStore.getState().is_stealth_mode;
  useUIStore.getState().setStealthMode(overlayVal);
}

/**
 * Panic button behavior (Chapter 6.2 “Panic Button”):
 * - Instantly kills all overlay windows (no animation)
 * - Disables screen capture blocker
 * - Resets stealth flags
 *
 * Call this from whatever UI handles the panic button action.
 */
export async function panicKillOverlay() {
  try {
    await triggerPanicKill();
  } finally {
    // Ensure stores reflect that stealth is off
    useOverlayStore.getState().setStealthMode(false);
    useUIStore.getState().setStealthMode(false);
  }
}
