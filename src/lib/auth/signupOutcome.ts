import { AUTH_MESSAGES } from "@/lib/constants/errorMessages";

/**
 * Supabase anti-enumeration: when the email is already registered,
 * signUp often returns user with empty identities and sends no mail.
 */
export function isSignupAlreadyRegisteredResponse(user: {
  identities?: Array<unknown> | null;
} | null | undefined): boolean {
  if (!user) return false;
  const identities = user.identities;
  return Array.isArray(identities) && identities.length === 0;
}

export function signupAlreadyRegisteredError(): Error {
  return Object.assign(new Error(AUTH_MESSAGES.SIGNUP_EMAIL_TAKEN), {
    code: "user_already_exists",
  });
}

export type AuthEmailResendKind = "sent" | "failed" | "rate_limited";

type AuthErrorShape = {
  message?: string;
  code?: string;
  status?: number;
  error_code?: string;
};

function authErrorHaystack(error: unknown): { code: string; haystack: string } {
  if (!error || typeof error !== "object") {
    return { code: "", haystack: String(error ?? "").toLowerCase() };
  }
  const err = error as AuthErrorShape;
  const code = String(err.code ?? err.error_code ?? "").toLowerCase();
  const message = String(err.message ?? "").toLowerCase();
  return { code, haystack: `${code} ${message}` };
}

/** Classify Auth confirmation resend / email-send failures for honest UI. */
export function classifyAuthEmailResend(error: unknown): {
  kind: Exclude<AuthEmailResendKind, "sent">;
  message: string;
} {
  const { code, haystack } = authErrorHaystack(error);
  const rateLimited =
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit" ||
    code === "too_many_requests" ||
    haystack.includes("over_email_send_rate_limit") ||
    haystack.includes("rate limit") ||
    haystack.includes("too many requests") ||
    haystack.includes("email rate limit");

  if (rateLimited) {
    return {
      kind: "rate_limited",
      message:
        "Too many verification emails were sent. Wait a minute, then try resend again.",
    };
  }

  return {
    kind: "failed",
    message:
      typeof (error as AuthErrorShape)?.message === "string" &&
      (error as AuthErrorShape).message!.trim()
        ? (error as AuthErrorShape).message!.trim()
        : "Could not send the verification email. Please try again.",
  };
}
