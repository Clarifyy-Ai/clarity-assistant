import { cn } from "@/lib/utils";
import { CheckCircle, Loader2 } from "lucide-react";

const STEPS = [
  "Loading session",
  "Fetching transcript",
  "Analysing performance",
  "Generating insights",
] as const;

export function DebriefLoadingSteps({
  activeIndex = 0,
  className,
}: {
  activeIndex?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3 max-w-sm mx-auto", className)}>
      {STEPS.map((label, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex;
        return (
          <div key={label} className="flex items-center gap-3 text-sm">
            {done ? (
              <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
            ) : active ? (
              <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
            ) : (
              <span className="h-4 w-4 rounded-full border border-border shrink-0" />
            )}
            <span
              className={cn(
                done && "text-muted-foreground",
                active && "text-foreground font-medium",
                !done && !active && "text-muted-foreground/60",
              )}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
