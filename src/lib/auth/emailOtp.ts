/**
 * Signup / email-confirmation OTP (primary auth). Distinct from TOTP MFA.
 */

export type EmailOtpStatus =
  | "idle"
  | "sent"
  | "verifying"
  | "verified"
  | "invalid"
  | "expired"
  | "already_used"
  | "rate_limited"
  | "network";

export type EmailOtpKind = "signup" | "email";

export function normalizeEmailOtpInput(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 8);
}

export function isCompleteEmailOtp(code: string): boolean {
  const digits = normalizeEmailOtpInput(code);
  return digits.length === 6 || digits.length === 8;
}

export function classifyEmailOtpError(error: unknown): {
  status: Exclude<EmailOtpStatus, "idle" | "sent" | "verifying" | "verified">;
  message: string;
} {
  const haystack = [
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "",
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "",
    error instanceof Error ? error.message : "",
  ]
    .join(" ")
    .toLowerCase();

  const status =
    (error as { status?: number } | null)?.status ??
    (error as { statusCode?: number } | null)?.statusCode;

  if (status === 429 || haystack.includes("rate") || haystack.includes("429")) {
    return {
      status: "rate_limited",
      message: "Too many verification attempts. Wait a few minutes, then try again.",
    };
  }
  if (
    haystack.includes("otp_expired") ||
    haystack.includes("expired") ||
    haystack.includes("token has expired")
  ) {
    return {
      status: "expired",
      message: "That code expired. Request a new confirmation email and try again.",
    };
  }
  if (haystack.includes("already") || haystack.includes("used")) {
    return {
      status: "already_used",
      message: "That code was already used. Sign in, or request a new confirmation email.",
    };
  }
  if (
    haystack.includes("network") ||
    haystack.includes("fetch") ||
    haystack.includes("failed to fetch")
  ) {
    return {
      status: "network",
      message: "Couldn't reach the server. Check your connection and try again.",
    };
  }
  return {
    status: "invalid",
    message: "That code wasn't valid. Check the latest email and try again.",
  };
}
