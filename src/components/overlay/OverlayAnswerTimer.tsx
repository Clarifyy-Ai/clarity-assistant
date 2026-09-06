// src/components/overlay/OverlayAnswerTimer.tsx
import { useSessionStore } from "@/store/sessionStore";
import { cn } from "@/lib/utils";

const TARGET_SECONDS = 120;

export function OverlayAnswerTimer() {
  const elapsed   = useSessionStore((s) => s.question_elapsed_seconds);
  const remaining = TARGET_SECONDS - elapsed;

  const abs     = Math.abs(remaining);
  const minutes = Math.floor(abs / 60);
  const seconds = abs % 60;
  const label   = remaining < 0
    ? `+${minutes}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;

  const pct = Math.min(elapsed / TARGET_SECONDS, 1);

  return (
    <span
      className={cn(
        "font-mono text-[11px] px-1.5 py-0.5 rounded-lg border transition-all duration-300",
        remaining <= 0
          ? "text-red-400 bg-red-500/10 border-red-500/20 animate-pulse"
          : remaining <= 20
          ? "text-amber-400 bg-amber-500/10 border-amber-500/15"
          : "text-sky-400/60 bg-sky-500/8 border-sky-500/12"
      )}
      title={`Answer time remaining — target ${TARGET_SECONDS}s`}
      aria-label={`Answer time remaining ${label}`}
    >
      <span className="mr-1 font-sans text-[9px] uppercase tracking-wide opacity-70">
        Answer
      </span>
      {label}
    </span>
  );
}
