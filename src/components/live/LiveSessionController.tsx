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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick elapsed seconds
  useEffect(() => {
    if (!isActive || session.status !== "active") {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      session.tickElapsed();
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, session.status]);

  // Sync network color to overlay
  useEffect(() => {
    overlay.setNetworkColor(networkColor);
  }, [networkColor]);

  return null;
}
