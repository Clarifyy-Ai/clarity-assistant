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

  const color =
    elapsed < 5 * 60
      ? "text-emerald-400"
      : elapsed < 15 * 60
      ? "text-amber-400"
      : "text-red-400";

  const bgColor =
    elapsed < 5 * 60
      ? "bg-emerald-500/10"
      : elapsed < 15 * 60
      ? "bg-amber-500/10"
      : "bg-red-500/10";

  return (
    <div className={cn("flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[11px] tabular-nums", color, bgColor)}>
      <Timer className="w-2.5 h-2.5" />
      <span>{timeStr}</span>
    </div>
  );
}
