// src/pages/auth/AuthCallback.tsx
//
// Handles redirects from:
// - OAuth providers
// - magic-link emails
// - password recovery links
//
// Supabase detects the session from the URL automatically because
// detectSessionInUrl is enabled in the Supabase client.
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

type CallbackError = {
  message: string;
  description?: string;
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

  return {
    message: "Authentication failed.",
    description:
      errorDescription ||
      errorCode ||
      error ||
      "Please try signing in again.",
  };
}

function getSafeRedirectTarget(options: {
  isAdmin: boolean;
  isOnboarded: boolean;
}): string {
  if (options.isAdmin) {
    return "/app/admin";
  }

  if (!options.isOnboarded) {
    return "/onboarding";
  }

  return "/app/dashboard";
}

export default function AuthCallback(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();

  const status = useAuthStore((state) => state.status);
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
      const params = new URLSearchParams({
        error: "auth_failed",
        message: callbackError.description ?? callbackError.message,
      });

      navigate(`/login?${params.toString()}`, { replace: true });
    }
  }, [callbackError, navigate]);

  useEffect(() => {
    if (callbackError) {
      return;
    }

    if (status === "idle") {
      void initialize();
    }
  }, [callbackError, initialize, status]);

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

    if (status === "authenticated" && isProfileLoaded) {
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
