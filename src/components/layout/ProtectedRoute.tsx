import { memo } from "react";
import { Navigate, Outlet, useLocation, Link } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { Card } from "@/components/ui/card";
import { AppLoadingFallback } from "@/components/layout/AppLoadingFallback";
import { AlertCircle } from "lucide-react";
import { isBillingSuspended } from "@/lib/billing/subscriptionAccess";
import { isElectronApp } from "@/lib/platform/isElectron";
import { openInBrowser } from "@/lib/platform/openInBrowser";
import { Button } from "@/components/ui/button";

interface ProtectedRouteProps {
  requireOnboarding?: boolean;
  requireOnboarded?: boolean;
  requireAdmin?: boolean;
  requireEmailVerification?: boolean;
  loginPath?: string;
  children?: React.ReactNode;
}

export const ProtectedRoute = memo(function ProtectedRoute({
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
  const isAdminResolved = useAuthStore((s) => s.isAdminResolved);
  const isProfileLoaded = useAuthStore((s) => s.isProfileLoaded);
  const isOnboarded = useAuthStore((s) => s.isOnboarded);

  const location = useLocation();

  // FIX Issue 14: blank screen during auth hydration to prevent flash of protected content
  if (status === "idle" || status === "loading") {
    return <AppLoadingFallback />;
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

  // 3a) Billing suspension — past_due beyond 3-day grace (stripe-webhook sets payment_failed_at)
  const billingSuspended =
    isProfileLoaded && isBillingSuspended(profile);
  const onBillingRecoveryPath =
    location.pathname.startsWith("/app/settings/billing") ||
    location.pathname.startsWith("/app/settings/credits");

  if (billingSuspended && !onBillingRecoveryPath) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md p-6">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-destructive mt-1 flex-shrink-0" />
            <div>
              <h2 className="text-lg font-semibold mb-2">Account suspended</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Your subscription payment is overdue. Update your billing details to restore access.
              </p>
              {isElectronApp() ? (
                <Button
                  type="button"
                  className="mr-2"
                  onClick={() => openInBrowser("/app/settings/billing")}
                >
                  Update billing in browser
                </Button>
              ) : (
                <Link
                  to="/app/settings/billing"
                  className="inline-block px-4 py-2 bg-primary rounded-lg text-sm font-medium text-primary-foreground hover:opacity-90 transition mr-2"
                >
                  Update billing
                </Link>
              )}
              <button
                type="button"
                onClick={() => useAuthStore.getState().signOut()}
                className="inline-block px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-secondary transition"
              >
                Sign out
              </button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // 3b) Banned users — block all protected routes
  if (isProfileLoaded && profile?.is_banned) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md p-6">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-destructive mt-1 flex-shrink-0" />
            <div>
              <h2 className="text-lg font-semibold mb-2">Account suspended</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Your account has been suspended. Contact support if you believe this is a mistake.
              </p>
              <button
                type="button"
                onClick={() => useAuthStore.getState().signOut()}
                className="inline-block px-4 py-2 bg-primary rounded-lg text-sm font-medium text-primary-foreground hover:opacity-90 transition"
              >
                Sign out
              </button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // 4) Admin check — wait for profile + definitive role result before denying.
  // Abort/timeout on user_roles must NOT show Access Denied (false negative).
  if (requireAdmin && (!isProfileLoaded || !isAdminResolved)) {
    return <AppLoadingFallback />;
  }
  if (requireAdmin && isAdminResolved && !isAdmin) {
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

  // 5) Email verification check — block unverified users from /app/*
  if (requireEmailVerification && user && !user.email_confirmed_at) {
    return <Navigate to="/verify-email" state={{ from: location }} replace />;
  }

  // 6) Onboarding check — wait for profile before allowing /app (avoids bypass when profile is null)
  if (requireOnboarded || requireOnboarding) {
    if (!isProfileLoaded) {
      return <AppLoadingFallback />;
    }
    if (!isOnboarded) {
      return <Navigate to="/onboarding" state={{ from: location }} replace />;
    }
  }

  // 7) All checks passed
  return children ? <>{children}</> : <Outlet />;
});

export default ProtectedRoute;
