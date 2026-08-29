import { useCallback, useRef, useState, type CSSProperties, type PointerEvent } from "react";

export interface UseSwipeActionOptions {
  /** Minimum swipe distance (px) to snap open. Default 60. */
  threshold?: number;
  /** Maximum reveal width (px). Default 72. */
  maxReveal?: number;
  /** Called when the row snaps open. */
  onReveal?: () => void;
  /** Called when the row resets closed. */
  onReset?: () => void;
}

export interface SwipeActionBind {
  onPointerDown: (e: PointerEvent<HTMLElement>) => void;
  onPointerMove: (e: PointerEvent<HTMLElement>) => void;
  onPointerUp: (e: PointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: PointerEvent<HTMLElement>) => void;
  style: CSSProperties;
}

/**
 * Touch-friendly swipe-left reveal for list rows (e.g. delete affordance).
 * Keeps a visible button fallback — swipe is additive, not exclusive.
 */
export function useSwipeAction(options: UseSwipeActionOptions = {}) {
  const { threshold = 60, maxReveal = 72, onReveal, onReset } = options;

  const [offsetX, setOffsetX] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const startX = useRef(0);
  const startOffset = useRef(0);
  const dragging = useRef(false);
  const offsetRef = useRef(0);

  const reset = useCallback(() => {
    dragging.current = false;
    setIsDragging(false);
    offsetRef.current = 0;
    setOffsetX(0);
    setRevealed(false);
    onReset?.();
  }, [onReset]);

  const snapOpen = useCallback(() => {
    dragging.current = false;
    setIsDragging(false);
    offsetRef.current = -maxReveal;
    setOffsetX(-maxReveal);
    setRevealed(true);
    onReveal?.();
  }, [maxReveal, onReveal]);

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      // Never capture when the gesture starts on a button/link — otherwise
      // row swipe steals clicks (e.g. Session History "View Details").
      const target = e.target as HTMLElement | null;
      if (target?.closest("button, a, input, select, textarea, [role='button']")) {
        return;
      }
      dragging.current = true;
      setIsDragging(true);
      startX.current = e.clientX;
      startOffset.current = offsetRef.current;
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (!dragging.current) return;
      const delta = e.clientX - startX.current;
      const next = Math.min(0, Math.max(-maxReveal, startOffset.current + delta));
      offsetRef.current = next;
      setOffsetX(next);
    },
    [maxReveal],
  );

  const onPointerUp = useCallback(() => {
    if (!dragging.current) return;
    if (offsetRef.current <= -threshold) {
      snapOpen();
      return;
    }
    reset();
  }, [threshold, reset, snapOpen]);

  const bind: SwipeActionBind = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    style: {
      transform: `translateX(${offsetX}px)`,
      transition: isDragging ? "none" : "transform 0.2s ease",
      touchAction: "pan-y",
    },
  };

  return { offsetX, revealed, isDragging, reset, snapOpen, bind };
}
