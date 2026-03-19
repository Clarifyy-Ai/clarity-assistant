import { useEffect, useRef } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { useOverlayStore } from "@/store/overlayStore";
import { useNetworkColor } from "@/hooks/useNetworkMonitor";

// ─────────────────────────────────────────────────────────────────
// LiveSessionController
// State machine: manages session lifecycle, elapsed timer,
// syncs network color to overlay.
// ─────────────────────────────────────────────────────────────────

interface LiveSessionControllerProps {
  isActive: boolean;
}

export function LiveSessionController({ isActive }: LiveSessionControllerProps) {
  const session = useSessionStore();
  const overlay = useOverlayStore();
  const networkColor = useNetworkColor();

  // Keep a ref to the active interval id
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Helper to safely clear the timer and null it out
  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Tick elapsed seconds when session is active
  useEffect(() => {
    // Guard conditions
    const shouldRun =
      isActive &&
      session.status === "active";

    // Always clear any existing timer first
    clearTimer();

    if (!shouldRun) {
      return; // Nothing to do
    }

    // (Optional) avoid ticking while tab is hidden to save resources
    let docHidden = false;
    const onVisibility = () => {
      docHidden = document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Start the timer
    timerRef.current = setInterval(() => {
      // Skip ticking when hidden (optional behaviour)
      if (!docHidden) {
        session.tickElapsed?.();
      }
    }, 1000);

    // Cleanup
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, session.status]); // we intentionally avoid depending on the store function identity

  // Sync network color to overlay
  useEffect(() => {
    overlay.setNetworkColor?.(networkColor);
  }, [networkColor, overlay]);

  // Cleanup on unmount as a final safety
  useEffect(() => clearTimer, []);

  return null;
}
