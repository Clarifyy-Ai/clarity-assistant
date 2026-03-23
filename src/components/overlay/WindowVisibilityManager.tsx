// src/components/overlay/WindowVisibilityManager.tsx
import { useEffect, useRef } from 'react';
import { useOverlayStore } from '@/store/overlayStore';

/**
 * Monitors browser tab/window visibility and:
 * - Hides overlay when tab is not focused (unless PiP is active)
 * - Tracks idle, etc.
 */
interface WindowVisibilityManagerProps {
  autoHideOnBlur?: boolean;
  trackIdleTime?: boolean;
  idleThreshold?: number;
  onVisibilityChange?: (isVisible: boolean) => void;
  onIdleStateChange?: (isIdle: boolean) => void;
}

export function WindowVisibilityManager({
  autoHideOnBlur = true,
  trackIdleTime = true,
  idleThreshold = 30000,
  onVisibilityChange,
  onIdleStateChange,
}: WindowVisibilityManagerProps) {
  const hideOverlay = useOverlayStore((s) => s.hideOverlay);
  // ★ NEW: read PiP flag from store (added below)
  const isPipActive = useOverlayStore((s: any) => s.is_pip_active ?? false);

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isIdleRef = useRef<boolean>(false);

  // Document visibility (tab focused / blurred)
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === 'visible';
      onVisibilityChange?.(isVisible);

      // Do not auto-hide when PiP is active
      if (autoHideOnBlur && !isVisible && !isPipActive) {
        hideOverlay?.();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [autoHideOnBlur, isPipActive, hideOverlay, onVisibilityChange]);

  // Idle detection
  useEffect(() => {
    if (!trackIdleTime) return;

    const resetIdleTimer = () => {
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

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach((e) => document.addEventListener(e, resetIdleTimer));
    resetIdleTimer();
    return () => {
      events.forEach((e) => document.removeEventListener(e, resetIdleTimer));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [trackIdleTime, idleThreshold, onIdleStateChange]);

  // pageshow / pagehide
  useEffect(() => {
    const handlePageShow = () => onVisibilityChange?.(true);
    const handlePageHide = () => {
      onVisibilityChange?.(false);
      if (autoHideOnBlur && !isPipActive) hideOverlay?.();
    };
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [autoHideOnBlur, isPipActive, hideOverlay, onVisibilityChange]);

  // Fullscreen changes (proctor detection)
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (document.fullscreenElement !== null) hideOverlay?.();
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [hideOverlay]);

  // Orientation change (best-effort screen-lock detection)
  useEffect(() => {
    const handleOrientationChange = () => {
      if ((window.screen as any).lockOrientation) hideOverlay?.();
    };
    window.addEventListener('orientationchange', handleOrientationChange);
    return () => window.removeEventListener('orientationchange', handleOrientationChange);
  }, [hideOverlay]);

  return null;
}

export default WindowVisibilityManager;
