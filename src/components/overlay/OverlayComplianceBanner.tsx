import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";

interface OverlayComplianceBannerProps {
  className?: string;
  compact?: boolean;
  variant?: "default" | "pill";
}

/**
 * Always-visible disclosure: overlay is not hidden from screen share or proctoring.
 */
export function OverlayComplianceBanner({
  className,
  compact = false,
  variant = "default",
}: OverlayComplianceBannerProps) {
  const isPill = variant === "pill";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-start gap-2 shrink-0 border-b border-indigo-500/15 bg-indigo-500/8",
        isPill ? "px-2 py-1 rounded-full border border-indigo-500/20" : compact ? "px-2.5 py-1.5" : "px-3 py-2",
        className
      )}
    >
      <Shield
        className={cn("text-indigo-400 shrink-0 mt-0.5", isPill || compact ? "w-3 h-3" : "w-3.5 h-3.5")}
        aria-hidden="true"
      />
      <p
        className={cn(
          "text-indigo-200/90 leading-snug flex-1",
          isPill ? "text-[9px]" : compact ? "text-[10px]" : "text-[11px]"
        )}
      >
        {isPill ? (
          <>
            <span className="font-semibold text-indigo-200">Visible on screen share.</span>{" "}
            Not hidden from viewers.
          </>
        ) : (
          <>
            <span className="font-semibold text-indigo-200">Visible assistant.</span>{" "}
            For practice, meetings, and productivity only — stays visible on screen share,
            recordings, and proctoring tools. No concealment.
          </>
        )}
      </p>
    </div>
  );
}
