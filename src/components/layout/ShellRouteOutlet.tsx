import { Outlet, useSearchParams } from "react-router-dom";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { InShellErrorPanel } from "@/components/layout/RouteErrorFallback";

/**
 * Nested under AppShell / AdminLayout so chrome stays mounted when a child page throws.
 * Also used as the React Router path that owns `errorElement`.
 */
export function ShellRouteOutlet({
  homeTo = "/app/dashboard",
  scope = "app-shell",
}: {
  homeTo?: string;
  scope?: string;
}): JSX.Element {
  return (
    <ErrorBoundary
      fallback={(error, retry) => (
        <InShellErrorPanel
          error={error}
          onRetry={retry}
          homeTo={homeTo}
          scope={scope}
        />
      )}
    >
      <Outlet />
    </ErrorBoundary>
  );
}

/**
 * DEV / QA probe: `/app/dashboard?qa_force_route_error=1` throws during render
 * so error recovery (sidebar preserved) can be verified.
 */
export function QaForceRouteErrorProbe({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  const [params] = useSearchParams();
  if (
    (import.meta.env.DEV || import.meta.env.MODE === "test") &&
    params.get("qa_force_route_error") === "1"
  ) {
    throw new Error("QA forced route error (intentional)");
  }
  return <>{children}</>;
}
