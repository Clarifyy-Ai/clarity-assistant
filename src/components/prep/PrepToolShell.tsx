import { useEffect, useRef, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

interface PrepToolShellProps {
  title: string;
  description?: string;
  children: ReactNode;
  isGenerating?: boolean;
  generationLabel?: string;
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
  error,
  onRetry,
  className,
}: PrepToolShellProps) {
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

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
          className="flex items-center gap-2 rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground"
        >
          <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
          {generationLabel}
        </div>
      )}

      {error && (
        <div
          ref={errorRef}
          role="alert"
          tabIndex={-1}
          className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive space-y-2 outline-none"
        >
          <p className="whitespace-normal break-words">{error}</p>
          {onRetry && (
            <Button type="button" size="sm" variant="outline" onClick={onRetry}>
              Retry
            </Button>
          )}
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
