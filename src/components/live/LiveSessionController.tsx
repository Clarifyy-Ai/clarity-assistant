import { useEffect, useRef } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { useOverlayStore } from "@/store/overlayStore";
import { useNetworkColor } from "@/hooks/useNetworkMonitor";
import { getOverlaySessionAuthority } from "@/store/overlaySessionAuthorityStore";
import {
  practiceElapsedSeconds,
  practiceRemainingSeconds,
} from "@/lib/session/practiceSessionLease";
import { toast } from "sonner";
import type { LiveSessionConfig } from "@/types/session.types";

interface LiveSessionControllerProps {
  isActive: boolean;
  /** Called once when the configured duration elapses, so the parent can
   *  finalize the session (persist + cleanup). The controller will NOT
   *  tick further after firing this. */
  onAutoEnd?: () => void;
}

/**
 * Live Copilot session timer / network sync.
 * Active elapsed and remaining use pause-aware lease math so Pause freezes
 * both the clock and the lease; Resume continues without double-counting.
 * Mock uses MockSessionController — keep orchestration product-specific.
 */
export function LiveSessionController({ isActive, onAutoEnd }: LiveSessionControllerProps) {
  const status = useSessionStore((s) => s.status);
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
    const auth = getOverlaySessionAuthority();
    const shouldRun =
      isActive &&
      status === "active" &&
      auth.mode === "live" &&
      auth.canAcceptSessionMutations();

    clearTimer();
    if (!shouldRun) return;

    timerRef.current = setInterval(() => {
      const liveAuth = getOverlaySessionAuthority();
      if (
        liveAuth.mode !== "live" ||
        !liveAuth.canAcceptSessionMutations() ||
        liveAuth.lifecycle === "terminal"
      ) {
        clearTimer();
        return;
      }

      const store = useSessionStore.getState();
      // Defense: never advance while paused even if effect teardown races.
      if (store.status !== "active" || store.paused_at) {
        clearTimer();
        return;
      }

      const config = store.config as LiveSessionConfig | null;
      const now = Date.now();
      const pauseClock = {
        pausedAt: store.paused_at,
        totalPausedMs: store.total_paused_ms,
      };

      if (store.started_at) {
        store.setElapsedSeconds(
          practiceElapsedSeconds(
            store.started_at,
            now,
            store.elapsed_seconds,
            pauseClock,
          ),
        );
      } else {
        store.tickElapsed?.();
      }

      const remaining = practiceRemainingSeconds(
        {
          expiresAt: store.expires_at,
          startedAt: store.started_at,
          durationMinutes: config?.duration_minutes,
        },
        now,
        pauseClock,
      );

      const effectiveRemaining =
        remaining ??
        (config?.duration_minutes && config.duration_minutes > 0
          ? config.duration_minutes * 60 - useSessionStore.getState().elapsed_seconds
          : null);

      if (effectiveRemaining == null) return;

      if (effectiveRemaining <= 0) {
        if (!autoEndedRef.current) {
          autoEndedRef.current = true;
          warnedRef.current.add("end");
          toast.warning("Session time is up — ending session.", { duration: 5000 });
          clearTimer();
          try {
            onAutoEndRef.current?.();
          } catch (err) {
            console.error("[LiveSessionController] auto-end failed:", err);
          }
        }
      } else if (effectiveRemaining <= 30 && !warnedRef.current.has("30s")) {
        warnedRef.current.add("30s");
        toast.warning("30 seconds remaining!", { duration: 3000 });
      } else if (effectiveRemaining <= 120 && !warnedRef.current.has("2m")) {
        warnedRef.current.add("2m");
        toast.warning("2 minutes remaining", { duration: 3000 });
      } else if (effectiveRemaining <= 300 && !warnedRef.current.has("5m")) {
        warnedRef.current.add("5m");
        toast.info("5 minutes remaining", { duration: 3000 });
      }
    }, 1000);

    return () => {
      clearTimer();
    };
  }, [isActive, status]);

  useEffect(() => {
    if (status === "idle" || status === "warming_up") {
      autoEndedRef.current = false;
      warnedRef.current.clear();
    }
  }, [status]);

  useEffect(() => {
    setNetworkColor?.(networkColor);
  }, [networkColor, setNetworkColor]);

  useEffect(() => {
    return () => clearTimer();
  }, []);

  return null;
}
