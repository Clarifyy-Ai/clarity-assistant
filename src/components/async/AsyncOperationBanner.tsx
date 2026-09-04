import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type AsyncOperationBannerProps = {
  title: string;
  message: string;
  retryable?: boolean;
  onRetry?: () => void;
  onCancel?: () => void;
  className?: string;
};

export function AsyncOperationBanner({
  title,
  message,
  retryable,
  onRetry,
  onCancel,
  className,
}: AsyncOperationBannerProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-3 space-y-2 min-w-0",
        className,
      )}
      role="alert"
      data-testid="async-operation-banner"
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground leading-relaxed break-words">
        {message}
      </p>
      <div className="flex flex-wrap gap-2">
        {retryable !== false && onRetry && (
          <Button type="button" variant="primary" size="xs" onClick={onRetry}>
            Retry
          </Button>
        )}
        {onCancel && (
          <Button type="button" variant="secondary" size="xs" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
