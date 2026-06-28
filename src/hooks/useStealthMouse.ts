import { useEffect, useCallback } from "react";
import {
  applyStealthToElement,
  removeStealthFromElement,
} from "@/lib/overlay/screenCaptureEvasion";

// ─────────────────────────────────────────────────────────────────
// useStealthMouse
// Applies capture-evasion dataset flag to the overlay element.
// The overlay lives in a separate portal (#overlay-root), so
// host-page scripts cannot observe mousemove events inside it.
// ─────────────────────────────────────────────────────────────────

export function useStealthMouse(
  elementRef: React.RefObject<HTMLElement>,
  isStealthActive: boolean
) {
  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;

    if (isStealthActive) {
      applyStealthToElement(el);
    } else {
      removeStealthFromElement(el);
    }
  }, [elementRef, isStealthActive]);

  const enableStealth = useCallback(() => {
    const el = elementRef.current;
    if (el) applyStealthToElement(el);
  }, [elementRef]);

  const disableStealth = useCallback(() => {
    const el = elementRef.current;
    if (el) removeStealthFromElement(el);
  }, [elementRef]);

  return { enableStealth, disableStealth };
}
