import { useEffect, useRef } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { useOverlayStore } from "@/store/overlayStore";
import { useNetworkColor } from "@/hooks/useNetworkMonitor";
import { toast } from "sonner";
import type { LiveSessionConfig } from "@/types/session.types";

interface LiveSessionControllerProps {
  isActive: boolean;
}

export function LiveSessionController({ isActive }: LiveSessionControllerProps) {
  const status         = useSessionStore((s) => s.status);
  const setNetworkColor = useOverlayStore((s) => s.setNetworkColor);

  const networkColor = useNetworkColor();

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const warnedRef = useRef<Set<string>>(new Set());

  function clearTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  useEffect(() => {
    const shouldRun = isActive && status === "active";

    clearTimer();
    warnedRef.current.clear();
    if (!shouldRun) return;

    let docHidden = false;
    const onVisibility = () => { docHidden = document.hidden; };
    document.addEventListener("visibilitychange", onVisibility);

    timerRef.current = setInterval(() => {
      if (docHidden) return;
      useSessionStore.getState().tickElapsed?.();

      // Time warning logic
      const elapsed = useSessionStore.getState().elapsed_seconds;
      const config = useSessionStore.getState().config as LiveSessionConfig | null;
      const durationMin = config?.duration_minutes;
      if (durationMin && durationMin > 0) {
        const totalSec = durationMin * 60;
        const remaining = totalSec - elapsed;

        if (remaining <= 0 && !warnedRef.current.has("end")) {
          warnedRef.current.add("end");
          toast.warning("Session time is up!", { duration: 5000 });
        } else if (remaining <= 30 && remaining > 0 && !warnedRef.current.has("30s")) {
          warnedRef.current.add("30s");
          toast.warning("30 seconds remaining!", { duration: 3000 });
        } else if (remaining <= 120 && remaining > 30 && !warnedRef.current.has("2m")) {
          warnedRef.current.add("2m");
          toast.warning("2 minutes remaining", { duration: 3000 });
        } else if (remaining <= 300 && remaining > 120 && !warnedRef.current.has("5m")) {
          warnedRef.current.add("5m");
          toast.info("5 minutes remaining", { duration: 3000 });
        }
      }
    }, 1000);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, status]);

  // Sync network color
  useEffect(() => {
    setNetworkColor?.(networkColor);
  }, [networkColor, setNetworkColor]);

  useEffect(() => {
    return () => { clearTimer(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
