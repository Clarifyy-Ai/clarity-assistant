import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { ProcessingStatus } from "@/components/async/ProcessingStatus";
import { AsyncOperationBanner } from "@/components/async/AsyncOperationBanner";

interface PrepToolShellProps {
  title: string;
  description?: string;
  children: ReactNode;
  isGenerating?: boolean;
  generationLabel?: string;
  generationStage?: string;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
}

/** Shared Prep Lab chrome: progress, error, and consistent spacing. */
export function PrepToolShell({
  title,
  description,
  children,
  isGenerating = false,
  generationLabel = "Generating…",
  generationStage = "generating",
  error,
  onRetry,
  className,
}: PrepToolShellProps) {
  const errorRef = useRef<HTMLDivElement>(null);
  const startedAtRef = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (!isGenerating) {
      startedAtRef.current = null;
      setElapsedMs(0);
      return;
    }
    if (!startedAtRef.current) startedAtRef.current = Date.now();
    const id = window.setInterval(() => {
      setElapsedMs(Date.now() - (startedAtRef.current ?? Date.now()));
    }, 1000);
    return () => window.clearInterval(id);
  }, [isGenerating]);

  return (
    <div className={cn("space-y-4", className)}>
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>

      {isGenerating && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-border bg-secondary/40 px-3 py-2"
        >
          <ProcessingStatus
            message={generationLabel}
            stage={generationStage}
            elapsedMs={elapsedMs}
          />
        </div>
      )}

      {error && (
        <div ref={errorRef} tabIndex={-1} className="outline-none">
          <AsyncOperationBanner
            title="Generation failed"
            message={error}
            retryable={Boolean(onRetry)}
            onRetry={onRetry}
          />
        </div>
      )}

      {children}
    </div>
  );
}

interface SaveToAnswerBankConfirmProps {
  answerId: string;
  onDismiss?: () => void;
}

export function SaveToAnswerBankConfirm({
  answerId,
  onDismiss,
}: SaveToAnswerBankConfirmProps) {
  return (
    <div
      role="status"
      className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm flex flex-wrap items-center gap-2 justify-between"
    >
      <span className="text-emerald-700 dark:text-emerald-300">Saved to Answer Bank</span>
      <div className="flex items-center gap-2">
        <Link
          to={`/app/answers/${answerId}`}
          className="text-xs font-semibold text-primary hover:underline"
        >
          View in Answer Bank
        </Link>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}

/** Prompt fragment: never invent personal achievements without evidence. */
export const PREP_EVIDENCE_POLICY = `
Only use employers, metrics, tools, dates, and achievements that appear in the user's input or verified resume context.
If evidence is missing, ask a clarifying question or insert an explicit [NEEDS EVIDENCE] placeholder — never invent experience.
`.trim();
