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
import { buildLoginUrl, pathWithReturnTo } from "@/lib/auth/safeReturnTo";
import { peekAuthEndReason } from "@/lib/auth/sessionErrors";
import { isUserEmailConfirmed } from "@/lib/auth/emailVerification";
import { logger, LogEvents } from "@/lib/logger";
import {
  hardReloadApp,
  PROFILE_FRIENDLY_ERROR,
  supportMailto,
} from "@/lib/auth/recoveryActions";
import { canRetryAccountRecovery } from "@/lib/auth/accountBootstrap";
import { SUPPORT_EMAIL } from "@/lib/constants/contact";
import { useClaimStoredReferral } from "@/hooks/useClaimStoredReferral";
import { MFA_REQUIRED_REASON } from "@/hooks/useAuth";
import { AUTH_PATHS } from "@/lib/auth/appOrigin";
import { isMfaEnforcementPaused, resolveMfaGateDecision } from "@/lib/auth/mfaGate";
import {
  canBrowseGovExamsBeforeProfileReady,
  canBrowseGovExamsDuringAccountRecovery,
} from "@/lib/gov-exam/govExamRoutes";

interface ProtectedRouteProps {
  requireOnboarding?: boolean;
  requireOnboarded?: boolean;
  requireAdmin?: boolean;
  requireStaff?: boolean;
  loginPath?: string;
  children?: React.ReactNode;
}

const ADMIN_ROLE_WAIT_MS = 6_000;

function AccountLoadErrorCard({
  message,
  loginPath,
  canRetry,
}: {
  message: string;
  loginPath: string;
  canRetry: boolean;
}): JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md p-6">
        <div className="flex gap-3">
          <AlertCircle className="h-5 w-5 text-destructive mt-1 flex-shrink-0" />
          <div>
            <h2 className="text-lg font-semibold mb-2">
              Unable to load your account information
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              {message || PROFILE_FRIENDLY_ERROR}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={!canRetry}
                onClick={() => {
                  void useAuthStore.getState().retryAccountLoad();
                }}
              >
                Retry
              </Button>
              <Button type="button" variant="outline" onClick={hardReloadApp}>
                Reload
              </Button>
              <a
                href={supportMailto("Career Pilot profile load help")}
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
  requireStaff = false,
  loginPath = "/login",
  children,
}: ProtectedRouteProps) {
  const status = useAuthStore((s) => s.status);
  const accountPhase = useAuthStore((s) => s.accountPhase);
  const recoveryAttempts = useAuthStore((s) => s.recoveryAttempts);
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const error = useAuthStore((s) => s.error);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const isModerator = useAuthStore((s) => s.isModerator);
  const isAdminResolved = useAuthStore((s) => s.isAdminResolved);
  const needsStaffGate = requireAdmin || requireStaff;
  const isProfileLoaded = useAuthStore((s) => s.isProfileLoaded);

  const location = useLocation();
  const [adminWaitExpired, setAdminWaitExpired] = useState(false);
  const [mfaAal, setMfaAal] = useState<"pending" | "ok" | "block">("pending");
  const [mfaVerifiedUserId, setMfaVerifiedUserId] = useState<string | null>(null);
  useClaimStoredReferral(user?.id);

  const isLoginPath =
    location.pathname === "/login" || location.pathname.startsWith("/login/");

  const userId = user?.id;

  useEffect(() => {
    if (isLoginPath) {
      setMfaAal("ok");
      return;
    }
    if (!userId || status === "unauthenticated" || status === "idle" || status === "loading") {
      setMfaAal("ok");
      setMfaVerifiedUserId(null);
      return;
    }
    if (status !== "authenticated") {
      setMfaAal("ok");
      return;
    }

    if (mfaVerifiedUserId === userId) {
      setMfaAal("ok");
      return;
    }

    if (isMfaEnforcementPaused()) {
      setMfaVerifiedUserId(userId);
      setMfaAal("ok");
      return;
    }

    let cancelled = false;
    setMfaAal("pending");

    void (async () => {
      try {
        const gate = await resolveMfaGateDecision();
        if (cancelled) return;
        if (gate.decision === "allow") {
          setMfaVerifiedUserId(userId);
          setMfaAal("ok");
        } else {
          setMfaAal("block");
        }
      } catch {
        if (!cancelled) setMfaAal("block");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, status, isLoginPath, mfaVerifiedUserId]);

  useEffect(() => {
    if (!(needsStaffGate && isProfileLoaded && !isAdminResolved)) {
      setAdminWaitExpired(false);
      return;
    }
    const t = window.setTimeout(
      () => setAdminWaitExpired(true),
      ADMIN_ROLE_WAIT_MS,
    );
    return () => window.clearTimeout(t);
  }, [needsStaffGate, isProfileLoaded, isAdminResolved]);

  const mfaBlocked = mfaAal === "pending" || mfaAal === "block";
  const govBrowseBeforeProfile = canBrowseGovExamsBeforeProfileReady({
    pathname: location.pathname,
    status,
    accountPhase,
    hasUser: Boolean(user),
    mfaBlocked,
  });
  const govBrowseDuringRecovery = canBrowseGovExamsDuringAccountRecovery({
    pathname: location.pathname,
    status,
    hasUser: Boolean(user),
    mfaBlocked,
  });

  // Wait for authoritative account context. Government Exam search may render
  // once auth + MFA are ready even if profile bootstrap is still in flight.
  // Note: deriveAccountPhase never returns "AUTHENTICATED" — do not splash on it.
  if (
    accountPhase === "INITIALIZING" ||
    (accountPhase === "ACCOUNT_LOADING" && !govBrowseBeforeProfile)
  ) {
    return <AppLoadingFallback />;
  }

  if (
    (accountPhase === "RECOVERY_REQUIRED" || status === "error") &&
    !govBrowseDuringRecovery
  ) {
    return (
      <AccountLoadErrorCard
        message={error || PROFILE_FRIENDLY_ERROR}
        loginPath={loginPath}
        canRetry={canRetryAccountRecovery(recoveryAttempts)}
      />
    );
  }

  // 3) Not authenticated
  if (!user || status === "unauthenticated") {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    // Prefer pathname + search object so returnTo is never dropped by path-only parsing.
    const loginHref = buildLoginUrl({
      loginPath,
      returnTo,
      reason: peekAuthEndReason() ?? undefined,
    });
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

  // MFA step-up — fail closed. Skip /login itself. Never render the private app
  // while current AAL is aal1 and next is aal2, or if the AAL check throws.
  if (!isLoginPath && status === "authenticated") {
    if (mfaAal === "pending") {
      return <AppLoadingFallback />;
    }
    if (mfaAal === "block") {
      const returnTo = `${location.pathname}${location.search}${location.hash}`;
      const loginHref = buildLoginUrl({
        loginPath,
        returnTo,
        reason: MFA_REQUIRED_REASON,
      });
      const qIndex = loginHref.indexOf("?");
      const to =
        qIndex >= 0
          ? { pathname: loginHref.slice(0, qIndex), search: loginHref.slice(qIndex) }
          : loginHref;
      logger.info(LogEvents.ROUTE_GUARD_DECISION, {
        route: location.pathname,
        authState: "mfa_step_up_required",
        outcome: "succeeded",
        recoveryAction: "redirect_login",
      });
      return <Navigate to={to} state={{ from: location }} replace />;
    }
  }

  // Email verification — always enforced for authenticated protected routes.
  // Embed returnTo in the URL so the deep-link survives verify-page refresh.
  if (!isUserEmailConfirmed(user)) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return (
      <Navigate
        to={pathWithReturnTo("/verify-email", returnTo)}
        state={{ from: location }}
        replace
      />
    );
  }

  if (
    isProfileLoaded &&
    profile?.mfa_reenrollment_required &&
    location.pathname !== AUTH_PATHS.mfaEnroll
  ) {
    logger.info(LogEvents.ROUTE_GUARD_DECISION, {
      route: location.pathname,
      authState: "recovery_required",
      outcome: "succeeded",
      recoveryAction: "redirect_mfa_enroll",
    });
    return <Navigate to={AUTH_PATHS.mfaEnroll} state={{ from: location }} replace />;
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
                  href={supportMailto("Career Pilot suspended account")}
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
  if (needsStaffGate && (!isProfileLoaded || !isAdminResolved)) {
    if (isProfileLoaded && adminWaitExpired) {
      return (
        <AccountLoadErrorCard
          message="Unable to load your account information."
          loginPath={loginPath}
          canRetry={canRetryAccountRecovery(recoveryAttempts)}
        />
      );
    }
    return <AppLoadingFallback />;
  }
  if (needsStaffGate && isAdminResolved && !(isAdmin || (requireStaff && isModerator))) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md p-6">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 mt-1 flex-shrink-0" />
            <div>
              <h2 className="text-lg font-semibold mb-2" tabIndex={-1}>Access Denied</h2>
              <p className="text-sm text-muted-foreground mb-4">
                You are not authorized to access this page.
              </p>
              <Link
                to="/app/dashboard"
                className="inline-block px-4 py-2 bg-primary rounded-lg text-sm font-medium text-primary-foreground hover:opacity-90 transition"
              >
                Return to Dashboard
              </Link>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // 5) Onboarding check — wait for profile before allowing /app (incl. Live).
  // Source of truth is profiles.onboarding_completed (not persisted isOnboarded alone),
  // so a stale local true cannot bypass the gate for incomplete accounts.
  if (requireOnboarded || requireOnboarding) {
    if (!isProfileLoaded && !govBrowseBeforeProfile && !govBrowseDuringRecovery) {
      return <AppLoadingFallback />;
    }
    const completed =
      !isProfileLoaded && (govBrowseBeforeProfile || govBrowseDuringRecovery)
        ? true
        : profile?.onboarding_completed === true;
    if (!completed) {
      logger.info(LogEvents.ROUTE_GUARD_DECISION, {
        route: location.pathname,
        authState: "onboarding_required",
        outcome: "succeeded",
        recoveryAction: "redirect_onboarding",
      });
      return <Navigate to="/onboarding" state={{ from: location }} replace />;
    }
  }

  // 6) All checks passed
  return children ? <>{children}</> : <Outlet />;
});

export default ProtectedRoute;
