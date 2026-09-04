import { useEffect } from "react";
import {
  isRouteErrorResponse,
  useNavigate,
  useRouteError,
} from "react-router-dom";
import { AlertTriangle, Home, LogOut, RefreshCw } from "lucide-react";
import * as Sentry from "@sentry/react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuthStore } from "@/store/authStore";
import { logger } from "@/lib/logger";

const USER_MESSAGE =
  "This page hit an unexpected problem. Your account session is still active — you can retry, go back to the dashboard, or sign out.";

function resolveErrorMessage(error: unknown): string {
  if (isRouteErrorResponse(error)) {
    return error.statusText || USER_MESSAGE;
  }
  if (error instanceof Error && error.message.trim()) {
    return import.meta.env.DEV ? error.message : USER_MESSAGE;
  }
  return USER_MESSAGE;
}

function logRouteError(error: unknown, scope: string): void {
  logger.error("ui.route.error", { error, scope });
  try {
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { scope },
    });
  } catch {
    // Sentry optional
  }
}

export type InShellErrorPanelProps = {
  error: unknown;
  onRetry: () => void;
  homeTo?: string;
  scope?: string;
};

/**
 * Presentational recovery card for in-shell failures (sidebar stays mounted).
 */
export function InShellErrorPanel({
  error,
  onRetry,
  homeTo = "/app/dashboard",
  scope = "route",
}: InShellErrorPanelProps): JSX.Element {
  const navigate = useNavigate();
  const signOut = useAuthStore((s) => s.signOut);

  useEffect(() => {
    logRouteError(error, scope);
  }, [error, scope]);

  const message = resolveErrorMessage(error);
  const showDevStack =
    import.meta.env.DEV && error instanceof Error && Boolean(error.stack);

  async function handleLogout(): Promise<void> {
    try {
      await signOut();
    } finally {
      navigate("/login", { replace: true });
    }
  }

  return (
    <div
      className="flex w-full items-center justify-center px-4 py-10"
      data-testid="route-error-fallback"
      role="alert"
    >
      <Card className="w-full max-w-md space-y-4 border-destructive/30 bg-destructive/5 p-6">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1 space-y-2">
            <h2 className="text-lg font-semibold text-foreground">
              Something went wrong on this page
            </h2>
            <p className="text-sm text-muted-foreground">{message}</p>
            {showDevStack && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer font-medium">
                  Developer details
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto rounded bg-secondary p-2">
                  {error instanceof Error ? error.stack : String(error)}
                </pre>
              </details>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onRetry} leftIcon={<RefreshCw className="h-4 w-4" />}>
            Retry
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(homeTo)}>
            <Home className="mr-2 h-4 w-4" />
            {homeTo.includes("/admin") ? "Admin home" : "Dashboard"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => void handleLogout()}
            leftIcon={<LogOut className="h-4 w-4" />}
            aria-label="Log out"
          >
            Log out
          </Button>
        </div>
      </Card>
    </div>
  );
}

/** React Router `errorElement` — reads the active route error. */
export function RouteErrorFallback({
  homeTo = "/app/dashboard",
  scope = "route",
}: {
  homeTo?: string;
  scope?: string;
} = {}): JSX.Element {
  const error = useRouteError();
  return (
    <InShellErrorPanel
      error={error}
      homeTo={homeTo}
      scope={scope}
      onRetry={() => window.location.reload()}
    />
  );
}

export default RouteErrorFallback;
