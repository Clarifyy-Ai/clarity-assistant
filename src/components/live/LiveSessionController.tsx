import { useEffect, useRef } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { useOverlayStore } from "@/store/overlayStore";
import { useNetworkColor } from "@/hooks/useNetworkMonitor";

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

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

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
  }, [isActive, status, tickElapsed]);

  // Sync network color — use stable selector to prevent infinite loop
  useEffect(() => {
    setNetworkColor?.(networkColor);
  }, [networkColor, setNetworkColor]);

  // Cleanup on unmount
  useEffect(() => clearTimer, []);

  return null;
}
