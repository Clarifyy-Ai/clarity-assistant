import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// ProgressBar
// Used in onboarding, scorecard, weekly challenge, XP bar.
// ─────────────────────────────────────────────────────────────────

interface ProgressBarProps {
  value:      number;          // 0–100
  max?:       number;          // default 100
  color?:     "violet" | "emerald" | "amber" | "red" | "blue";
  size?:      "xs" | "sm" | "md";
  showLabel?: boolean;
  label?:     string;
  animated?:  boolean;
  className?: string;
}

const COLORS = {
  violet:  "bg-violet-500",
  emerald: "bg-emerald-500",
  amber:   "bg-amber-500",
  red:     "bg-red-500",
  blue:    "bg-blue-500",
};

const SIZES = {
  xs: "h-1",
  sm: "h-1.5",
  md: "h-2.5",
};

export function ProgressBar({
  value,
  max       = 100,
  color     = "violet",
  size      = "sm",
  showLabel = false,
  label,
  animated  = false,
  className,
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={cn("w-full", className)}>
      {(showLabel || label) && (
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-gray-400">{label}</span>
          {showLabel && (
            <span className="text-xs font-medium text-white">{Math.round(pct)}%</span>
          )}
        </div>
      )}
      <div className={cn("w-full bg-secondary rounded-full overflow-hidden", SIZES[size])}>
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            COLORS[color],
            animated && "animate-pulse"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
