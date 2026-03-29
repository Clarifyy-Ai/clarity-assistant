// src/components/overlay/OverlayNetworkBadge.tsx
import { cn } from "@/lib/utils";

interface OverlayNetworkBadgeProps {
  color: "green" | "yellow" | "red";
}

const CONFIG = {
  green:  { dot: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]", title: "Strong connection" },
  yellow: { dot: "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)]",   title: "Degraded — using faster model" },
  red:    { dot: "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.7)]",      title: "Offline — using templates" },
};

export function OverlayNetworkBadge({ color }: OverlayNetworkBadgeProps) {
  const { dot, title } = CONFIG[color];
  return (
    <span
      className={cn("inline-block w-2 h-2 rounded-full shrink-0 transition-all", dot)}
      title={title}
    />
  );
}
