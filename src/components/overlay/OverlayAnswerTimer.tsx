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

  const colorClass =
    remaining <= 0  ? "text-red-400 bg-red-500/10 animate-pulse" :
    remaining <= 20 ? "text-amber-400 bg-amber-500/10" :
                      "text-sky-400/60 bg-sky-500/10";

  return (
    <span
      className={cn(
        "font-mono text-[11px] px-1.5 py-0.5 rounded transition-all duration-300",
        colorClass,
      )}
      title={`Per-answer timer — target ${TARGET_SECONDS}s`}
    >
      {label}
    </span>
  );
}
