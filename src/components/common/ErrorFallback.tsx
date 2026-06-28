import { useCallback } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface ErrorFallbackProps {
  error?: Error | null;
  errorInfo?: React.ErrorInfo | null;
  resetError?: () => void;
  title?: string;
  description?: string;
  showDetails?: boolean;
  showHomeButton?: boolean;
  className?: string;
}

export function ErrorFallback({
  error,
  errorInfo,
  resetError,
  title = "Something went wrong",
  description = "An unexpected error occurred. Please try again or contact support if the problem persists.",
  showDetails = process.env.NODE_ENV === "development",
  showHomeButton = true,
  className,
}: ErrorFallbackProps) {
  const handleGoHome = useCallback(() => {
    window.location.href = "/";
  }, []);

  const handleReload = useCallback(() => {
    window.location.reload();
  }, []);

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-6 min-h-[400px] px-6 py-12 text-center",
        className
      )}
    >
      {/* Icon */}
      <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
        <AlertTriangle className="w-8 h-8 text-destructive" />
      </div>

      {/* Message */}
      <div className="flex flex-col gap-2 max-w-md">
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {resetError && (
          <Button variant="primary" onClick={resetError} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Try Again
          </Button>
        )}
        <Button variant="outline" onClick={handleReload} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Reload Page
        </Button>
        {showHomeButton && (
          <Button variant="ghost" onClick={handleGoHome} className="gap-2">
            <Home className="w-4 h-4" />
            Go Home
          </Button>
        )}
      </div>

      {/* Dev-only error details */}
      {showDetails && error && (
        <details className="w-full max-w-2xl text-left mt-2">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
            Error Details (dev only)
          </summary>
          <div className="mt-3 space-y-3">
            <div className="rounded-md bg-muted/60 border border-border p-4 overflow-auto">
              <p className="text-xs font-semibold text-destructive mb-1">
                {error.name}: {error.message}
              </p>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                {error.stack}
              </pre>
            </div>
            {errorInfo?.componentStack && (
              <div className="rounded-md bg-muted/60 border border-border p-4 overflow-auto">
                <p className="text-xs font-semibold text-foreground mb-1">
                  Component Stack:
                </p>
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                  {errorInfo.componentStack}
                </pre>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
