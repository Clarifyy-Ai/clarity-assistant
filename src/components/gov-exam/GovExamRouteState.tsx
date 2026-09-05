import { Link } from "react-router-dom";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import {
  govExamPhaseLabel,
  type GovExamRouteResolution,
} from "@/lib/gov-exam/routeResolution";

type GovExamRouteStateProps = {
  resolution: GovExamRouteResolution;
  onRetry?: () => void;
  backHref?: string;
  backLabel?: string;
};

export function GovExamRouteState({
  resolution,
  onRetry,
  backHref = "/app/mock-test",
  backLabel = "Back to Government Exams",
}: GovExamRouteStateProps) {
  if (resolution.phase === "AUTH_INITIALIZING") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  const title = govExamPhaseLabel(resolution.phase) || "Unable to load";
  const message =
    "message" in resolution ? resolution.message : "Please try again.";

  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 p-6">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="text-sm text-muted-foreground">{message}</p>
              {"correlationId" in resolution && resolution.correlationId ? (
                <p className="text-xs text-muted-foreground font-mono">
                  Ref: {resolution.correlationId}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(resolution.phase === "TEMPORARY_BACKEND_FAILURE" ||
              resolution.phase === "UNSUPPORTED_EXAM") &&
              onRetry && (
                <Button type="button" variant="primary" onClick={onRetry}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              )}
            <Link
              to={backHref}
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-medium hover:bg-secondary"
            >
              {backLabel}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
