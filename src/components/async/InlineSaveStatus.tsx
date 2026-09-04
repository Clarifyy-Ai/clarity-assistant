import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

export type InlineSaveStatusKind = "idle" | "saving" | "saved" | "failed";

type InlineSaveStatusProps = {
  status: InlineSaveStatusKind;
  onRetry?: () => void;
  className?: string;
};

export function InlineSaveStatus({
  status,
  onRetry,
  className,
}: InlineSaveStatusProps) {
  if (status === "idle") return null;
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 text-[11px] min-w-0",
        className,
      )}
      data-testid="inline-save-status"
      data-status={status}
      aria-live="polite"
    >
      {status === "saving" && (
        <span className="text-muted-foreground">Saving…</span>
      )}
      {status === "saved" && (
        <span className="text-emerald-600 dark:text-emerald-400">Saved ✓</span>
      )}
      {status === "failed" && (
        <>
          <span className="text-destructive">Save failed</span>
          {onRetry && (
            <Button type="button" variant="ghost" size="xs" onClick={onRetry}>
              Retry
            </Button>
          )}
        </>
      )}
    </div>
  );
}
