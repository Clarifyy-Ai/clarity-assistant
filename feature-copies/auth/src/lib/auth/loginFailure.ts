/**
 * Typed login-failure codes for the sign-in UI.
 * HTTP 400 vs 401 must never drive copy — GoTrue uses both for the same
 * credential failure. Implementation / token / provider text stays server-side.
 */

import {
  AUTH_INVALID_CREDENTIALS_MESSAGE,
  AUTH_NETWORK_FAILURE_MESSAGE,
  AUTH_SERVER_FAILURE_MESSAGE,
  AUTH_SESSION_EXPIRED_MESSAGE,
} from "@/lib/auth/accountBootstrap";
import { OAUTH_NOT_CONFIGURED_MESSAGE, isOAuthStateMismatchError } from "@/lib/auth/oauthProviders";

export type AuthLoginFailureCode =
  | "AUTH_INVALID_CREDENTIALS"
  | "AUTH_RATE_LIMITED"
  | "AUTH_ACCOUNT_SUSPENDED"
  | "AUTH_EMAIL_NOT_VERIFIED"
  | "AUTH_SESSION_EXPIRED"
  | "AUTH_NETWORK"
  | "AUTH_CONFIG"
  | "AUTH_OAUTH_NOT_CONFIGURED"
  | "AUTH_OAUTH_STATE_MISMATCH"
  | "AUTH_CANCELLED"
  | "AUTH_MFA";

const LOGIN_FAILURE_CODES: ReadonlySet<string> = new Set([
  "AUTH_INVALID_CREDENTIALS",
  "AUTH_RATE_LIMITED",
  "AUTH_ACCOUNT_SUSPENDED",
  "AUTH_EMAIL_NOT_VERIFIED",
  "AUTH_SESSION_EXPIRED",
  "AUTH_NETWORK",
  "AUTH_CONFIG",
  "AUTH_OAUTH_NOT_CONFIGURED",
  "AUTH_OAUTH_STATE_MISMATCH",
  "AUTH_CANCELLED",
  "AUTH_MFA",
]);

export const AUTH_ACCOUNT_SUSPENDED_MESSAGE =
  "Your account has been suspended. Contact support if you need help.";

export const AUTH_RATE_LIMITED_MESSAGE =
  "Too many sign-in attempts. Please wait a few minutes and try again.";

export const AUTH_EMAIL_NOT_VERIFIED_MESSAGE =
  "Please verify your email before continuing.";

export const AUTH_MFA_INVALID_CODE_MESSAGE =
  "That verification code wasn't valid. Try again.";

export const AUTH_CANCELLED_MESSAGE =
  "Sign-in was cancelled. You can try again whenever you are ready.";

export const AUTH_OAUTH_STATE_MISMATCH_MESSAGE =
  "Your sign-in session expired before it could be completed. Please try again.";

export const AUTH_RECOVERY_LINK_EXPIRED_MESSAGE =
  "This reset link has expired. Please request a new one.";

export const AUTH_RECOVERY_LINK_INVALID_MESSAGE =
  "This reset link is invalid or has already been used. Please request a new one.";

export const AUTH_DEVICE_LOCK_MESSAGE =
  "Too many failed attempts on this device. Locked for 30 minutes.";

const MESSAGES: Record<AuthLoginFailureCode, string> = {
  AUTH_INVALID_CREDENTIALS: AUTH_INVALID_CREDENTIALS_MESSAGE,
  AUTH_RATE_LIMITED: AUTH_RATE_LIMITED_MESSAGE,
  AUTH_ACCOUNT_SUSPENDED: AUTH_ACCOUNT_SUSPENDED_MESSAGE,
  AUTH_EMAIL_NOT_VERIFIED: AUTH_EMAIL_NOT_VERIFIED_MESSAGE,
  AUTH_SESSION_EXPIRED: AUTH_SESSION_EXPIRED_MESSAGE,
  AUTH_NETWORK: AUTH_NETWORK_FAILURE_MESSAGE,
  AUTH_CONFIG: AUTH_SERVER_FAILURE_MESSAGE,
  AUTH_OAUTH_NOT_CONFIGURED: OAUTH_NOT_CONFIGURED_MESSAGE,
  AUTH_OAUTH_STATE_MISMATCH: AUTH_OAUTH_STATE_MISMATCH_MESSAGE,
  AUTH_CANCELLED: AUTH_CANCELLED_MESSAGE,
  AUTH_MFA: AUTH_MFA_INVALID_CODE_MESSAGE,
};

/** Provider / token / schema details that must never reach the login form. */
const AUTH_LEAK_RE =
  /token|jwt|pkce|invalid_grant|otp_expired|gotrue|supabase|postgres|pgrst|bearer|api[_ ]?key|anon_key|vite_|provider is not enabled|password recovery|refresh token|access_token|id_token|code_verifier|schema|validation_failed/i;

export type ClassifiedLoginFailure = {
  code: AuthLoginFailureCode;
  message: string;
};

type AuthErrorShape = {
  message?: string;
  msg?: string;
  code?: string;
  error?: string;
  error_code?: string;
  error_description?: string;
  status?: number;
};

function asAppCode(raw: string | undefined): AuthLoginFailureCode | null {
  if (!raw) return null;
  const upper = raw.trim().toUpperCase();
  if (LOGIN_FAILURE_CODES.has(upper)) {
    return upper as AuthLoginFailureCode;
  }
  if (upper === "AUTH_003") return "AUTH_INVALID_CREDENTIALS";
  if (upper === "AUTH_002") return "AUTH_SESSION_EXPIRED";
  if (upper === "AUTH_004") return "AUTH_EMAIL_NOT_VERIFIED";
  if (upper === "AUTH_005") return "AUTH_OAUTH_NOT_CONFIGURED";
  return null;
}

function collectHaystack(error: unknown): {
  rawCode: string;
  code: string;
  haystack: string;
  messageHaystack: string;
} {
  if (typeof error === "string") {
    const trimmed = error.trim().toLowerCase();
    return {
      rawCode: error.trim(),
      code: "",
      haystack: trimmed,
      messageHaystack: trimmed,
    };
  }
  if (!error || typeof error !== "object") {
    return { rawCode: "", code: "", haystack: "", messageHaystack: "" };
  }
  const err = error as AuthErrorShape;
  const rawCode = String(err.code ?? err.error_code ?? err.error ?? "").trim();
  const code = rawCode.toLowerCase();
  const messageParts = [err.message, err.msg, err.error_description].filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  const messageHaystack = messageParts.join(" ").toLowerCase();
  const haystack = [...messageParts, err.error, err.code, err.error_code]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLowerCase();
  return { rawCode, code, haystack, messageHaystack };
}

export function isAuthImplementationLeak(text: string): boolean {
  return AUTH_LEAK_RE.test(text);
}

function messageFor(code: AuthLoginFailureCode): string {
  return MESSAGES[code];
}

/**
 * Map any GoTrue / URL / thrown login error to a typed application code.
 * Status codes are ignored for UX. Credential-like failures (unknown email,
 * wrong password, invalid recovery token) share one enumeration-safe message.
 */
export function classifyLoginFailure(error: unknown): ClassifiedLoginFailure {
  const { rawCode, code, haystack, messageHaystack } = collectHaystack(error);
  const errShape =
    error && typeof error === "object" ? (error as AuthErrorShape) : null;

  const typed = asAppCode(rawCode) ?? asAppCode(code);
  if (typed) {
    return { code: typed, message: messageFor(typed) };
  }

  if (
    haystack.includes("failed to fetch") ||
    haystack.includes("networkerror") ||
    haystack.includes("load failed")
  ) {
    return { code: "AUTH_NETWORK", message: messageFor("AUTH_NETWORK") };
  }

  if (haystack.includes("invalid api key") || haystack.includes("anon_key")) {
    return { code: "AUTH_CONFIG", message: messageFor("AUTH_CONFIG") };
  }

  if (
    code === "user_banned" ||
    code === "user_disabled" ||
    code === "forbidden" ||
    haystack.includes("user is banned") ||
    haystack.includes("user_banned") ||
    haystack.includes("account has been banned") ||
    haystack.includes("account has been disabled") ||
    haystack.includes("account has been suspended") ||
    haystack.includes("database error querying schema")
  ) {
    return { code: "AUTH_ACCOUNT_SUSPENDED", message: messageFor("AUTH_ACCOUNT_SUSPENDED") };
  }

  if (
    code === "over_request_rate_limit" ||
    code === "too_many_requests" ||
    code === "auth_rate_limited" ||
    haystack.includes("over_request_rate_limit") ||
    haystack.includes("too many requests")
  ) {
    return { code: "AUTH_RATE_LIMITED", message: messageFor("AUTH_RATE_LIMITED") };
  }

  if (
    code === "email_not_confirmed" ||
    haystack.includes("email_not_confirmed") ||
    haystack.includes("email not confirmed") ||
    haystack.includes("email not verified")
  ) {
    return { code: "AUTH_EMAIL_NOT_VERIFIED", message: messageFor("AUTH_EMAIL_NOT_VERIFIED") };
  }

  if (
    isOAuthStateMismatchError(
      errShape?.message ?? errShape?.msg ?? null,
      errShape?.error_description ?? null,
      code || errShape?.error_code || null,
    ) ||
    messageHaystack.includes("oauth state") ||
    messageHaystack.includes("state mismatch")
  ) {
    return {
      code: "AUTH_OAUTH_STATE_MISMATCH",
      message: messageFor("AUTH_OAUTH_STATE_MISMATCH"),
    };
  }

  if (
    code === "provider_disabled" ||
    code === "oauth_provider_not_found" ||
    haystack.includes("provider is not enabled") ||
    haystack.includes("unsupported provider") ||
    haystack.includes("oauth_provider_not_found")
  ) {
    return {
      code: "AUTH_OAUTH_NOT_CONFIGURED",
      message: messageFor("AUTH_OAUTH_NOT_CONFIGURED"),
    };
  }

  if (
    code === "cancelled" ||
    messageHaystack.includes("cancelled") ||
    messageHaystack.includes("canceled") ||
    (code === "access_denied" &&
      (messageHaystack.includes("user denied") || messageHaystack.includes("access denied")))
  ) {
    return { code: "AUTH_CANCELLED", message: messageFor("AUTH_CANCELLED") };
  }

  if (
    code === "mfa_verification_failed" ||
    haystack.includes("totp") ||
    haystack.includes("authenticator") ||
    haystack.includes("invalid totp") ||
    (haystack.includes("mfa") && haystack.includes("invalid"))
  ) {
    return { code: "AUTH_MFA", message: messageFor("AUTH_MFA") };
  }

  if (
    code === "session_expired" ||
    haystack.includes("session has expired") ||
    haystack.includes("jwt expired")
  ) {
    return { code: "AUTH_SESSION_EXPIRED", message: messageFor("AUTH_SESSION_EXPIRED") };
  }

  // Credential-like: unknown email, wrong password, bad recovery/OTP token,
  // malformed grant, validation_failed email format. Same copy so accounts
  // cannot be enumerated and tokens never appear in the UI.
  // HTTP status is intentionally unused.
  return { code: "AUTH_INVALID_CREDENTIALS", message: messageFor("AUTH_INVALID_CREDENTIALS") };
}

export function loginFailureFromUrl(params: {
  error?: string | null;
  errorCode?: string | null;
  errorDescription?: string | null;
  message?: string | null;
}): ClassifiedLoginFailure {
  const error = params.error ?? params.errorCode ?? undefined;
  if (error === "cancelled") {
    return { code: "AUTH_CANCELLED", message: messageFor("AUTH_CANCELLED") };
  }
  if (error === "not_configured") {
    return {
      code: "AUTH_OAUTH_NOT_CONFIGURED",
      message: messageFor("AUTH_OAUTH_NOT_CONFIGURED"),
    };
  }
  if (error === "auth_failed") {
    return classifyLoginFailure({
      code: params.errorCode ?? undefined,
      message: params.message ?? params.errorDescription ?? "",
      error_description: params.errorDescription ?? undefined,
      error_code: params.errorCode ?? undefined,
    });
  }
  return classifyLoginFailure({
    code: error ?? undefined,
    message: params.message ?? params.errorDescription ?? error ?? "",
    error_description: params.errorDescription ?? undefined,
    error_code: params.errorCode ?? undefined,
  });
}

export function assertSafeLoginMessage(message: string): string {
  if (!message.trim() || isAuthImplementationLeak(message)) {
    return messageFor("AUTH_INVALID_CREDENTIALS");
  }
  return message;
}

export function recoveryLinkIssueFromUrl(params: {
  error?: string | null;
  errorCode?: string | null;
  errorDescription?: string | null;
}): string | null {
  if (!params.error && !params.errorCode) {
    return null;
  }
  if (params.errorCode === "otp_expired" || params.error === "otp_expired") {
    return AUTH_RECOVERY_LINK_EXPIRED_MESSAGE;
  }
  const classified = classifyLoginFailure({
    code: params.errorCode ?? params.error ?? undefined,
    message: params.errorDescription ?? params.error ?? "",
    error_description: params.errorDescription ?? undefined,
    error_code: params.errorCode ?? undefined,
  });
  if (classified.code === "AUTH_SESSION_EXPIRED") {
    return AUTH_RECOVERY_LINK_EXPIRED_MESSAGE;
  }
  return AUTH_RECOVERY_LINK_INVALID_MESSAGE;
}
