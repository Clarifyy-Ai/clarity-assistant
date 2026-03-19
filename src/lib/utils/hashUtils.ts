// ─────────────────────────────────────────────────────────────────────────────
// hashUtils.ts — Hashing, fingerprinting, and content-based key generation.
// Used for AI response caching, deduplication, ETag generation,
// and stable IDs from variable content.
// ─────────────────────────────────────────────────────────────────────────────

// ─── FNV-1a Fast Hash (no crypto, sync) ──────────────────────────────────────

const FNV_PRIME     = 0x01000193;
const FNV_OFFSET    = 0x811c9dc5;

/**
 * Fast FNV-1a 32-bit hash — non-cryptographic.
 * Use for cache keys, deduplication, and stable IDs.
 *
 * @example fnv1a("hello world") → "d58b3fa7"
 */
export function fnv1a(input: string): string {
  let hash = FNV_OFFSET;

  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash  = (Math.imul(hash, FNV_PRIME) >>> 0);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Generate a stable numeric hash from a string (0 to max).
 */
export function numericHash(input: string, max = 100): number {
  const hex = fnv1a(input);
  return parseInt(hex, 16) % max;
}

// ─── SHA-256 (Web Crypto, async) ──────────────────────────────────────────────

/**
 * Compute a SHA-256 hash of a string using the Web Crypto API.
 * Returns lowercase hex string.
 *
 * @example await sha256("hello") → "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
 */
export async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data    = encoder.encode(input);
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  const bytes   = new Uint8Array(hashBuf);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Compute SHA-256 hash of an ArrayBuffer (audio chunks, file data).
 */
export async function sha256Buffer(buffer: ArrayBuffer): Promise<string> {
  const hashBuf = await crypto.subtle.digest("SHA-256", buffer);
  const bytes   = new Uint8Array(hashBuf);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Short SHA-256 prefix — first N chars (default 12).
 * Good for display or short cache keys.
 *
 * @example await shortHash("my long prompt text", 8) → "2cf24dba"
 */
export async function shortHash(input: string, length = 12): Promise<string> {
  const full = await sha256(input);
  return full.slice(0, length);
}

// ─── Content-Based Cache Keys ──────────────────────────────────────────────────

/**
 * Generate a stable cache key from an AI prompt + model.
 * Used in aiCacheIDB to avoid duplicate AI calls.
 *
 * @example await promptCacheKey("tell me about react", "gpt-4o") → "prompt:3a9f..."
 */
export async function promptCacheKey(
  prompt: string,
  model: string
): Promise<string> {
  const normalized = `${model}::${prompt.trim().toLowerCase().replace(/\s+/g, " ")}`;
  const hash       = await shortHash(normalized, 16);
  return `prompt:${hash}`;
}

/**
 * Generate a stable cache key from a resume text + job description pair.
 */
export async function documentCacheKey(
  resumeText: string,
  jobDescription: string
): Promise<string> {
  const combined = `${resumeText.slice(0, 500)}::${jobDescription.slice(0, 500)}`;
  const hash     = await shortHash(combined, 16);
  return `doc:${hash}`;
}

/**
 * Generate a file fingerprint from its content (for deduplication).
 */
export async function fileFingerprint(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hash   = await sha256Buffer(buffer);
  return `${file.name}:${file.size}:${hash.slice(0, 16)}`;
}

// ─── Stable ID Generation ─────────────────────────────────────────────────────

/**
 * Generate a stable, deterministic ID from any string input.
 * Same input always produces the same ID — useful for idempotent operations.
 *
 * @example stableId("user@example.com") → "u:d41d8cd9"
 * @example stableId("session", "abc123") → "s:b3f2c1a9"
 */
export function stableId(...parts: string[]): string {
  const combined = parts.join("::");
  return fnv1a(combined);
}

/**
 * Generate a content-addressed ID from an object.
 * Sorts keys for stability regardless of insertion order.
 */
export async function objectHash(obj: unknown): Promise<string> {
  const sorted = JSON.stringify(obj, Object.keys(obj as object).sort());
  return shortHash(sorted, 16);
}

// ─── HMAC (for signature verification) ───────────────────────────────────────

/**
 * Compute HMAC-SHA-256 for webhook signature verification.
 *
 * @example
 * const sig = await hmacSHA256("stripe-secret", rawBody);
 * if (sig !== header) throw new Error("Invalid signature");
 */
export async function hmacSHA256(secret: string, message: string): Promise<string> {
  const enc     = new TextEncoder();
  const keyData = enc.encode(secret);
  const msgData = enc.encode(message);

  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig   = await crypto.subtle.sign("HMAC", key, msgData);
  const bytes = new Uint8Array(sig);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Checksum ────────────────────────────────────────────────────────────────

/**
 * Simple Adler-32 checksum — very fast, good for data integrity checks.
 */
export function adler32(data: string | Uint8Array): number {
  const bytes = typeof data === "string"
    ? new TextEncoder().encode(data)
    : data;

  let a = 1;
  let b = 0;
  const MOD = 65521;

  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % MOD;
    b = (b + a) % MOD;
  }

  return (b << 16) | a;
}

// ─── ETag ─────────────────────────────────────────────────────────────────────

/**
 * Generate an ETag-style value for HTTP caching headers.
 * @example generateETag("content string") → '"d58b3fa7"'
 */
export function generateETag(content: string): string {
  return `"${fnv1a(content)}"`;
}
