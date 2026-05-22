import { useEffect, useRef } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { useOverlayStore } from "@/store/overlayStore";
import { useNetworkColor } from "@/hooks/useNetworkMonitor";
import { toast } from "sonner";
import type { LiveSessionConfig } from "@/types/session.types";

interface LiveSessionControllerProps {
  isActive: boolean;
  /** Called once when the configured duration elapses, so the parent can
   *  finalize the session (persist + cleanup). The controller will NOT
   *  tick further after firing this. */
  onAutoEnd?: () => void;
}

export function LiveSessionController({ isActive, onAutoEnd }: LiveSessionControllerProps) {
  const status         = useSessionStore((s) => s.status);
  const setNetworkColor = useOverlayStore((s) => s.setNetworkColor);

  const networkColor = useNetworkColor();

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const warnedRef = useRef<Set<string>>(new Set());
  const autoEndedRef = useRef(false);
  const onAutoEndRef = useRef(onAutoEnd);
  onAutoEndRef.current = onAutoEnd;

  function clearTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  useEffect(() => {
    // Tick only while truly active. Paused / completed / idle freezes the timer
    // so resume continues from the last elapsed value.
    const shouldRun = isActive && status === "active";

    clearTimer();
    if (!shouldRun) return;

    let docHidden = false;
    const onVisibility = () => { docHidden = document.hidden; };
    document.addEventListener("visibilitychange", onVisibility);

    timerRef.current = setInterval(() => {
      if (docHidden) return;
      useSessionStore.getState().tickElapsed?.();

      const elapsed = useSessionStore.getState().elapsed_seconds;
      const config = useSessionStore.getState().config as LiveSessionConfig | null;
      const durationMin = config?.duration_minutes;
      if (durationMin && durationMin > 0) {
        const totalSec = durationMin * 60;
        const remaining = totalSec - elapsed;

        if (remaining <= 0) {
          if (!autoEndedRef.current) {
            autoEndedRef.current = true;
            warnedRef.current.add("end");
            toast.warning("Session time is up — ending session.", { duration: 5000 });
            clearTimer();
            try { onAutoEndRef.current?.(); } catch (err) {
              console.error("[LiveSessionController] auto-end failed:", err);
            }
          }
        } else if (remaining <= 30 && !warnedRef.current.has("30s")) {
          warnedRef.current.add("30s");
          toast.warning("30 seconds remaining!", { duration: 3000 });
        } else if (remaining <= 120 && !warnedRef.current.has("2m")) {
          warnedRef.current.add("2m");
          toast.warning("2 minutes remaining", { duration: 3000 });
        } else if (remaining <= 300 && !warnedRef.current.has("5m")) {
          warnedRef.current.add("5m");
          toast.info("5 minutes remaining", { duration: 3000 });
        }
      }
    }, 1000);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimer();
    };
     
  }, [isActive, status]);

  // Reset auto-end + warnings when a brand-new session begins (idle/warming_up).
  useEffect(() => {
    if (status === "idle" || status === "warming_up") {
      autoEndedRef.current = false;
      warnedRef.current.clear();
    }
  }, [status]);

  // Sync network color
  useEffect(() => {
    setNetworkColor?.(networkColor);
  }, [networkColor, setNetworkColor]);

  useEffect(() => {
    return () => { clearTimer(); };
     
  }, []);

  return null;
}
