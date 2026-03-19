import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { Spinner } from "@/components/ui/Spinner";
import { Card } from "@/components/ui/Card";
import { AlertCircle } from "lucide-react";

interface ProtectedRouteProps {
  requireOnboarding?: boolean;
  requireOnboarded?: boolean;
  requireAdmin?: boolean;
  requireEmailVerification?: boolean;
  loginPath?: string;
  children?: React.ReactNode;
}

export function ProtectedRoute({
  requireOnboarding = false,
  requireOnboarded = false,
  requireAdmin = false,
  requireEmailVerification = false,
  loginPath = "/login",
  children,
}: ProtectedRouteProps) {
  const status  = useAuthStore((s) => s.status);
  const user    = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const error   = useAuthStore((s) => s.error);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const isOnboarded = useAuthStore((s) => s.isOnboarded);

  const location = useLocation();

  // 1) Loading
  if (status === "idle" || status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner size="lg" />
      </div>
    );
  }

  // 2) Error
  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md p-6">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-destructive mt-1 flex-shrink-0" />
            <div>
              <h2 className="text-lg font-semibold mb-2">Authentication Error</h2>
              <p className="text-sm text-muted-foreground mb-4">
                {error || "Failed to verify your authentication. Please try logging in again."}
              </p>
              <a
                href={loginPath}
                className="inline-block px-4 py-2 bg-primary rounded-lg text-sm font-medium text-primary-foreground hover:opacity-90 transition"
              >
                Return to Login
              </a>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // 3) Not authenticated
  if (!user || status === "unauthenticated") {
    return <Navigate to={loginPath} state={{ from: location }} replace />;
  }

  // 4) Admin check
  if (requireAdmin && !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md p-6">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 mt-1 flex-shrink-0" />
            <div>
              <h2 className="text-lg font-semibold mb-2">Access Denied</h2>
              <p className="text-sm text-muted-foreground mb-4">
                You don't have admin privileges to access this page.
              </p>
              <a
                href="/app/dashboard"
                className="inline-block px-4 py-2 bg-primary rounded-lg text-sm font-medium text-primary-foreground hover:opacity-90 transition"
              >
                Go to Dashboard
              </a>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // 5) Onboarding check
  if ((requireOnboarding || requireOnboarded) && profile && !isOnboarded) {
    return <Navigate to="/onboarding" state={{ from: location }} replace />;
  }

  // 6) All checks passed
  return children ? <>{children}</> : <Outlet />;
}

export default ProtectedRoute;
