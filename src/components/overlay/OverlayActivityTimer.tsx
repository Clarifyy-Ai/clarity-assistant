// src/components/overlay/OverlayActivityTimer.tsx
import { Timer } from "lucide-react";
import { useSessionStore } from "@/store/sessionStore";
import { cn } from "@/lib/utils";

/**
 * Toolbar session clock — same source as OverlaySessionStats (`elapsed_seconds`).
 * Elapsed is active time (pause-aware). LiveSessionController only ticks while
 * status === "active" and paused_at is clear, so Pause freezes the clock and lease.
 */
export function OverlayActivityTimer() {
  const status = useSessionStore((s) => s.status);
  const elapsed = useSessionStore((s) => s.elapsed_seconds);

  if (status !== "active" && status !== "paused") return null;

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeStr = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  const isWarm = elapsed < 5 * 60;
  const isMiddle = elapsed >= 5 * 60 && elapsed < 15 * 60;
  const isLate = elapsed >= 15 * 60;

  return (
    <div
      className={cn(
        "flex items-center gap-1 px-2 py-1 rounded-lg font-mono text-[11px] tabular-nums border transition-all",
        isWarm && "text-emerald-400 bg-emerald-500/10 border-emerald-500/15",
        isMiddle && "text-amber-400 bg-amber-500/10 border-amber-500/15",
        isLate && "text-red-400 bg-red-500/10 border-red-500/15",
      )}
      data-testid="overlay-activity-timer"
      aria-label={`Session time ${timeStr}`}
    >
      <Timer className="w-2.5 h-2.5" aria-hidden="true" />
      <span>{timeStr}</span>
    </div>
  );
}
