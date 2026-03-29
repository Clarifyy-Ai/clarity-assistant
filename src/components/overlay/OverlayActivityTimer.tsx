// src/components/overlay/OverlayActivityTimer.tsx
import { useState, useEffect } from "react";
import { useOverlayStore } from "@/store/overlayStore";
import { Timer } from "lucide-react";
import { cn } from "@/lib/utils";

export function OverlayActivityTimer() {
  const sessionStartTime = useOverlayStore((s) => s.session_start_time);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!sessionStartTime) {
      setElapsed(0);
      return;
    }

    const update = () => setElapsed(Math.floor((Date.now() - sessionStartTime) / 1000));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [sessionStartTime]);

  if (!sessionStartTime) return null;

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeStr = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  const isWarm   = elapsed < 5 * 60;
  const isMiddle = elapsed >= 5 * 60 && elapsed < 15 * 60;
  const isLate   = elapsed >= 15 * 60;

  return (
    <div className={cn(
      "flex items-center gap-1 px-2 py-1 rounded-lg font-mono text-[11px] tabular-nums border transition-all",
      isWarm   && "text-emerald-400 bg-emerald-500/10 border-emerald-500/15",
      isMiddle && "text-amber-400 bg-amber-500/10 border-amber-500/15",
      isLate   && "text-red-400 bg-red-500/10 border-red-500/15"
    )}>
      <Timer className="w-2.5 h-2.5" />
      <span>{timeStr}</span>
    </div>
  );
}
