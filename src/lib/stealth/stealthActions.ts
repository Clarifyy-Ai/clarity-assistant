import { useOverlayStore } from "@/store/overlayStore";
import { useUIStore } from "@/store/uiStore";

export function setAppStealthMode(enabled: boolean) {
  useOverlayStore.getState().setStealthMode(enabled);
  useUIStore.getState().setStealthMode(enabled);
}

export function toggleAppStealthMode() {
  const next = !useOverlayStore.getState().is_stealth_mode;
  setAppStealthMode(next);
}

export function syncStealthFromOverlay() {
  const overlayVal = useOverlayStore.getState().is_stealth_mode;
  useUIStore.getState().setStealthMode(overlayVal);
}
