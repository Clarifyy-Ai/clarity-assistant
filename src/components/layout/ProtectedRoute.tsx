import { memo, useEffect, useState } from "react";
import { Navigate, Outlet, useLocation, Link } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { Card } from "@/components/ui/Card";
import { AppLoadingFallback } from "@/components/layout/AppLoadingFallback";
import { AlertCircle } from "lucide-react";
import { isBillingSuspended } from "@/lib/billing/subscriptionAccess";
import { isElectronApp } from "@/lib/platform/isElectron";
import { openInBrowser } from "@/lib/platform/openInBrowser";
import { Button } from "@/components/ui/Button";
import { buildLoginUrl } from "@/lib/auth/safeReturnTo";
import { isUserEmailConfirmed } from "@/lib/auth/emailVerification";
import { logger, LogEvents } from "@/lib/logger";
import {
  hardReloadApp,
  PROFILE_FRIENDLY_ERROR,
  supportMailto,
} from "@/lib/auth/recoveryActions";
import { SUPPORT_EMAIL } from "@/lib/constants/contact";

interface ProtectedRouteProps {
  requireOnboarding?: boolean;
  requireOnboarded?: boolean;
  requireAdmin?: boolean;
  requireEmailVerification?: boolean;
  loginPath?: string;
  children?: React.ReactNode;
}

const ADMIN_ROLE_WAIT_MS = 8_000;

function AccountLoadErrorCard({
  message,
  loginPath,
}: {
  message: string;
  loginPath: string;
}): JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md p-6">
        <div className="flex gap-3">
          <AlertCircle className="h-5 w-5 text-destructive mt-1 flex-shrink-0" />
          <div>
            <h2 className="text-lg font-semibold mb-2">
              We couldn&apos;t load your account
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              {message || PROFILE_FRIENDLY_ERROR}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => {
                  const auth = useAuthStore.getState();
                  if (auth.user?.id) {
                    void auth.loadProfile();
                  } else {
                    void auth.initialize();
                  }
                }}
              >
                Try again
              </Button>
              <Button type="button" variant="outline" onClick={hardReloadApp}>
                Reload
              </Button>
              <a
                href={supportMailto("Clarify AI profile load help")}
                className="inline-flex items-center px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-secondary transition"
              >
                Contact support
              </a>
              <a
                href={loginPath}
                className="inline-block px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-secondary transition"
              >
                Return to login
              </a>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Support: {SUPPORT_EMAIL}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function isBillingRecoveryPath(pathname: string): boolean {
  return (
    pathname.startsWith("/app/settings/billing") ||
    pathname.startsWith("/app/settings/credits") ||
    pathname === "/help" ||
    pathname.startsWith("/help/")
  );
}

export const ProtectedRoute = memo(function ProtectedRoute({
  requireOnboarding = false,
  requireOnboarded = false,
  requireAdmin = false,
  requireEmailVerification = false,
  loginPath = "/login",
  children,
}: ProtectedRouteProps) {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const error = useAuthStore((s) => s.error);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const isAdminResolved = useAuthStore((s) => s.isAdminResolved);
  const isProfileLoaded = useAuthStore((s) => s.isProfileLoaded);
  const isOnboarded = useAuthStore((s) => s.isOnboarded);

  const location = useLocation();
  const [adminWaitExpired, setAdminWaitExpired] = useState(false);

  useEffect(() => {
    if (!(requireAdmin && isProfileLoaded && !isAdminResolved)) {
      setAdminWaitExpired(false);
      return;
    }
    const t = window.setTimeout(
      () => setAdminWaitExpired(true),
      ADMIN_ROLE_WAIT_MS,
    );
    return () => window.clearTimeout(t);
  }, [requireAdmin, isProfileLoaded, isAdminResolved]);

  // FIX Issue 14: blank screen during auth hydration to prevent flash of protected content
  if (status === "idle" || status === "loading") {
    return <AppLoadingFallback />;
  }

  // 2) Error — recoverable: Retry / Reload / Contact support / Login
  if (status === "error") {
    return (
      <AccountLoadErrorCard
        message={error || PROFILE_FRIENDLY_ERROR}
        loginPath={loginPath}
      />
    );
  }

  // 3) Not authenticated
  if (!user || status === "unauthenticated") {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    // Prefer pathname + search object so returnTo is never dropped by path-only parsing.
    const loginHref = buildLoginUrl({ loginPath, returnTo });
    const qIndex = loginHref.indexOf("?");
    const to =
      qIndex >= 0
        ? { pathname: loginHref.slice(0, qIndex), search: loginHref.slice(qIndex) }
        : loginHref;
    logger.info(LogEvents.ROUTE_GUARD_DECISION, {
      route: location.pathname,
      authState: "anonymous",
      outcome: "succeeded",
      recoveryAction: "redirect_login",
    });
    return <Navigate to={to} state={{ from: location }} replace />;
  }

  // 3a) Email verification — before profile-dependent gates so unverified users
  // cannot flash /onboarding or /app while profile/ban checks resolve.
  if (requireEmailVerification && !isUserEmailConfirmed(user)) {
    return <Navigate to="/verify-email" state={{ from: location }} replace />;
  }

  // 3b) Billing suspension — past_due beyond 3-day grace (stripe-webhook sets payment_failed_at)
  const billingSuspended = isProfileLoaded && isBillingSuspended(profile);
  const onBillingRecoveryPath = isBillingRecoveryPath(location.pathname);

  if (billingSuspended && !onBillingRecoveryPath) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md p-6">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-destructive mt-1 flex-shrink-0" />
            <div>
              <h2 className="text-lg font-semibold mb-2">Payment past due</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Your subscription payment is overdue. Update billing to restore
                paid features, or visit Help if you need assistance.
              </p>
              <div className="flex flex-wrap gap-2">
                {isElectronApp() ? (
                  <Button
                    type="button"
                    onClick={() => openInBrowser("/app/settings/billing")}
                  >
                    Update billing in browser
                  </Button>
                ) : (
                  <Link
                    to="/app/settings/billing"
                    className="inline-block px-4 py-2 bg-primary rounded-lg text-sm font-medium text-primary-foreground hover:opacity-90 transition"
                  >
                    Update billing
                  </Link>
                )}
                <Link
                  to="/help"
                  className="inline-block px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-secondary transition"
                >
                  Help
                </Link>
                <button
                  type="button"
                  onClick={() => useAuthStore.getState().signOut()}
                  className="inline-block px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-secondary transition"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // 3c) Banned users — block all protected routes with dedicated suspended UI
  if (isProfileLoaded && profile?.is_banned) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md p-6">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-destructive mt-1 flex-shrink-0" />
            <div>
              <h2 className="text-lg font-semibold mb-2">Account suspended</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Your account has been suspended. Contact support if you believe
                this is a mistake.
              </p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={supportMailto("Clarify AI suspended account")}
                  className="inline-block px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-secondary transition"
                >
                  Contact support
                </a>
                <Link
                  to="/help"
                  className="inline-block px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-secondary transition"
                >
                  Help
                </Link>
                <button
                  type="button"
                  onClick={() => useAuthStore.getState().signOut()}
                  className="inline-block px-4 py-2 bg-primary rounded-lg text-sm font-medium text-primary-foreground hover:opacity-90 transition"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // 4) Admin check — wait for profile + definitive role result before denying.
  // After ADMIN_ROLE_WAIT_MS, show recoverable error instead of infinite loading.
  if (requireAdmin && (!isProfileLoaded || !isAdminResolved)) {
    if (isProfileLoaded && adminWaitExpired) {
      return (
        <AccountLoadErrorCard
          message="We couldn't verify your admin permissions. Please try again."
          loginPath={loginPath}
        />
      );
    }
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
                You don&apos;t have admin privileges to access this page.
              </p>
              <Link
                to="/app/dashboard"
                className="inline-block px-4 py-2 bg-primary rounded-lg text-sm font-medium text-primary-foreground hover:opacity-90 transition"
              >
                Go to Dashboard
              </Link>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // 5) Onboarding check — wait for profile before allowing /app
  if (requireOnboarded || requireOnboarding) {
    if (!isProfileLoaded) {
      return <AppLoadingFallback />;
    }
    if (!isOnboarded) {
      return <Navigate to="/onboarding" state={{ from: location }} replace />;
    }
  }

  // 6) All checks passed
  return children ? <>{children}</> : <Outlet />;
});

export default ProtectedRoute;
