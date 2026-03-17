import { useEffect, useRef, useCallback } from "react";
import {
  applyStealthToElement,
  removeStealthFromElement,
} from "@/lib/overlay/screenCaptureEvasion";

// ─────────────────────────────────────────────────────────────────
// useStealthMouse
// Applies pointer-events:none + capture evasion to the overlay.
// Registers a global mousemove suppressor when stealth is active.
// ─────────────────────────────────────────────────────────────────

export function useStealthMouse(
  elementRef: React.RefObject<HTMLElement>,
  isStealthActive: boolean
) {
  const suppressorRef = useRef<((e: MouseEvent) => void) | null>(null);

  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;

    if (isStealthActive) {
      applyStealthToElement(el);

      // Suppress mousemove events that could be detected by a host page
      const suppressor = (e: MouseEvent) => {
        if (isInsideElement(e, el)) {
          e.stopPropagation();
        }
      };

      suppressorRef.current = suppressor;
      window.addEventListener("mousemove", suppressor, { capture: true });

    } else {
      removeStealthFromElement(el);

      if (suppressorRef.current) {
        window.removeEventListener("mousemove", suppressorRef.current, { capture: true });
        suppressorRef.current = null;
      }
    }

    return () => {
      if (suppressorRef.current) {
        window.removeEventListener("mousemove", suppressorRef.current, { capture: true });
      }
    };
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

function isInsideElement(e: MouseEvent, el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  return (
    e.clientX >= rect.left &&
    e.clientX <= rect.right &&
    e.clientY >= rect.top  &&
    e.clientY <= rect.bottom
  );
}
