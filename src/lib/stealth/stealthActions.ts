// src/lib/stealth/stealthActions.ts

import { useOverlayStore } from "@/store/overlayStore";
import { useUIStore } from "@/store/uiStore";
import { DISCRETE_UI_LABELS_ENABLED } from "@/lib/compliance/featureGates";

/**
 * Toggle discrete UI labels (nav/page titles only).
 * Does NOT enable screen-capture exclusion or overlay hiding.
 */
export async function setAppStealthMode(enabled: boolean) {
  if (!DISCRETE_UI_LABELS_ENABLED && enabled) {
    console.warn("[discrete-ui] Discrete UI labels are disabled by compliance policy.");
    return;
  }

  useOverlayStore.getState().setStealthMode(enabled);
  useUIStore.getState().setStealthMode(enabled);
}

export async function toggleAppStealthMode() {
  const next = !useOverlayStore.getState().is_stealth_mode;
  await setAppStealthMode(next);
}

export function syncStealthFromOverlay() {
  const overlayVal = useOverlayStore.getState().is_stealth_mode;
  useUIStore.getState().setStealthMode(overlayVal);
}
