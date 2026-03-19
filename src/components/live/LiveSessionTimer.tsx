import { useSessionStore } from "@/store/sessionStore";
import { Clock } from "lucide-react";

// ─────────────────────────────────────────────────────────────────
// LiveSessionTimer
// Displays elapsed session time in MM:SS format
// ─────────────────────────────────────────────────────────────────

export function LiveSessionTimer() {
  const elapsed = useSessionStore((s) => s.elapsed_seconds ?? 0);

  const secondsSafe = Math.max(0, elapsed);
  const minutes = Math.floor(secondsSafe / 60);
  const seconds = secondsSafe % 60;

  const display = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return (
    <div className="flex items-center gap-1.5 text-sm font-mono text-muted-foreground">
      <Clock className="h-3.5 w-3.5" />
      <span>{display}</span>
    </div>
  );
}
