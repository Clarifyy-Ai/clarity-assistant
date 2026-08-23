import { useEffect, useRef } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { useOverlayStore } from "@/store/overlayStore";
import { useNetworkColor } from "@/hooks/useNetworkMonitor";
import { getOverlaySessionAuthority } from "@/store/overlaySessionAuthorityStore";
import { toast } from "sonner";

interface MockSessionControllerProps {
  isActive: boolean;
  isPaused?: boolean;
  timerMode: "countdown" | "countup";
  sessionDurationSeconds: number;
  onTickCountdown?: (remaining: number) => void;
  onTickCountup?: (elapsed: number) => void;
  /** Called once when countdown hits zero. */
  onAutoEnd?: () => void;
}

/**
 * Mock-only session timer / network sync.
 * Kept separate from LiveSessionController — do not merge into one giant mode switch.
 */
export function MockSessionController({
  isActive,
  isPaused = false,
  timerMode,
  sessionDurationSeconds,
  onTickCountdown,
  onTickCountup,
  onAutoEnd,
}: MockSessionControllerProps) {
  const setNetworkColor = useOverlayStore((s) => s.setNetworkColor);
  const networkColor = useNetworkColor();

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoEndedRef = useRef(false);
  const remainingRef = useRef(sessionDurationSeconds);
  const elapsedRef = useRef(0);
  const onAutoEndRef = useRef(onAutoEnd);
  onAutoEndRef.current = onAutoEnd;
  const onTickCountdownRef = useRef(onTickCountdown);
  onTickCountdownRef.current = onTickCountdown;
  const onTickCountupRef = useRef(onTickCountup);
  onTickCountupRef.current = onTickCountup;

  function clearTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  useEffect(() => {
    remainingRef.current = sessionDurationSeconds;
    elapsedRef.current = 0;
    autoEndedRef.current = false;
  }, [sessionDurationSeconds, isActive]);

  useEffect(() => {
    const auth = getOverlaySessionAuthority();
    const shouldRun =
      isActive &&
      !isPaused &&
      auth.mode === "mock" &&
      auth.canAcceptSessionMutations();

    clearTimer();
    if (!shouldRun) return;

    let docHidden = false;
    const onVisibility = () => {
      docHidden = document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibility);

    timerRef.current = setInterval(() => {
      if (docHidden) return;
      const liveAuth = getOverlaySessionAuthority();
      if (
        liveAuth.mode !== "mock" ||
        !liveAuth.canAcceptSessionMutations() ||
        liveAuth.lifecycle === "terminal"
      ) {
        clearTimer();
        return;
      }

      useSessionStore.getState().tickElapsed?.();

      if (timerMode === "countdown") {
        remainingRef.current = Math.max(0, remainingRef.current - 1);
        onTickCountdownRef.current?.(remainingRef.current);
        if (remainingRef.current <= 0 && !autoEndedRef.current) {
          autoEndedRef.current = true;
          clearTimer();
          toast.warning("Session time is up — ending session.", { duration: 5000 });
          try {
            onAutoEndRef.current?.();
          } catch (err) {
            console.error("[MockSessionController] auto-end failed:", err);
          }
        }
      } else {
        elapsedRef.current += 1;
        onTickCountupRef.current?.(elapsedRef.current);
      }
    }, 1000);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimer();
    };
  }, [isActive, isPaused, timerMode]);

  useEffect(() => {
    setNetworkColor?.(networkColor);
  }, [networkColor, setNetworkColor]);

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, []);

  return null;
}
