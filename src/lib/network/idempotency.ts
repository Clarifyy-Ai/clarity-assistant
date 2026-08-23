/** Stable idempotency keys for credit-bearing Edge calls (16–150 chars). */

const KEY_RE = /^[A-Za-z0-9._:-]{16,150}$/;

function clampKey(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 150);
  return cleaned.length >= 16 ? cleaned : `${cleaned}:pad`.padEnd(16, "0").slice(0, 150);
}

export function documentParseIdempotencyKey(
  action: "parse-resume" | "parse-document" | "gap-analysis",
  resourceId: string,
  contentFingerprint?: string,
): string {
  const fp = (contentFingerprint ?? "v1").replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 64);
  const id = resourceId.replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 64);
  return clampKey(`${action}:${id}:${fp || "nofp"}`);
}

/** Stable key so re-running the same prep-tool input replays instead of recharging. */
export function prepToolContentIdempotencyKey(toolId: string, contentSha256: string): string {
  const tool = toolId.replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 40) || "tool";
  const hash = contentSha256.replace(/[^a-fA-F0-9]/g, "").slice(0, 64);
  return clampKey(`prep-tool:${tool}:${hash || "empty"}`);
}

/** Fresh key for a prep-tool call (send as `x-idempotency-key`). */
export function prepToolIdempotencyKey(toolId: string): string {
  const tool = toolId.replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 40) || "tool";
  try {
    return clampKey(`prep-tool:${tool}:${crypto.randomUUID()}`);
  } catch {
    return clampKey(`prep-tool:${tool}:${Date.now()}:${Math.random().toString(36).slice(2)}`);
  }
}

/** Fresh key for a mutating Edge call (send as `x-idempotency-key`). */
export function createIdempotencyKey(prefix: string): string {
  const p = prefix.replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 48) || "op";
  try {
    return clampKey(`${p}:${crypto.randomUUID()}`);
  } catch {
    return clampKey(`${p}:${Date.now()}:${Math.random().toString(36).slice(2)}`);
  }
}

export function isValidClientIdempotencyKey(key: string): boolean {
  return KEY_RE.test(key);
}

/**
 * Reuse the in-flight prep-tool key so concurrent/double-submit calls
 * replay the same request instead of charging twice.
 */
export function nextPrepToolIdempotencyKey(
  inflight: { current: string | null },
  toolId: string,
): string {
  const key = inflight.current ?? prepToolIdempotencyKey(toolId);
  inflight.current = key;
  return key;
}

/** SHA-256 hex of file bytes (browser). */
export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
