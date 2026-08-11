// src/components/auth/OAuthButton.tsx
//
// OAuth sign-in buttons with feature-flag gating and clear error states.
//
// IMPORTANT — Supabase OAuth flow note:
// signInWithOAuth() initiates a browser redirect. The current page unloads
// immediately on success, so onSuccess() and navigate() are usually NOT called
// from the success branch in redirect-mode OAuth.
//
// The actual post-auth redirect is handled by the callback route configured
// in Supabase Dashboard.

import { useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Github, ShieldOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useAuthStore } from "@/store/authStore";
import { sanitizeText } from "@/lib/security";
import { cn } from "@/lib/utils";
import {
  getEnabledOAuthProviders,
  isOAuthProviderEnabled,
  type OAuthProviderId,
} from "@/lib/auth/oauthProviders";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type OAuthProviderName = OAuthProviderId;

export interface OAuthProvider {
  name: OAuthProviderName;
  label: string;
  icon: ReactNode;
}

interface OAuthButtonProps {
  provider: OAuthProvider;
  enabled?: boolean;
  disabledReason?: string;
  onSuccess?: () => void;
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const REFERRAL_STORAGE_KEY = "clarify_ref";

const ALLOWED_OAUTH_PROVIDERS = new Set<OAuthProviderName>(
  getEnabledOAuthProviders()
);

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  provider_disabled:
    "{provider} login is currently unavailable — please use email/password.",
  oauth_provider_not_found:
    "{provider} login is not configured. Please use email/password.",
  redirect_uri_mismatch:
    "{provider} login failed due to a configuration error. Please contact support.",
  access_denied:
    "Access was denied by {provider}. You may have cancelled the sign-in.",
  server_error:
    "{provider} login is temporarily unavailable. Please try again or use email/password.",
  "failed to fetch":
    "Network error — please check your connection and try again.",
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getOAuthErrorMessage(
  rawMessage: string,
  providerLabel: string
): string {
  const normalizedRawMessage = rawMessage.toLowerCase();

  for (const [key, template] of Object.entries(OAUTH_ERROR_MESSAGES)) {
    if (normalizedRawMessage.includes(key.toLowerCase())) {
      return template.replace("{provider}", providerLabel);
    }
  }

  return `${providerLabel} login is currently unavailable — please use email/password instead.`;
}

function extractErrorDescription(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  return "Unknown error";
}

function extractErrorCode(error: unknown): string | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }

  return null;
}

function normalizeReferralCode(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const sanitized = sanitizeText(value)
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 100);

  return sanitized.length > 0 ? sanitized : null;
}

function safeSetLocalStorageItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures. OAuth should still continue.
  }
}

function assertAllowedProvider(provider: OAuthProviderName): boolean {
  return isOAuthProviderEnabled(provider) && ALLOWED_OAUTH_PROVIDERS.has(provider);
}

// ─────────────────────────────────────────────────────────────────────────────
// OAuth Button
// ─────────────────────────────────────────────────────────────────────────────

export const OAuthButton = ({
  provider,
  enabled = true,
  disabledReason,
  onSuccess,
  className,
}: OAuthButtonProps): JSX.Element => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const signInWithOAuth = useAuthStore((state) => state.signInWithOAuth);

  const [isLoading, setIsLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  if (!enabled) {
    return (
      <div className={cn("w-full flex flex-col items-center gap-1.5", className)}>
        <button
          type="button"
          disabled
          aria-disabled="true"
          title={
            disabledReason ??
            `${provider.label} login is currently unavailable`
          }
          className={cn(
            "w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg",
            "border border-border bg-muted/30 text-muted-foreground/50",
            "cursor-not-allowed opacity-60 select-none"
          )}
        >
          <ShieldOff className="h-4 w-4 shrink-0" />
          Continue with {provider.label}
        </button>

        <p className="text-[11px] text-muted-foreground text-center px-2">
          {disabledReason ??
            `${provider.label} login is currently unavailable — please use email/password`}
        </p>
      </div>
    );
  }

  const handleOAuthLogin = async (): Promise<void> => {
    if (isLoading) {
      return;
    }

    setIsLoading(true);
    setLastError(null);

    try {
      if (!assertAllowedProvider(provider.name)) {
        throw new Error("Unsupported OAuth provider.");
      }

      const refCode = normalizeReferralCode(searchParams.get("ref"));

      if (refCode) {
        safeSetLocalStorageItem(REFERRAL_STORAGE_KEY, refCode);
      }

      await signInWithOAuth(provider.name);

      // Usually unreachable in Supabase redirect mode.
      if (onSuccess) {
        onSuccess();
      } else {
        navigate("/app", { replace: true });
      }
    } catch (caughtError: unknown) {
      const rawMessage = extractErrorDescription(caughtError);
      const code = extractErrorCode(caughtError);

      const message = getOAuthErrorMessage(rawMessage, provider.label);

      setLastError(message);

      toast.error(message, {
        description: code ? `Error code: ${code}` : undefined,
        duration: 6000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("w-full flex flex-col gap-1.5", className)}>
      <Button
        type="button"
        onClick={() => {
          void handleOAuthLogin();
        }}
        disabled={isLoading}
        variant="outline"
        className={cn(
          "w-full flex items-center justify-center gap-2 py-2 rounded-lg",
          "border border-border hover:bg-secondary/60 transition-colors",
          lastError && "border-red-500/40 bg-red-500/5"
        )}
        aria-busy={isLoading}
      >
        {isLoading ? (
          <>
            <Spinner className="h-4 w-4 shrink-0" />
            <span>Connecting to {provider.label}…</span>
          </>
        ) : (
          <>
            {provider.icon}
            <span>Continue with {provider.label}</span>
          </>
        )}
      </Button>

      {lastError && (
        <p
          role="alert"
          className="text-[11px] text-red-400 text-center px-1 leading-relaxed"
        >
          {lastError}
        </p>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Preset Buttons
// ─────────────────────────────────────────────────────────────────────────────

export const GoogleOAuthButton = (
  props: Omit<OAuthButtonProps, "provider">
): JSX.Element => (
  <OAuthButton
    provider={{
      name: "google",
      label: "Google",
      icon: (
        <svg
          className="h-4 w-4 shrink-0"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path
            fill="currentColor"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="currentColor"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="currentColor"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="currentColor"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
      ),
    }}
    {...props}
  />
);

export const GithubOAuthButton = (
  props: Omit<OAuthButtonProps, "provider">
): JSX.Element => (
  <OAuthButton
    provider={{
      name: "github",
      label: "GitHub",
      icon: <Github className="h-4 w-4 shrink-0" aria-hidden="true" />,
    }}
    {...props}
  />
);

export const LinkedInOAuthButton = (
  props: Omit<OAuthButtonProps, "provider">
): JSX.Element => (
  <OAuthButton
    provider={{
      name: "linkedin_oidc",
      label: "LinkedIn",
      icon: (
        <svg
          className="h-4 w-4 shrink-0"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path
            fill="currentColor"
            d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"
          />
        </svg>
      ),
    }}
    {...props}
  />
);

export const AzureOAuthButton = (
  props: Omit<OAuthButtonProps, "provider">
): JSX.Element => (
  <OAuthButton
    provider={{
      name: "azure",
      label: "Microsoft",
      icon: (
        <svg
          className="h-4 w-4 shrink-0"
          viewBox="0 0 23 23"
          aria-hidden="true"
          focusable="false"
        >
          <path fill="#f3f3f3" d="M0 0h23v23H0z" />
          <path fill="#f35325" d="M1 1h10v10H1z" />
          <path fill="#81bc06" d="M12 1h10v10H12z" />
          <path fill="#05a6f0" d="M1 12h10v10H1z" />
          <path fill="#ffba08" d="M12 12h10v10H12z" />
        </svg>
      ),
    }}
    {...props}
  />
);

export default OAuthButton;
