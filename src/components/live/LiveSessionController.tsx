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
  const status         = useSessionStore((s) => s.status);
  const setNetworkColor = useOverlayStore((s) => s.setNetworkColor);

  const networkColor = useNetworkColor();

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  useEffect(() => {
    const shouldRun = isActive && status === "active";

    clearTimer();
    if (!shouldRun) return;

    let docHidden = false;
    const onVisibility = () => { docHidden = document.hidden; };
    document.addEventListener("visibilitychange", onVisibility);

    timerRef.current = setInterval(() => {
      if (docHidden) return;
      // FIX: call getState() inside the interval callback instead of capturing
      // tickElapsed as a selector value. This avoids stale closures if the store
      // is ever rehydrated, and prevents tickElapsed from being in the dependency
      // array (which would restart the interval on every store update).
      useSessionStore.getState().tickElapsed?.();
    }, 1000);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimer();
    };
    // tickElapsed intentionally not in deps — we call getState() at runtime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, status]);

  // Sync network color
  useEffect(() => {
    setNetworkColor?.(networkColor);
  }, [networkColor, setNetworkColor]);

  // FIX: useEffect(() => clearTimer, []) returned the function reference directly,
  // which is valid but fragile if clearTimer were to change identity. Using an
  // explicit arrow wrapper makes the intent clear and guards against that.
  useEffect(() => {
    return () => { clearTimer(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
