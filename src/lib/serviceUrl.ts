import { isMissingOrPlaceholderEnv, isValidHttpUrl } from "@/lib/envCritical";

/**
 * Resolve an external service URL from env.
 * Returns "" when missing/placeholder/invalid, and in production also rejects
 * insecure or local-only endpoints (http://, localhost, *.local, private IPs).
 */
export function resolveProductionSafeUrl(
  value: string | undefined | null,
  opts: { prod: boolean },
): string {
  const raw = String(value ?? "").trim();
  if (isMissingOrPlaceholderEnv(raw) || !isValidHttpUrl(raw)) return "";

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return "";
  }

  if (opts.prod) {
    if (parsed.protocol !== "https:") return "";
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".local") ||
      host.endsWith(".localhost")
    ) {
      return "";
    }
  }

  return raw.replace(/\/+$/, "");
}
