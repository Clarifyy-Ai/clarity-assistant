import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface SessionTrustBannerProps {
  className?: string;
  /** Tailor the lead-in for mock vs live vs test flows. */
  variant?: "live" | "mock" | "test";
}

const COPY: Record<NonNullable<SessionTrustBannerProps["variant"]>, string> = {
  live:
    "Practice Coach is designed for interview rehearsal with an AI coach. Do not use during real interviews — covert AI assistance violates most employer and assessment policies.",
  mock:
    "Mock Interview is for practice only. Use it to rehearse answers and build confidence — not during real interviews or proctored assessments.",
  test:
    "Mock tests are for self-paced practice. Do not use AI assistance during real exams or proctored assessments.",
};

export function SessionTrustBanner({
  className,
  variant = "live",
}: SessionTrustBannerProps) {
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300",
        className,
      )}
    >
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
      <span>
        <strong>Practice only.</strong> {COPY[variant]}
      </span>
    </div>
  );
}
