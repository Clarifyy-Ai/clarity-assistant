import { useSessionStore } from "@/store/sessionStore";
import { Clock } from "lucide-react";

// ─────────────────────────────────────────────────────────────────
// LiveSessionTimer
// Displays elapsed session time in MM:SS format
// ─────────────────────────────────────────────────────────────────

export function LiveSessionTimer() {
  const elapsed = useSessionStore((s) => s.elapsed_seconds);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const display = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return (
    <div className="flex items-center gap-1.5 text-sm font-mono text-muted-foreground">
      <Clock className="w-3.5 h-3.5" />
      <span>{display}</span>
    </div>
  );
}
