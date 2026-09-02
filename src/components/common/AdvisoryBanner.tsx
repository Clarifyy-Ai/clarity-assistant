import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type AdvisoryBannerProps = {
  icon: LucideIcon;
  /** Short emphasized lead-in (e.g. "Visible on screen share."). */
  title?: string;
  children: ReactNode;
  compact?: boolean;
  className?: string;
};

/**
 * Theme-aware info banner — WCAG AA contrast in light and dark themes.
 * Use for guide/setup advisories instead of low-opacity indigo-on-indigo text.
 */
export function AdvisoryBanner({
  icon: Icon,
  title,
  children,
  compact = false,
  className,
}: AdvisoryBannerProps) {
  return (
    <div
      role="note"
      className={cn(
        "flex gap-2.5 rounded-xl border px-3 py-2.5 transition-colors",
        "border-brand-300/80 bg-brand-50 text-brand-900",
        "dark:border-indigo-400/35 dark:bg-indigo-950/55 dark:text-indigo-50",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
        className,
      )}
    >
      <Icon
        className={cn(
          "shrink-0 mt-0.5 text-brand-700 dark:text-indigo-300",
          compact ? "w-3.5 h-3.5" : "w-4 h-4",
        )}
        aria-hidden="true"
      />
      <p className={cn("leading-relaxed", compact ? "text-[11px]" : "text-xs")}>
        {title ? (
          <>
            <span className="font-semibold text-brand-950 dark:text-white">{title}</span>{" "}
          </>
        ) : null}
        {children}
      </p>
    </div>
  );
}
