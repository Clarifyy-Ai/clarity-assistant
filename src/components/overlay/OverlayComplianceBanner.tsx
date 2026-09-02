import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdvisoryBanner } from "@/components/common/AdvisoryBanner";

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

  if (isPill) {
    return (
      <AdvisoryBanner
        icon={Shield}
        title="Visible on screen share."
        compact
        className={cn("rounded-full border-b-0 shrink-0", className)}
      >
        Not hidden from viewers.
      </AdvisoryBanner>
    );
  }

  return (
    <AdvisoryBanner
      icon={Shield}
      title="Visible assistant."
      compact={compact}
      className={cn("rounded-none border-x-0 border-t-0 shrink-0", className)}
    >
      For practice, meetings, and productivity only — stays visible on screen share,
      recordings, and proctoring tools. No concealment.
    </AdvisoryBanner>
  );
}
