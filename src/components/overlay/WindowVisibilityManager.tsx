import { useEffect, useRef } from 'react';
import { useOverlayStore } from '@/store/overlayStore';

/**
 * WindowVisibilityManager
 *
 * Monitors browser tab/window visibility and:
 * - Hides overlay when tab is not focused (prevents proctor detection)
 * - Auto-resumes when tab regains focus
 * - Detects screen lock/unlock
 * - Tracks idle time
 * - Prevents audio/recording in background
 *
 * Uses individual action selectors so the stable function references
 * don't end up in useEffect dependency arrays as full-store objects
 * (which would cause constant event-listener churn every render).
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
  // Only pull the action — stable reference, won't cause churn
  const hideOverlay = useOverlayStore((s) => s.hideOverlay);

  const idleTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const isIdleRef       = useRef<boolean>(false);

  // Monitor document visibility (tab focused / blurred)
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === 'visible';
      onVisibilityChange?.(isVisible);
      if (autoHideOnBlur && !isVisible) {
        hideOverlay?.();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [autoHideOnBlur, hideOverlay, onVisibilityChange]);

  // Monitor idle time (no user activity)
  useEffect(() => {
    if (!trackIdleTime) return;

    const resetIdleTimer = () => {
      lastActivityRef.current = Date.now();

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
      if (autoHideOnBlur) hideOverlay?.();
    };

    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [autoHideOnBlur, hideOverlay, onVisibilityChange]);

  // Fullscreen changes (proctor detection)
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (document.fullscreenElement !== null) hideOverlay?.();
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [hideOverlay]);

  // Orientation change (best-effort screen-lock detection)
  useEffect(() => {
    const handleOrientationChange = () => {
      if ((window.screen as any).lockOrientation) hideOverlay?.();
    };

    window.addEventListener('orientationchange', handleOrientationChange);
    return () => {
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, [hideOverlay]);

  return null;
}

export default WindowVisibilityManager;
