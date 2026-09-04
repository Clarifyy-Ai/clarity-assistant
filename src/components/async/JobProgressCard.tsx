import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { JobProgress, JobStageStep } from "@/lib/async/jobProgress";
import { isJobProgressTerminal } from "@/lib/async/jobProgress";
import { ProcessingStatus } from "@/components/async/ProcessingStatus";
import { Button } from "@/components/ui/Button";

type JobProgressCardProps = {
  title: string;
  progress: JobProgress | null;
  steps?: JobStageStep[];
  elapsedMs?: number;
  onRetry?: () => void;
  onCancel?: () => void;
  className?: string;
};

function StepIcon({ state }: { state: JobStageStep["state"] }) {
  if (state === "done") return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />;
  if (state === "active") {
    return <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />;
  }
  if (state === "failed" || state === "cancelled") {
    return <XCircle className="w-4 h-4 text-destructive shrink-0" />;
  }
  return <Circle className="w-4 h-4 text-muted-foreground/50 shrink-0" />;
}

export function JobProgressCard({
  title,
  progress,
  steps,
  elapsedMs = 0,
  onRetry,
  onCancel,
  className,
}: JobProgressCardProps) {
  const determinate =
    typeof progress?.progress === "number" && Number.isFinite(progress.progress);
  const terminal = progress ? isJobProgressTerminal(progress.status) : false;
  const failed = progress?.status === "failed" || progress?.status === "expired";
  const cancelled = progress?.status === "cancelled" || progress?.cancelled;

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card/80 p-4 space-y-3 min-w-0",
        className,
      )}
      data-testid="job-progress-card"
      aria-busy={!terminal}
    >
      <div className="space-y-1 min-w-0">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {progress?.message && !terminal && (
          <ProcessingStatus
            message={progress.message}
            stage={progress.stage}
            elapsedMs={elapsedMs}
            compact
          />
        )}
        {terminal && progress?.message && (
          <p className="text-sm text-muted-foreground">{progress.message}</p>
        )}
        {failed && progress?.errorMessage && (
          <p className="text-sm text-destructive" role="alert">
            {progress.errorMessage}
          </p>
        )}
      </div>

      {determinate && (
        <div className="space-y-1">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress!.progress}
            className="h-2 rounded-full bg-secondary overflow-hidden"
          >
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progress!.progress}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground tabular-nums">
            {progress!.progress}%
          </p>
        </div>
      )}

      {steps && steps.length > 0 && (
        <ol className="space-y-2" data-testid="job-progress-steps">
          {steps.map((step, index) => (
            <li
              key={step.id}
              className="flex items-center gap-2 text-xs min-w-0"
              data-state={step.state}
            >
              <StepIcon state={step.state} />
              <span
                className={cn(
                  "min-w-0 break-words",
                  step.state === "active" && "text-foreground font-medium",
                  step.state === "pending" && "text-muted-foreground",
                  step.state === "done" && "text-muted-foreground",
                  (step.state === "failed" || step.state === "cancelled") &&
                    "text-destructive",
                )}
              >
                Step {index + 1} of {steps.length}: {step.label}
              </span>
            </li>
          ))}
        </ol>
      )}

      {(onRetry || onCancel) && (failed || cancelled || (!terminal && onCancel)) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {onCancel && !terminal && (
            <Button type="button" variant="secondary" size="xs" onClick={onCancel}>
              Cancel
            </Button>
          )}
          {onRetry && (failed || cancelled) && progress?.retryable !== false && (
            <Button type="button" variant="primary" size="xs" onClick={onRetry}>
              Retry
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
