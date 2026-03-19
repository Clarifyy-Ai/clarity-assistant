import { useEffect, useRef } from 'react';
import { useOverlayStore } from '@/store/overlayStore';

/**
 * WindowVisibilityManager Component
 *
 * Monitors browser tab/window visibility and:
 * - Hides overlay when tab is not focused (prevents proctor detection)
 * - Auto-resumes when tab regains focus
 * - Detects screen lock/unlock
 * - Tracks idle time
 * - Prevents audio/recording in background
 */

interface WindowVisibilityManagerProps {
  autoHideOnBlur?: boolean;
  trackIdleTime?: boolean;
  idleThreshold?: number; // milliseconds
  onVisibilityChange?: (isVisible: boolean) => void;
  onIdleStateChange?: (isIdle: boolean) => void;
}

export function WindowVisibilityManager({
  autoHideOnBlur = true,
  trackIdleTime = true,
  idleThreshold = 30000, // 30 seconds
  onVisibilityChange,
  onIdleStateChange,
}: WindowVisibilityManagerProps) {
  const overlay = useOverlayStore();
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const isIdleRef = useRef<boolean>(false);

  // Monitor document visibility (tab focused/blurred)
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === 'visible';

      onVisibilityChange?.(isVisible);

      if (autoHideOnBlur) {
        if (!isVisible) {
          // Tab is hidden - hide overlay for safety
          overlay.hideOverlay?.();
        } else {
          // Tab regained focus - can show overlay again
          // Don't auto-show, let user control it
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [autoHideOnBlur, overlay, onVisibilityChange]);

  // Monitor idle time (no user activity)
  useEffect(() => {
    if (!trackIdleTime) return;

    const resetIdleTimer = () => {
      lastActivityRef.current = Date.now();

      // Clear previous timer
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }

      // If was idle, mark as active again
      if (isIdleRef.current) {
        isIdleRef.current = false;
        onIdleStateChange?.(false);
      }

      // Set new idle timer
      idleTimerRef.current = setTimeout(() => {
        isIdleRef.current = true;
        onIdleStateChange?.(true);

        // Auto-pause audio/recording when idle
        const audioStore = (window as any).audioStore;
        if (audioStore?.pauseRecording) {
          audioStore.pauseRecording();
        }
      }, idleThreshold);
    };

    // Track various user activities
    const events = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart',
      'click',
    ];

    events.forEach((event) => {
      document.addEventListener(event, resetIdleTimer);
    });

    // Initial setup
    resetIdleTimer();

    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, resetIdleTimer);
      });

      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, [trackIdleTime, idleThreshold, onIdleStateChange]);

  // Monitor page visibility API (more accurate)
  useEffect(() => {
    const handlePageShow = () => {
      onVisibilityChange?.(true);
    };

    const handlePageHide = () => {
      onVisibilityChange?.(false);
      if (autoHideOnBlur) {
        overlay.hideOverlay?.();
      }
    };

    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [autoHideOnBlur, overlay, onVisibilityChange]);

  // Monitor fullscreen changes (proctor might enable fullscreen)
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFullscreen = document.fullscreenElement !== null;

      if (isFullscreen) {
        // Fullscreen activated - might be proctor tool
        overlay.hideOverlay?.();
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [overlay]);

  // Monitor screen lock (browser-level)
  useEffect(() => {
    // This is a best-effort detection
    // Not all browsers support this

    const handleScreenChange = () => {
      // If screen changes or becomes unavailable
      if ((window.screen as any).lockOrientation) {
        overlay.hideOverlay?.();
      }
    };

    window.addEventListener('orientationchange', handleScreenChange);
    return () => {
      window.removeEventListener('orientationchange', handleScreenChange);
    };
  }, [overlay]);

  // Cleanup function - return null as this is a controller component
  return null;
}

export default WindowVisibilityManager;
