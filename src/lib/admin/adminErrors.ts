/**
 * Map raw PostgREST / Edge / network errors to safe Admin UI copy.
 * Raw details are logged; never shown to operators.
 */
import { logger } from "@/lib/logger";

export type AdminErrorKind =
  | "unauthorized"
  | "not_configured"
  | "unavailable"
  | "load_failed"
  | "action_failed"
  | "validation";

const SAFE: Record<AdminErrorKind, string> = {
  unauthorized: "You are not authorized to perform this action.",
  not_configured: "This integration is not configured.",
  unavailable: "This service is temporarily unavailable.",
  load_failed: "Unable to load this Admin section. Please retry.",
  action_failed: "Unable to complete this action. Please retry.",
  validation: "Please check your input and try again.",
};

function rawMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err ?? "");
}

export function classifyAdminError(err: unknown): AdminErrorKind {
  const msg = rawMessage(err).toLowerCase();
  if (
    msg.includes("not configured") ||
    msg.includes("vite_scraper") ||
    msg.includes("python_not_configured") ||
    msg.includes("scraper integration not configured")
  ) {
    return "not_configured";
  }
  if (
    msg.includes("jwt") ||
    msg.includes("unauthorized") ||
    msg.includes("not authorized") ||
    msg.includes("permission") ||
    msg.includes("403") ||
    msg.includes("401") ||
    msg.includes("rls") ||
    msg.includes("row-level security")
  ) {
    return "unauthorized";
  }
  if (
    msg.includes("timeout") ||
    msg.includes("503") ||
    msg.includes("502") ||
    msg.includes("network") ||
    msg.includes("failed to fetch") ||
    msg.includes("unavailable")
  ) {
    return "unavailable";
  }
  if (msg.includes("invalid") || msg.includes("validation") || msg.includes("required")) {
    return "validation";
  }
  return "load_failed";
}

export function toAdminUserMessage(
  err: unknown,
  kind: AdminErrorKind = classifyAdminError(err),
  context?: string,
): string {
  logger.warn("admin.error.sanitized", {
    context: context ?? "admin",
    kind,
    raw: rawMessage(err).slice(0, 500),
  });
  return SAFE[kind];
}

export function adminActionFailedMessage(err: unknown, context?: string): string {
  const kind = classifyAdminError(err);
  if (kind === "not_configured" || kind === "unauthorized" || kind === "unavailable") {
    return toAdminUserMessage(err, kind, context);
  }
  return toAdminUserMessage(err, "action_failed", context);
}
