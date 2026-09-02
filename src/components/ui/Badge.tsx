import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

// ─────────────────────────────────────────────────────────────────
// Badge
// Inline label chip used across scorecard, categories, tags.
// ─────────────────────────────────────────────────────────────────

export type BadgeVariant =
  | "default" | "primary" | "violet" | "emerald" | "red"
  | "amber" | "blue" | "gray" | "outline" | "secondary";

interface BadgeProps {
  children:   ReactNode;
  variant?:   BadgeVariant;
  size?:      "sm" | "md";
  dot?:       boolean;
  className?: string;
  onClick?:   () => void;
}

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  default:   "bg-secondary border-border text-muted-foreground",
  primary:   "bg-primary/10 border-primary/20 text-primary",
  violet:    "bg-primary/10 border-primary/20 text-primary",
  emerald:   "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-300",
  red:       "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400",
  amber:     "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400",
  blue:      "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-300",
  gray:      "bg-secondary border-border text-muted-foreground",
  outline:   "bg-transparent border-border text-foreground",
  secondary: "bg-secondary border-border text-secondary-foreground",
};

const DOT_COLORS: Record<BadgeVariant, string> = {
  default:   "bg-muted-foreground",
  primary:   "bg-primary",
  violet:    "bg-primary",
  emerald:   "bg-emerald-400",
  red:       "bg-red-400",
  amber:     "bg-amber-400",
  blue:      "bg-blue-400",
  gray:      "bg-muted-foreground",
  outline:   "bg-muted-foreground",
  secondary: "bg-muted-foreground",
};

export function Badge({
  children,
  variant  = "default",
  size     = "sm",
  dot      = false,
  className,
  onClick,
}: BadgeProps) {
  const label = typeof children === "string" ? children : undefined;
  const classes = cn(
    "inline-flex items-center gap-1.5 border rounded-full font-medium min-w-0 max-w-full",
    size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
    VARIANT_STYLES[variant],
    onClick && [
      "cursor-pointer hover:opacity-90 transition-opacity duration-150",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    ],
    className,
  );

  const text = (
    <span className="min-w-0 max-w-full truncate" title={label}>
      {children}
    </span>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes} title={label}>
        {dot && (
          <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", DOT_COLORS[variant])} aria-hidden="true" />
        )}
        {text}
      </button>
    );
  }

  return (
    <span className={classes} title={label}>
      {dot && (
        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", DOT_COLORS[variant])} aria-hidden="true" />
      )}
      {text}
    </span>
  );
}
