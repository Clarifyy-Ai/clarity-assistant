import { classifyRequestError } from "./retryClassification";

const BACKEND_LEAK =
  /\b(pgrst|postgrest|postgres|sqlstate|permission denied for|column .* does not exist|relation .* does not exist|edge function|supabase|stack trace|at\s+\S+\s+\()/i;

export const DASHBOARD_SECTION_ERROR =
  "Couldn't load this section. Please retry.";

export function toSafeUiError(
  error: unknown,
  fallback = DASHBOARD_SECTION_ERROR,
): string {
  const kind = classifyRequestError(error).kind;
  if (kind === "cancelled") return fallback;
  if (kind === "authentication") {
    return "Your session expired. Please sign in again.";
  }
  if (kind === "authorization") {
    return "You don't have permission to view this yet.";
  }
  if (kind === "rate_limited") {
    return "Too many requests. Please wait a moment and retry.";
  }
  if (kind === "network") {
    return "Network hiccup. Please retry.";
  }
  if (kind === "infrastructure") {
    return "The service is temporarily unavailable. Please retry.";
  }

  if (error instanceof Error) {
    if (BACKEND_LEAK.test(error.message)) return fallback;
  }
  return fallback;
}
