// src/components/overlay/OverlayNetworkBadge.tsx
import { cn } from "@/lib/utils";

interface OverlayNetworkBadgeProps {
  color: "green" | "yellow" | "red";
  rttMs?: number | null;
  label?: string;
}

const CONFIG = {
  green:  { dot: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]", title: "Strong connection" },
  yellow: { dot: "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)]",   title: "Degraded — using faster model" },
  red:    { dot: "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.7)]",      title: "Offline — using templates" },
};

export function OverlayNetworkBadge({ color, rttMs, label }: OverlayNetworkBadgeProps) {
  const { dot, title } = CONFIG[color];
  const rttText =
    typeof rttMs === "number" && isFinite(rttMs) && rttMs > 0
      ? `${Math.round(rttMs)}ms`
      : color === "red"
        ? "Offline"
        : color === "yellow"
          ? "Slow"
          : null;

  return (
    <span
      className="inline-flex items-center gap-1 shrink-0"
      title={label ?? title}
    >
      <span className={cn("inline-block w-2 h-2 rounded-full shrink-0 transition-all", dot)} />
      {rttText && (
        <span className="text-[9px] font-mono text-white/50 tabular-nums">{rttText}</span>
      )}
    </span>
  );
}
