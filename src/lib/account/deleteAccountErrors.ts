export function messageFromDeleteAccountResponse(status: number, code?: string): string {
  const normalized = (code ?? "").toUpperCase();
  if (status === 429 || normalized === "RATE_LIMITED") {
    return "Account deletion is limited to one request per day. If you already confirmed, wait for it to finish — do not click Delete again.";
  }
  if (status === 503 || normalized === "RATE_LIMIT_BACKEND_UNAVAILABLE") {
    return "Deletion protection is temporarily unavailable. Try again in a few minutes. Your account was not deleted.";
  }
  if (normalized === "CONFIRMATION_REQUIRED") {
    return "Confirmation did not match. Type your email or password again.";
  }
  if (status === 401 || normalized === "REAUTH_REQUIRED") {
    return "Re-enter your password, or sign in again, before deleting this account.";
  }
  if (status === 500 || normalized === "INTERNAL_ERROR") {
    return "Account deletion hit an internal error. If this repeats, contact support — do not keep clicking Delete.";
  }
  return "We couldn't delete your account right now. Please try again later or contact support.";
}

export function shouldSkipDeleteReplayRateLimit(status: string | null | undefined): boolean {
  return status === "completed";
}
