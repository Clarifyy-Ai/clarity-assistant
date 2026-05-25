import type { OverlayPosition } from "@/store/overlayStore";

// ─────────────────────────────────────────────────────────────────
// Stealth Mouse Handler
// Manages drag-to-reposition overlay and proctor-safe edge-snapping.
// The overlay must never appear as a suspicious floating window —
// it can be snapped to screen edges for minimal visual footprint.
// ─────────────────────────────────────────────────────────────────

export interface DragState {
  isDragging: boolean;
  startX: number;
  startY: number;
  startLeft: number;
  startTop: number;
}

export type SnapEdge =
  | "none"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "top"
  | "bottom"
  | "left"
  | "right";

export interface SnapConfig {
  enabled: boolean;
  threshold: number; // px — how close to edge triggers snap
  margin: number; // px — distance from edge when snapped
}

const DEFAULT_SNAP: SnapConfig = {
  enabled: true,
  threshold: 40,
  margin: 12,
};

// ─────────────────────────────────────────────────────────────────
// Drag handler — attach to overlay element (mouse)
// Returns a cleanup function.
// ─────────────────────────────────────────────────────────────────

export function createDragHandler(
  overlayEl: HTMLElement,
  onPositionChange: (pos: OverlayPosition) => void,
  snapConfig: SnapConfig = DEFAULT_SNAP
): () => void {
  let dragState: DragState = {
    isDragging: false,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
  };

  let prevUserSelect = "";
  let prevCursor = "";
  let rafId: number | null = null;

  function applyImmediatePosition(x: number, y: number) {
    if (rafId != null) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      overlayEl.style.left = `${x}px`;
      overlayEl.style.top = `${y}px`;
    });
  }

  function onMouseDown(e: MouseEvent): void {
    // Only drag on the handle area (data-drag-handle attribute)
    const target = e.target as HTMLElement | null;
    if (!target?.closest("[data-drag-handle]")) return;

    e.preventDefault();

    const rect = overlayEl.getBoundingClientRect();
    dragState = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: rect.left,
      startTop: rect.top,
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keydown", onKeyDown, true);

    // Disable text selection + give visual feedback
    prevUserSelect = document.body.style.userSelect;
    prevCursor = overlayEl.style.cursor;
    document.body.style.userSelect = "none";
    overlayEl.style.transition = "none";
    overlayEl.style.cursor = "grabbing";
  }

  function onMouseMove(e: MouseEvent): void {
    if (!dragState.isDragging) return;

    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const ow = overlayEl.offsetWidth;
    const oh = overlayEl.offsetHeight;

    let newX = dragState.startLeft + dx;
    let newY = dragState.startTop + dy;

    // Clamp to viewport
    newX = Math.max(0, Math.min(vw - ow, newX));
    newY = Math.max(0, Math.min(vh - oh, newY));

    applyImmediatePosition(newX, newY);
  }

  function finishDrag(finalX: number, finalY: number) {
    overlayEl.style.cursor = prevCursor;
    overlayEl.style.transition = "";

    // Apply edge snapping
    if (snapConfig.enabled) {
      const snapped = computeSnapPosition(
        finalX,
        finalY,
        overlayEl.offsetWidth,
        overlayEl.offsetHeight,
        snapConfig
      );
      finalX = snapped.x;
      finalY = snapped.y;

      overlayEl.style.transition = "left 0.15s ease, top 0.15s ease";
      overlayEl.style.left = `${finalX}px`;
      overlayEl.style.top = `${finalY}px`;
    }

    onPositionChange({ x: finalX, y: finalY });
  }

  function onMouseUp(): void {
    if (!dragState.isDragging) return;
    dragState.isDragging = false;

    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.removeEventListener("keydown", onKeyDown, true);

    document.body.style.userSelect = prevUserSelect;

    const rect = overlayEl.getBoundingClientRect();
    finishDrag(rect.left, rect.top);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (!dragState.isDragging) return;
    if (e.key !== "Escape") return;

    // Cancel drag and revert to original position
    e.preventDefault();
    e.stopPropagation();

    dragState.isDragging = false;

    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.removeEventListener("keydown", onKeyDown, true);

    document.body.style.userSelect = prevUserSelect;
    overlayEl.style.cursor = prevCursor;
    overlayEl.style.transition = "left 0.15s ease, top 0.15s ease";

    applyImmediatePosition(dragState.startLeft, dragState.startTop);
    onPositionChange({ x: dragState.startLeft, y: dragState.startTop });
  }

  overlayEl.addEventListener("mousedown", onMouseDown);

  // Return cleanup function
  return () => {
    overlayEl.removeEventListener("mousedown", onMouseDown);
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.removeEventListener("keydown", onKeyDown, true);
    if (rafId != null) cancelAnimationFrame(rafId);
  };
}

// ─────────────────────────────────────────────────────────────────
// Touch drag support (tablet candidates)
// Returns a cleanup function.
// ─────────────────────────────────────────────────────────────────

export function createTouchDragHandler(
  overlayEl: HTMLElement,
  onPositionChange: (pos: OverlayPosition) => void,
  snapConfig: SnapConfig = DEFAULT_SNAP
): () => void {
  let isDragging = false;
  let startTouchX = 0;
  let startTouchY = 0;
  let startLeft = 0;
  let startTop = 0;

  function onTouchStart(e: TouchEvent): void {
    const target = e.target as HTMLElement | null;
    if (!target?.closest("[data-drag-handle]")) return;

    const touch = e.touches[0];
    if (!touch) return;
    const rect = overlayEl.getBoundingClientRect();

    isDragging = true;
    startTouchX = touch.clientX;
    startTouchY = touch.clientY;
    startLeft = rect.left;
    startTop = rect.top;
  }

  function onTouchMove(e: TouchEvent): void {
    if (!isDragging) return;

    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;

    const dx = touch.clientX - startTouchX;
    const dy = touch.clientY - startTouchY;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const ow = overlayEl.offsetWidth;
    const oh = overlayEl.offsetHeight;

    const newX = Math.max(0, Math.min(vw - ow, startLeft + dx));
    const newY = Math.max(0, Math.min(vh - oh, startTop + dy));

    overlayEl.style.left = `${newX}px`;
    overlayEl.style.top = `${newY}px`;
  }

  function onTouchEnd(): void {
    if (!isDragging) return;
    isDragging = false;

    const rect = overlayEl.getBoundingClientRect();

    let finalX = rect.left;
    let finalY = rect.top;

    if (snapConfig.enabled) {
      const snapped = computeSnapPosition(
        finalX,
        finalY,
        overlayEl.offsetWidth,
        overlayEl.offsetHeight,
        snapConfig
      );
      finalX = snapped.x;
      finalY = snapped.y;

      overlayEl.style.transition = "left 0.15s ease, top 0.15s ease";
      overlayEl.style.left = `${finalX}px`;
      overlayEl.style.top = `${finalY}px`;
    }

    onPositionChange({ x: finalX, y: finalY });
  }

  overlayEl.addEventListener("touchstart", onTouchStart, { passive: true });
  overlayEl.addEventListener("touchmove", onTouchMove, { passive: false });
  overlayEl.addEventListener("touchend", onTouchEnd);

  return () => {
    overlayEl.removeEventListener("touchstart", onTouchStart);
    overlayEl.removeEventListener("touchmove", onTouchMove);
    overlayEl.removeEventListener("touchend", onTouchEnd);
  };
}

// ─────────────────────────────────────────────────────────────────
// Edge snapping logic
// ─────────────────────────────────────────────────────────────────

export function computeSnapPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  config: SnapConfig
): OverlayPosition {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const { threshold, margin } = config;

  let snapX = x;
  let snapY = y;

  // Horizontal snap
  if (x < threshold) snapX = margin;
  else if (x + width > vw - threshold) snapX = Math.max(margin, vw - width - margin);

  // Vertical snap
  if (y < threshold) snapY = margin;
  else if (y + height > vh - threshold) snapY = Math.max(margin, vh - height - margin);

  // Final clamp inside viewport (safety)
  snapX = Math.max(0, Math.min(vw - width, snapX));
  snapY = Math.max(0, Math.min(vh - height, snapY));

  return { x: snapX, y: snapY };
}

export function getSnapEdge(
  x: number,
  y: number,
  width: number,
  height: number
): SnapEdge {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const nearLeft = x < 50;
  const nearRight = x + width > vw - 50;
  const nearTop = y < 50;
  const nearBottom = y + height > vh - 50;

  if (nearTop && nearLeft) return "top-left";
  if (nearTop && nearRight) return "top-right";
  if (nearBottom && nearLeft) return "bottom-left";
  if (nearBottom && nearRight) return "bottom-right";
  if (nearTop) return "top";
  if (nearBottom) return "bottom";
  if (nearLeft) return "left";
  if (nearRight) return "right";
  return "none";
}

// ─────────────────────────────────────────────────────────────────
// Corner-snap layout presets (screen-edge placement only — not concealment)
// ─────────────────────────────────────────────────────────────────

export function getProctorSafePosition(
  overlayWidth: number,
  overlayHeight: number
): OverlayPosition {
  // Bottom-right corner — below typical screen-sharing camera zone
  const x = window.innerWidth - overlayWidth - 16;
  const y = window.innerHeight - overlayHeight - 16;
  return { x, y };
}

export function getDefaultPosition(): OverlayPosition {
  // Parakeet-style: pinned to the top-center of the viewport
  if (typeof window === "undefined") return { x: 0, y: 16 };
  const width = 560;
  const x = Math.max(16, Math.round((window.innerWidth - width) / 2));
  return { x, y: 16 };
}
