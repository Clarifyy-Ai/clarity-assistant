import { AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface InlineErrorRetryProps {
  message: string;
  onRetry: () => void;
  className?: string;
  compact?: boolean;
}

/** Inline fetch/action error banner with retry — use inside cards and sections. */
export function InlineErrorRetry({
  message,
  onRetry,
  className,
  compact = false,
}: InlineErrorRetryProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5",
        compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2.5 text-sm",
        className,
      )}
    >
      <AlertTriangle
        className={cn("shrink-0 text-destructive", compact ? "w-3.5 h-3.5" : "w-4 h-4")}
        aria-hidden="true"
      />
      <span className="flex-1 text-destructive truncate">{message}</span>
      <Button
        type="button"
        variant="ghost"
        size={compact ? "xs" : "sm"}
        onClick={onRetry}
        className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
        leftIcon={<RefreshCw className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />}
      >
        Retry
      </Button>
    </div>
  );
}
