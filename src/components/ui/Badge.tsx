import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

// ─────────────────────────────────────────────────────────────────
// Badge
// Inline label chip used across scorecard, categories, tags.
// ─────────────────────────────────────────────────────────────────

export type BadgeVariant =
  | "default" | "violet" | "emerald" | "red"
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
  violet:    "bg-violet-500/10 border-violet-500/20 text-violet-600 dark:text-violet-300",
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
  violet:    "bg-violet-400",
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
  return (
    <span
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 border rounded-full font-medium",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        VARIANT_STYLES[variant],
        onClick && "cursor-pointer hover:opacity-80 transition-opacity",
        className
      )}
    >
      {dot && (
        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", DOT_COLORS[variant])} />
      )}
      {children}
    </span>
  );
}
