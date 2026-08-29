import { Link, useLocation } from "react-router-dom";
import { ArrowLeftRight } from "lucide-react";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import { getProductMode, PRODUCT_MODE_SWITCH } from "@/lib/productMode";
import { useUIStore } from "@/store/uiStore";
import { cn } from "@/lib/utils";

/**
 * Subtle product-mode identity pill for AppShell.
 * Shows on Interview Practice / Gov Exam Prep routes; links to the other mode.
 */
export function ProductModePill({ className }: { className?: string }): JSX.Element | null {
  const { pathname } = useLocation();
  const stealthMode = useUIStore((s) => s.stealth_mode);
  const mode = getProductMode(pathname);

  if (!mode || stealthMode) return null;

  const isGov = mode === "gov";
  const label = isGov ? PRODUCT_NAMES.govExamPrep : PRODUCT_NAMES.interviewPractice;
  const switchLabel = isGov ? PRODUCT_NAMES.interviewPractice : PRODUCT_NAMES.govExamPrep;
  const switchTo = PRODUCT_MODE_SWITCH[mode];

  return (
    <Link
      to={switchTo}
      title={`Switch to ${switchLabel}`}
      aria-label={`Current mode: ${label}. Switch to ${switchLabel}`}
      className={cn(
        "inline-flex items-center gap-1 max-w-[9.5rem] sm:max-w-none truncate",
        "px-2 sm:px-2.5 py-1 rounded-full border text-[10px] sm:text-xs font-medium transition-all",
        isGov
          ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/15"
          : "bg-primary/10 border-primary/25 text-primary hover:bg-primary/15",
        className,
      )}
    >
      <span className="truncate">{label}</span>
      <ArrowLeftRight className="w-3 h-3 shrink-0 opacity-60" aria-hidden />
    </Link>
  );
}
