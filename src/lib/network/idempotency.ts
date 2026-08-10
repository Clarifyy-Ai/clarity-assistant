/** Stable idempotency keys for credit-bearing Edge calls (16–150 chars). */

export function documentParseIdempotencyKey(
  action: "parse-resume" | "parse-document" | "gap-analysis",
  resourceId: string,
  contentFingerprint?: string,
): string {
  const fp = (contentFingerprint ?? "v1").replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 64);
  const id = resourceId.replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 64);
  const key = `${action}:${id}:${fp || "nofp"}`;
  return key.length >= 16 ? key.slice(0, 150) : `${key}:pad`.padEnd(16, "0").slice(0, 150);
}

/** SHA-256 hex of file bytes (browser). */
export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
