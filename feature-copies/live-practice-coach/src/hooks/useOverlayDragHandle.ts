import { useEffect, type RefObject } from "react";
import type { OverlayPosition } from "@/store/overlayStore";
import { computeSnapPosition } from "@/lib/overlay/stealthMouse";
import { suppressOverlayGhostClicks } from "@/lib/overlay/ghostClickGuard";

const DRAG_THRESHOLD_PX = 4;

interface UseOverlayDragHandleOptions {
  handleRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  onPositionChange: (pos: OverlayPosition) => void;
  disabled?: boolean;
}

/**
 * Drag the overlay by its header handle using Pointer Events + setPointerCapture.
 * More reliable than delegated mousedown on a parent with pointer-events layering.
 */
export function useOverlayDragHandle({
  handleRef,
  panelRef,
  onPositionChange,
  disabled = false,
}: UseOverlayDragHandleOptions): void {
  useEffect(() => {
    if (disabled) return;

    const handle = handleRef.current;
    const panel = panelRef.current;
    if (!handle || !panel) return;

    let dragging = false;
    let moved = false;
    let pointerId = -1;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    function clampPosition(x: number, y: number): OverlayPosition {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const ow = panel!.offsetWidth || 560;
      const oh = panel!.offsetHeight || 400;
      return {
        x: Math.max(0, Math.min(vw - ow, x)),
        y: Math.max(0, Math.min(vh - oh, y)),
      };
    }

    function onPointerDown(e: PointerEvent): void {
      if (e.button !== 0) return;

      const target = e.target as HTMLElement | null;
      if (!target?.closest("[data-drag-handle]")) return;
      if (target.closest("button, a, input, select, textarea, [role='button'], [data-no-drag]")) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const rect = panel!.getBoundingClientRect();
      dragging = true;
      moved = false;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;

      handle!.setPointerCapture(e.pointerId);
      handle!.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
    }

    function onPointerMove(e: PointerEvent): void {
      if (!dragging || e.pointerId !== pointerId) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) {
        moved = true;
      }
      const next = clampPosition(startLeft + dx, startTop + dy);
      onPositionChange(next);
    }

    function endDrag(e: PointerEvent): void {
      if (!dragging || e.pointerId !== pointerId) return;

      dragging = false;
      if (moved) {
        suppressOverlayGhostClicks();
        e.preventDefault();
      }
      document.body.style.userSelect = "";

      try {
        handle!.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      handle!.style.cursor = "";

      const rect = panel!.getBoundingClientRect();
      const snapped = computeSnapPosition(
        rect.left,
        rect.top,
        panel!.offsetWidth,
        panel!.offsetHeight,
        { enabled: true, threshold: 40, margin: 12 },
      );
      onPositionChange(snapped);
    }

    handle.addEventListener("pointerdown", onPointerDown);
    handle.addEventListener("pointermove", onPointerMove);
    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);

    return () => {
      handle.removeEventListener("pointerdown", onPointerDown);
      handle.removeEventListener("pointermove", onPointerMove);
      handle.removeEventListener("pointerup", endDrag);
      handle.removeEventListener("pointercancel", endDrag);
      document.body.style.userSelect = "";
    };
  }, [disabled, handleRef, panelRef, onPositionChange]);
}
