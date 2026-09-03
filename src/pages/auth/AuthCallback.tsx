// src/pages/auth/AuthCallback.tsx
//
// Handles redirects from:
// - OAuth providers
// - magic-link emails
// - password recovery links
//
// Supabase consumes ?code= / hash tokens only on callback and recovery URLs
// (detectSessionInUrl is path-gated so /login leftover params cannot 400).
//
// SECURITY PURPOSE:
// - Avoid open redirects
// - Handle provider callback errors safely
// - Wait for auth store resolution
// - Prevent infinite loading state
// - Route admins/users/onboarding safely

import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useAuthStore } from "@/store/authStore";
import { isUserEmailConfirmed } from "@/lib/auth/emailVerification";
import { getAuthenticatedEntryPath } from "@/lib/auth/postAuthRedirect";
import {
  isOAuthCancelledError,
  isOAuthNotConfiguredError,
  isOAuthStateMismatchError,
} from "@/lib/auth/oauthProviders";
import { classifyLoginFailure } from "@/lib/auth/loginFailure";
import {
  isPasswordRecoveryFlowMarked,
  resolveAuthDeepLinkRedirect,
} from "@/lib/auth/authDeepLinkRedirect";

type CallbackError = {
  loginQueryError: string;
};

const AUTH_CALLBACK_TIMEOUT_MS = 12_000;

function getCallbackError(search: string, hash: string): CallbackError | null {
  const searchParams = new URLSearchParams(search);
  const hashParams = new URLSearchParams(hash.replace(/^#/, ""));

  const error =
    searchParams.get("error") ||
    hashParams.get("error");

  const errorDescription =
    searchParams.get("error_description") ||
    hashParams.get("error_description");

  const errorCode =
    searchParams.get("error_code") ||
    hashParams.get("error_code");

  if (!error && !errorDescription && !errorCode) {
    return null;
  }

  if (isOAuthCancelledError(error, errorDescription ?? errorCode)) {
    return { loginQueryError: "cancelled" };
  }

  if (isOAuthStateMismatchError(error, errorDescription, errorCode)) {
    return { loginQueryError: "AUTH_OAUTH_STATE_MISMATCH" };
  }

  if (isOAuthNotConfiguredError(error, errorDescription, errorCode)) {
    return { loginQueryError: "not_configured" };
  }

  const classified = classifyLoginFailure({
    message: errorDescription || error || "",
    code: errorCode || error || undefined,
    error_description: errorDescription ?? undefined,
    error_code: errorCode ?? undefined,
  });

  return { loginQueryError: classified.code };
}

function getSafeRedirectTarget(options: {
  isAdmin: boolean;
  isOnboarded: boolean;
}): string {
  return getAuthenticatedEntryPath(options);
}

export default function AuthCallback(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();

  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const isOnboarded = useAuthStore((state) => state.isOnboarded);
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const isProfileLoaded = useAuthStore((state) => state.isProfileLoaded);
  const initialize = useAuthStore((state) => state.initialize);

  const [timedOut, setTimedOut] = useState(false);

  const callbackError = useMemo(
    () => getCallbackError(location.search, location.hash),
    [location.search, location.hash]
  );

  useEffect(() => {
    if (callbackError) {
      navigate(`/login?error=${encodeURIComponent(callbackError.loginQueryError)}`, {
        replace: true,
      });
    }
  }, [callbackError, navigate]);

  useEffect(() => {
    const recoveryTarget = resolveAuthDeepLinkRedirect({
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
      recoveryFlag: isPasswordRecoveryFlowMarked(),
    });
    if (recoveryTarget?.startsWith("/reset-password")) {
      navigate(recoveryTarget, { replace: true });
    }
  }, [location.pathname, location.search, location.hash, navigate]);

  useEffect(() => {
    if (callbackError) {
      return;
    }

    if (isPasswordRecoveryFlowMarked()) {
      navigate(`/reset-password${location.search}${location.hash}`, { replace: true });
      return;
    }

    if (status === "idle") {
      void initialize();
    }
  }, [callbackError, initialize, status, navigate, location.search, location.hash]);

  useEffect(() => {
    if (callbackError) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setTimedOut(true);
    }, AUTH_CALLBACK_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [callbackError]);

  useEffect(() => {
    if (callbackError || timedOut) {
      return;
    }

    if (isPasswordRecoveryFlowMarked()) {
      navigate(`/reset-password${location.search}${location.hash}`, { replace: true });
      return;
    }

    if (status === "authenticated" && isProfileLoaded) {
      if (!isUserEmailConfirmed(user)) {
        navigate("/verify-email", { replace: true });
        return;
      }

      const target = getSafeRedirectTarget({
        isAdmin,
        isOnboarded,
      });

      navigate(target, { replace: true });
      return;
    }

    if (status === "unauthenticated" || status === "error") {
      navigate("/login?error=auth_failed", { replace: true });
    }
  }, [
    callbackError,
    timedOut,
    status,
    isProfileLoaded,
    isAdmin,
    isOnboarded,
    navigate,
    user,
    location.search,
    location.hash,
  ]);

  if (timedOut) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-sm text-center space-y-4">
          <div className="h-12 w-12 rounded-full border border-amber-500/30 bg-amber-500/10 flex items-center justify-center mx-auto">
            <span className="text-amber-500 text-xl">!</span>
          </div>

          <div>
            <h1 className="text-lg font-semibold text-foreground">
              Sign-in is taking longer than expected
            </h1>

            <p className="text-sm text-muted-foreground mt-2">
              Your authentication session could not be confirmed. Please try
              signing in again.
            </p>
          </div>

          <Link
            to="/login?error=auth_timeout"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="text-center space-y-4">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />

        <div>
          <p className="text-sm text-foreground font-medium">
            Signing you in…
          </p>

          <p className="text-xs text-muted-foreground mt-1">
            Please wait while we verify your session.
          </p>
        </div>
      </div>
    </div>
  );
}
