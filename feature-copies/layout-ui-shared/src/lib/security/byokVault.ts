// src/lib/security/byokVault.ts
//
// P0-5 (production audit): BYOK (bring-your-own-key) was removed from the
// launch product. The previous client-side AES-GCM vault wrote provider keys
// to localStorage, which is not safe under XSS and was advertised with
// security claims that were not enforced on the server.
//
// This module is now a backwards-compatible no-op shim:
//   * `loadBYOKVault()`  → always returns `{}` and proactively wipes any
//                           legacy ciphertext + device key still in
//                           localStorage from older builds.
//   * `saveBYOKVault()`  → no-op (silently drops keys).
//   * `clearBYOKVault()` → wipes legacy localStorage entries.
//   * `hasBYOKVault()`   → always false (also wipes legacy keys).
//
// Do NOT re-introduce persistent key storage here. If BYOK is ever re-enabled,
// route it through a server-side encrypted vault (e.g. Supabase Vault), not
// the browser.

const LEGACY_KEY_STORAGE = "clarify-byok-vault-key-v1";
const LEGACY_PAYLOAD_STORAGE = "clarify-byok-vault-v1";

export type BYOKProvider = "openai" | "anthropic" | "gemini";
export type BYOKVault = Partial<Record<BYOKProvider, string>>;

function safeRemove(key: string): void {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

/**
 * Wipe legacy BYOK ciphertext + device-key material from localStorage.
 * Safe to call repeatedly; no-ops when storage is unavailable.
 *
 * Legacy keys (never write these again):
 *   - clarify-byok-vault-key-v1
 *   - clarify-byok-vault-v1
 */
function wipeLegacy(): void {
  safeRemove(LEGACY_KEY_STORAGE);
  safeRemove(LEGACY_PAYLOAD_STORAGE);
}

/** @deprecated Always returns `{}`. Wipes any leftover legacy ciphertext. */
export async function loadBYOKVault(): Promise<BYOKVault> {
  wipeLegacy();
  return {};
}

/** @deprecated No-op since P0-5. Provider keys are NOT persisted. */
export async function saveBYOKVault(_vault: BYOKVault): Promise<void> {
  wipeLegacy();
}

/** Clears any legacy BYOK ciphertext that may still be in localStorage. */
export function clearBYOKVault(): void {
  wipeLegacy();
}

/**
 * @deprecated Always false since P0-5.
 * Also wipes legacy keys so callers that only check `hasBYOKVault()` still
 * clear residual localStorage from older builds.
 */
export function hasBYOKVault(): boolean {
  wipeLegacy();
  return false;
}
