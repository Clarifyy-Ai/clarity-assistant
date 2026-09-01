import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";

interface ComplianceBannerProps {
  className?: string;
}

/**
 * Amber practice-only disclaimer for marketing pages.
 */
export function ComplianceBanner({ className }: ComplianceBannerProps) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex items-start gap-3 text-left",
        className,
      )}
    >
      <Shield className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" aria-hidden="true" />
      <p className="text-xs text-muted-foreground leading-relaxed">
        <strong className="text-foreground font-medium">Practice and rehearsal only.</strong>{" "}
        Career Pilot features are designed for mock interviews and prep sessions — not for use during
        actual third-party interviews, assessments, or employer evaluations.
      </p>
    </div>
  );
}
