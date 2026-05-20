// src/lib/security/csrf.ts
//
// Lightweight CSRF token utilities for frontend forms and state-changing actions.
//
// SECURITY PURPOSE:
// - Generate unpredictable CSRF tokens
// - Store token only in sessionStorage
// - Validate submitted token against current session token
// - Help protect form submissions and sensitive frontend actions
//
// IMPORTANT:
// This is a frontend helper. True CSRF protection for server-side cookie-based auth
// must also be enforced on the backend. Since this app primarily uses bearer/JWT auth,
// this utility mainly protects accidental/malicious cross-context form actions
// and standardizes secure form handling.

const CSRF_STORAGE_KEY = "clarify-csrf-token-v1";
const CSRF_CREATED_AT_KEY = "clarify-csrf-token-created-at-v1";

const DEFAULT_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function getCrypto(): Crypto | null {
  if (typeof crypto !== "undefined") {
    return crypto;
  }

  if (typeof window !== "undefined" && window.crypto) {
    return window.crypto;
  }

  return null;
}

function safeGetSessionItem(key: string): string | null {
  if (!isBrowser()) {
    return null;
  }

  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetSessionItem(key: string, value: string): void {
  if (!isBrowser()) {
    return;
  }

  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // If sessionStorage is unavailable, fail silently.
    // Callers should still validate token existence before sensitive actions.
  }
}

function safeRemoveSessionItem(key: string): void {
  if (!isBrowser()) {
    return;
  }

  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore storage removal errors.
  }
}

/**
 * Creates a cryptographically strong random token.
 */
export function generateCSRFToken(): string {
  const cryptoApi = getCrypto();

  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID();
  }

  if (cryptoApi?.getRandomValues) {
    const bytes = new Uint8Array(32);
    cryptoApi.getRandomValues(bytes);

    return Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  throw new Error("[csrf] Web Crypto API is not available.");
}

/**
 * Stores a CSRF token in sessionStorage.
 */
export function storeCSRFToken(token: string): void {
  if (!token || typeof token !== "string") {
    return;
  }

  safeSetSessionItem(CSRF_STORAGE_KEY, token);
  safeSetSessionItem(CSRF_CREATED_AT_KEY, String(Date.now()));
}

/**
 * Returns the current CSRF token from sessionStorage.
 */
export function getCSRFToken(): string | null {
  return safeGetSessionItem(CSRF_STORAGE_KEY);
}

/**
 * Returns the current CSRF token creation timestamp.
 */
export function getCSRFTokenCreatedAt(): number | null {
  const raw = safeGetSessionItem(CSRF_CREATED_AT_KEY);

  if (!raw) {
    return null;
  }

  const parsed = Number(raw);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

/**
 * Removes the current CSRF token from sessionStorage.
 */
export function clearCSRFToken(): void {
  safeRemoveSessionItem(CSRF_STORAGE_KEY);
  safeRemoveSessionItem(CSRF_CREATED_AT_KEY);
}

/**
 * Checks whether the current token has expired.
 */
export function isCSRFTokenExpired(ttlMs = DEFAULT_TOKEN_TTL_MS): boolean {
  const createdAt = getCSRFTokenCreatedAt();

  if (!createdAt) {
    return true;
  }

  return Date.now() - createdAt > ttlMs;
}

/**
 * Returns an existing valid token or creates a new one.
 */
export function getOrCreateCSRFToken(ttlMs = DEFAULT_TOKEN_TTL_MS): string {
  const existingToken = getCSRFToken();

  if (existingToken && !isCSRFTokenExpired(ttlMs)) {
    return existingToken;
  }

  const newToken = generateCSRFToken();
  storeCSRFToken(newToken);

  return newToken;
}

/**
 * Rotates the CSRF token.
 *
 * Use this after:
 * - login
 * - logout
 * - privilege/role change
 * - sensitive settings update
 */
export function rotateCSRFToken(): string {
  const newToken = generateCSRFToken();
  storeCSRFToken(newToken);

  return newToken;
}

/**
 * Constant-time-ish comparison to reduce timing leak risk.
 *
 * This is frontend-side and not a substitute for backend verification,
 * but avoids simple early-return string comparisons.
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;

  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return result === 0;
}

/**
 * Validates a submitted CSRF token against the current session token.
 */
export function validateCSRFToken(
  submittedToken: string | null | undefined,
  ttlMs = DEFAULT_TOKEN_TTL_MS
): boolean {
  if (!submittedToken || typeof submittedToken !== "string") {
    return false;
  }

  if (isCSRFTokenExpired(ttlMs)) {
    clearCSRFToken();
    return false;
  }

  const storedToken = getCSRFToken();

  if (!storedToken) {
    return false;
  }

  return safeCompare(storedToken, submittedToken);
}

/**
 * Returns CSRF headers for API calls.
 *
 * Use this for sensitive state-changing frontend requests:
 * - profile update
 * - billing action
 * - account deletion
 * - settings update
 */
export function getCSRFHeaders(): Record<string, string> {
  return {
    "X-CSRF-Token": getOrCreateCSRFToken(),
  };
}

/**
 * Extracts CSRF token from FormData.
 */
export function getCSRFTokenFromFormData(formData: FormData): string | null {
  const token = formData.get("csrfToken");

  if (typeof token !== "string") {
    return null;
  }

  return token;
}

/**
 * Validates CSRF token from FormData.
 */
export function validateCSRFTokenFromFormData(
  formData: FormData,
  ttlMs = DEFAULT_TOKEN_TTL_MS
): boolean {
  return validateCSRFToken(getCSRFTokenFromFormData(formData), ttlMs);
}

/**
 * Creates hidden input props for React forms.
 *
 * Example:
 * <input {...getCSRFHiddenInputProps()} />
 */
export function getCSRFHiddenInputProps(): {
  type: "hidden";
  name: "csrfToken";
  value: string;
} {
  return {
    type: "hidden",
    name: "csrfToken",
    value: getOrCreateCSRFToken(),
  };
}
``
