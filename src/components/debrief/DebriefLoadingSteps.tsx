import { JobProgressCard } from "@/components/async/JobProgressCard";
import {
  debriefJobChecklist,
  mapDebriefJobToProgress,
} from "@/lib/async/jobAdapters";
import type { SessionDebriefJob } from "@/lib/debrief/debriefJob";
import { cn } from "@/lib/utils";

/**
 * Debrief loading UI driven by server progress_stage when a job exists.
 * Falls back to a simple checklist without inventing percentages.
 */
export function DebriefLoadingSteps({
  activeIndex = 0,
  debriefJob,
  className,
  onCancel,
  onRetry,
}: {
  /** @deprecated Prefer debriefJob server stages */
  activeIndex?: number;
  debriefJob?: SessionDebriefJob | null;
  className?: string;
  onCancel?: () => void;
  onRetry?: () => void;
}) {
  if (debriefJob) {
    return (
      <JobProgressCard
        className={className}
        title="Preparing your debrief"
        progress={mapDebriefJobToProgress(debriefJob)}
        steps={debriefJobChecklist(debriefJob.progressStage, debriefJob.status)}
        onCancel={onCancel}
        onRetry={onRetry}
      />
    );
  }

  const STEPS = [
    "Loading session",
    "Fetching transcript",
    "Analysing performance",
    "Generating insights",
  ] as const;

  return (
    <div
      className={cn("space-y-3 max-w-sm mx-auto", className)}
      data-testid="debrief-loading-steps-fallback"
      aria-busy="true"
    >
      {STEPS.map((label, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex;
        return (
          <div key={label} className="flex items-center gap-3 text-sm">
            <span
              className={cn(
                "h-4 w-4 rounded-full border shrink-0",
                done && "border-emerald-500 bg-emerald-500/20",
                active && "border-primary animate-pulse",
                !done && !active && "border-border",
              )}
            />
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
