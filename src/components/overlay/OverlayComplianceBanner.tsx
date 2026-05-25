import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";

interface OverlayComplianceBannerProps {
  className?: string;
  compact?: boolean;
}

/**
 * Always-visible disclosure: overlay is not hidden from screen share or proctoring.
 */
export function OverlayComplianceBanner({
  className,
  compact = false,
}: OverlayComplianceBannerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-start gap-2 shrink-0 border-b border-indigo-500/15 bg-indigo-500/8",
        compact ? "px-2.5 py-1.5" : "px-3 py-2",
        className
      )}
    >
      <Shield
        className={cn("text-indigo-400 shrink-0 mt-0.5", compact ? "w-3 h-3" : "w-3.5 h-3.5")}
        aria-hidden="true"
      />
      <p
        className={cn(
          "text-indigo-200/90 leading-snug flex-1",
          compact ? "text-[10px]" : "text-[11px]"
        )}
      >
        <span className="font-semibold text-indigo-200">Visible assistant.</span>{" "}
        For practice, meetings, and productivity only — stays visible on screen share,
        recordings, and proctoring tools. No concealment.
      </p>
    </div>
  );
}
