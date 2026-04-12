// src/components/auth/OAuthButton.tsx
// OAuth sign-in buttons with feature-flag gating and clear error states.
//
// IMPORTANT — Supabase OAuth flow note:
// signInWithOAuth() initiates a browser redirect. The current page unloads
// immediately on success, so onSuccess() and navigate() are NEVER called
// from the success branch. They are kept only for popup-mode OAuth flows
// (if/when Supabase adds that option). The actual post-auth redirect is
// handled by the callback route configured in Supabase Dashboard.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Github, ShieldOff } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── TYPES ─────────────────────────────────────────────────────────────── */

export type OAuthProviderName = "google" | "github";

export interface OAuthProvider {
  name:  OAuthProviderName;
  label: string;
  icon:  React.ReactNode;
}

interface OAuthButtonProps {
  provider:          OAuthProvider;
  /** When false, renders a disabled state with an explanatory message */
  enabled?:          boolean;
  /** Reason shown in the disabled tooltip / inline message */
  disabledReason?:   string;
  /** Called only in popup-mode OAuth (not redirect-mode — see file header) */
  onSuccess?:        () => void;
  className?:        string;
}

/* ─── KNOWN ERROR CODES → USER-FACING MESSAGES ──────────────────────────── */

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  // Supabase auth error codes
  "provider_disabled":          "{provider} login is currently unavailable — please use email/password.",
  "oauth_provider_not_found":   "{provider} login is not configured. Please use email/password.",
  "redirect_uri_mismatch":      "{provider} login failed due to a configuration error. Please contact support.",
  "access_denied":              "Access was denied by {provider}. You may have cancelled the sign-in.",
  "server_error":               "{provider} login is temporarily unavailable. Please try again or use email/password.",
  // Network / generic
  "Failed to fetch":            "Network error — please check your connection and try again.",
};

function getOAuthErrorMessage(rawMessage: string, providerLabel: string): string {
  for (const [key, template] of Object.entries(OAUTH_ERROR_MESSAGES)) {
    if (rawMessage.toLowerCase().includes(key.toLowerCase())) {
      return template.replace("{provider}", providerLabel);
    }
  }
  // Generic fallback — still actionable
  return `${providerLabel} login is currently unavailable — please use email/password instead.`;
}

/* ─── OAUTH BUTTON ───────────────────────────────────────────────────────── */

export const OAuthButton = ({
  provider,
  enabled        = true,
  disabledReason,
  onSuccess,
  className,
}: OAuthButtonProps) => {
  const navigate              = useNavigate();
  const { signInWithOAuth }   = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  /* ── DISABLED STATE ────────────────────────────────────────────────────── */

  if (!enabled) {
    return (
      <div
        className={cn(
          "w-full flex flex-col items-center gap-1.5",
          className,
        )}
      >
        <button
          disabled
          aria-disabled="true"
          title={disabledReason ?? `${provider.label} login is currently unavailable`}
          className={cn(
            "w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg",
            "border border-border bg-muted/30 text-muted-foreground/50",
            "cursor-not-allowed opacity-60 select-none",
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

  /* ── CLICK HANDLER ─────────────────────────────────────────────────────── */

  const handleOAuthLogin = async () => {
    setIsLoading(true);
    setLastError(null);

    try {
      const { error } = await signInWithOAuth(provider.name);

      if (error) {
        // FIX: use descriptive error → user-facing message mapping
        const message = getOAuthErrorMessage(
          error.message ?? "unknown",
          provider.label,
        );
        setLastError(message);
        toast.error(message, {
          description: "Error code: " + ((error as unknown as Record<string, unknown>).code ?? error.message),
          duration:    6000,
        });
        return;
      }

      // NOTE: In redirect-mode (default Supabase OAuth), the lines below are
      // unreachable — the browser navigates away before they run.
      // They only execute if you configure Supabase to use popup mode.
      if (onSuccess) {
        onSuccess();
      } else {
        navigate("/app");
      }
    } catch (caughtError: unknown) {
      // FIX: renamed from `error` to `caughtError` to avoid shadowing
      const raw =
        caughtError instanceof Error
          ? caughtError.message
          : "Unknown error";

      const message = getOAuthErrorMessage(raw, provider.label);
      setLastError(message);
      toast.error(message, { duration: 6000 });
    } finally {
      setIsLoading(false);
    }
  };

  /* ── RENDER ────────────────────────────────────────────────────────────── */

  return (
    <div className={cn("w-full flex flex-col gap-1.5", className)}>
      <Button
        onClick={() => void handleOAuthLogin()}
        disabled={isLoading}
        variant="outline"
        className={cn(
          "w-full flex items-center justify-center gap-2 py-2 rounded-lg",
          "border border-border hover:bg-secondary/60 transition-colors",
          lastError && "border-red-500/40 bg-red-500/5",
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

      {/* Inline error message — more visible than a toast for auth failures */}
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

/* ─── PRESET BUTTONS ─────────────────────────────────────────────────────── */

export const GoogleOAuthButton = (
  props: Omit<OAuthButtonProps, "provider">,
) => (
  <OAuthButton
    provider={{
      name:  "google",
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
  props: Omit<OAuthButtonProps, "provider">,
) => (
  <OAuthButton
    provider={{
      name:  "github",
      label: "GitHub",
      icon:  <Github className="h-4 w-4 shrink-0" aria-hidden="true" />,
    }}
    {...props}
  />
);

export default OAuthButton;
