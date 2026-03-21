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
  // Select only the individual fields we need — never select the whole store
  // as an object (causes infinite re-render loop in React 18 + Zustand)
  const status      = useSessionStore((s) => s.status);
  const tickElapsed = useSessionStore((s) => s.tickElapsed);
  const setNetworkColor = useOverlayStore((s) => s.setNetworkColor);

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
    const shouldRun = isActive && status === "active";

    clearTimer();

    if (!shouldRun) return;

    let docHidden = false;
    const onVisibility = () => { docHidden = document.hidden; };
    document.addEventListener("visibilitychange", onVisibility);

    timerRef.current = setInterval(() => {
      if (!docHidden) tickElapsed?.();
    }, 1000);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, status]);

  // Sync network color to overlay
  useEffect(() => {
    setNetworkColor?.(networkColor);
  }, [networkColor, setNetworkColor]);

  // Cleanup on unmount
  useEffect(() => clearTimer, []);

  return null;
}
