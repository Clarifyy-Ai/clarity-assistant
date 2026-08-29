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
      data-testid="session-trust-banner"
      className={cn(
        "flex items-start gap-3 rounded-xl border border-amber-600/40 bg-amber-100/90 dark:bg-amber-500/15 px-4 py-3.5 text-sm text-amber-950 dark:text-amber-100 min-w-0",
        className,
      )}
    >
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-800 dark:text-amber-300" aria-hidden />
      <span className="min-w-0 flex-1 break-words leading-relaxed">
        <strong>Practice only.</strong> {COPY[variant]}
      </span>
    </div>
  );
}
