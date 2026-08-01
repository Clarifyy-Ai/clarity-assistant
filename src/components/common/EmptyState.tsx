import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-3 py-8 px-4" : "gap-5 py-16 px-6",
        className
      )}
    >
      {/* Icon container */}
      {Icon && (
        <div
          className={cn(
            "rounded-full bg-muted flex items-center justify-center",
            compact ? "w-12 h-12" : "w-16 h-16"
          )}
        >
          <Icon
            className={cn(
              "text-muted-foreground",
              compact ? "w-5 h-5" : "w-7 h-7"
            )}
          />
        </div>
      )}

      {/* Text */}
      <div className="flex flex-col gap-1.5 max-w-sm">
        <h3
          className={cn(
            "font-semibold text-foreground",
            compact ? "text-sm" : "text-base"
          )}
        >
          {title}
        </h3>
        {description && (
          <p
            className={cn(
              "text-muted-foreground leading-relaxed",
              compact ? "text-xs" : "text-sm"
            )}
          >
            {description}
          </p>
        )}
      </div>

      {/* Actions */}
      {(actionLabel || secondaryActionLabel) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {actionLabel && onAction && (
            <Button
              variant="primary"
              size={compact ? "sm" : "default"}
              onClick={onAction}
            >
              {actionLabel}
            </Button>
          )}
          {secondaryActionLabel && onSecondaryAction && (
            <Button
              variant="outline"
              size={compact ? "sm" : "default"}
              onClick={onSecondaryAction}
            >
              {secondaryActionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
