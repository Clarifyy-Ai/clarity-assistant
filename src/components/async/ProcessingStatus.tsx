import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";
import { waitMessageForElapsedMs } from "@/lib/async/waitMessaging";

type ProcessingStatusProps = {
  message: string;
  stage?: string;
  /** Elapsed ms since start — adjusts patience copy without failing the job. */
  elapsedMs?: number;
  compact?: boolean;
  className?: string;
  /** Announced only when message/stage meaningfully changes (caller keys). */
  announceKey?: string;
};

export function ProcessingStatus({
  message,
  stage,
  elapsedMs = 0,
  compact,
  className,
  announceKey,
}: ProcessingStatusProps) {
  const display = waitMessageForElapsedMs(elapsedMs, message);
  return (
    <div
      className={cn(
        "flex items-start gap-2 min-w-0",
        compact ? "text-xs" : "text-sm",
        className,
      )}
      aria-busy="true"
      data-testid="processing-status"
      data-stage={stage || undefined}
    >
      <Spinner size="sm" className="shrink-0 mt-0.5" />
      <div className="min-w-0 space-y-0.5">
        <p className="text-foreground leading-snug break-words">{display}</p>
        {stage && !compact && (
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
            {stage.replace(/_/g, " ")}
          </p>
        )}
        <span className="sr-only" aria-live="polite" key={announceKey ?? display}>
          {display}
        </span>
      </div>
    </div>
  );
}
