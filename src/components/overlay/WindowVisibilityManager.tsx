// src/components/overlay/WindowVisibilityManager.tsx
import { useEffect, useRef, useCallback } from 'react';
import { useOverlayStore } from '@/store/overlayStore';

/* ─── types ──────────────────────────────────────────────────────── */

interface WindowVisibilityManagerProps {
  /** Hide overlay when the tab loses focus (default true) */
  autoHideOnBlur?: boolean;
  /** Enable idle-time detection (default true) */
  trackIdleTime?: boolean;
  /** Ms of inactivity before the user is considered idle (default 30 000) */
  idleThreshold?: number;
  /**
   * Grace period before hiding on blur (ms).
   * Helps prevent flickers caused by brief alt-tab / screenshot tools (default 300).
   */
  blurGraceMs?: number;
  /** Called when document visibility changes */
  onVisibilityChange?: (isVisible: boolean) => void;
  /** Called when idle state changes */
  onIdleStateChange?: (isIdle: boolean) => void;
}

/* ─── helpers ────────────────────────────────────────────────────── */

/** Creates a debounced version of `fn` that delays invocation by `wait` ms. */
function debounce<T extends (...args: Parameters<T>) => void>(fn: T, wait: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return function (this: unknown, ...args: Parameters<T>) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  } as T;
}

/* ─── component ─────────────────────────────────────────────────── */

export function WindowVisibilityManager({
  autoHideOnBlur    = true,
  trackIdleTime     = true,
  idleThreshold     = 30_000,
  blurGraceMs       = 300,
  onVisibilityChange,
  onIdleStateChange,
}: WindowVisibilityManagerProps) {
  const hideOverlay = useOverlayStore((s) => s.hideOverlay);
  const isPipActive = useOverlayStore((s) => s.is_pip_active);

  const idleTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isIdleRef       = useRef(false);
  const lastHideRef     = useRef(0); // prevent duplicate hide calls within 500ms

  /* ── safe hide (guards PiP + rate-limits duplicate calls) ─────── */
  const safeHide = useCallback(() => {
    if (isPipActive) return;
    const now = Date.now();
    if (now - lastHideRef.current < 500) return;
    lastHideRef.current = now;
    hideOverlay?.();
  }, [isPipActive, hideOverlay]);

  /* ── 1. Document visibility (tab focus / blur) ──────────────────── */
  useEffect(() => {
    const handleChange = () => {
      const visible = document.visibilityState === 'visible';
      onVisibilityChange?.(visible);

      if (visible) {
        /* Cancel any pending blur-grace hide */
        if (blurTimerRef.current) {
          clearTimeout(blurTimerRef.current);
          blurTimerRef.current = null;
        }
      } else if (autoHideOnBlur) {
        /* Defer hide by blurGraceMs so quick alt-tabs don't flash */
        blurTimerRef.current = setTimeout(safeHide, blurGraceMs);
      }
    };

    document.addEventListener('visibilitychange', handleChange);
    return () => {
      document.removeEventListener('visibilitychange', handleChange);
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
  }, [autoHideOnBlur, blurGraceMs, safeHide, onVisibilityChange]);

  /* ── 2. Idle detection ──────────────────────────────────────────── */
  useEffect(() => {
    if (!trackIdleTime) return;

    const resetIdle = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (isIdleRef.current) {
        isIdleRef.current = false;
        onIdleStateChange?.(false);
      }
      idleTimerRef.current = setTimeout(() => {
        isIdleRef.current = true;
        onIdleStateChange?.(true);
      }, idleThreshold);
    };

    /* Debounce mousemove (noisy) but leave click/keypress immediate */
    const debouncedMouseMove = debounce(resetIdle, 200);

    const activeEvents  = ['mousedown', 'keypress', 'scroll', 'touchstart', 'click'] as const;
    const passiveEvents = ['mousemove'] as const;

    activeEvents.forEach((ev)  => document.addEventListener(ev, resetIdle,           { passive: true }));
    passiveEvents.forEach((ev) => document.addEventListener(ev, debouncedMouseMove,  { passive: true }));

    resetIdle(); // arm the timer

    return () => {
      activeEvents.forEach((ev)  => document.removeEventListener(ev, resetIdle));
      passiveEvents.forEach((ev) => document.removeEventListener(ev, debouncedMouseMove));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [trackIdleTime, idleThreshold, onIdleStateChange]);

  /* ── 3. pageshow / pagehide (BFCache navigation) ──────────────── */
  useEffect(() => {
    const handleShow = () => onVisibilityChange?.(true);
    const handleHide = () => {
      onVisibilityChange?.(false);
      if (autoHideOnBlur) safeHide();
    };
    window.addEventListener('pageshow', handleShow);
    window.addEventListener('pagehide', handleHide);
    return () => {
      window.removeEventListener('pageshow', handleShow);
      window.removeEventListener('pagehide', handleHide);
    };
  }, [autoHideOnBlur, safeHide, onVisibilityChange]);

  /* ── 4. Fullscreen change ──────────────────────────────────────── */
  useEffect(() => {
    const handleFullscreen = () => {
      if (document.fullscreenElement !== null) safeHide();
    };
    document.addEventListener('fullscreenchange', handleFullscreen);
    document.addEventListener('webkitfullscreenchange', handleFullscreen); // Safari
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreen);
      document.removeEventListener('webkitfullscreenchange', handleFullscreen);
    };
  }, [safeHide]);

  /* ── 5. Orientation / resize ──────────────────────────────────── */
  useEffect(() => {
    /**
     * Orientation change typically means the user is sharing their screen
     * in a tool that rotated its viewport. Hide only on actual orientation
     * flip (portrait ↔ landscape), not every resize.
     */
    let lastAngle = window.screen?.orientation?.angle ?? 0;

    const handleOrientation = () => {
      const newAngle = window.screen?.orientation?.angle ?? 0;
      if (newAngle !== lastAngle) {
        lastAngle = newAngle;
        safeHide();
      }
    };

    /* Modern API */
    window.screen?.orientation?.addEventListener?.('change', handleOrientation);
    /* Legacy fallback */
    window.addEventListener('orientationchange', handleOrientation);

    return () => {
      window.screen?.orientation?.removeEventListener?.('change', handleOrientation);
      window.removeEventListener('orientationchange', handleOrientation);
    };
  }, [safeHide]);

  /* ── 6. Window focus/blur (covers cases visibility API misses) ─── */
  useEffect(() => {
    if (!autoHideOnBlur) return;

    const handleBlur = () => {
      if (!document.hasFocus()) {
        blurTimerRef.current = setTimeout(safeHide, blurGraceMs);
      }
    };
    const handleFocus = () => {
      if (blurTimerRef.current) {
        clearTimeout(blurTimerRef.current);
        blurTimerRef.current = null;
      }
    };

    window.addEventListener('blur',  handleBlur);
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('blur',  handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [autoHideOnBlur, blurGraceMs, safeHide]);

  return null;
}

export default WindowVisibilityManager;
