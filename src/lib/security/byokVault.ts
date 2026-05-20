// src/lib/security/byokVault.ts
//
// Client-side encrypted vault for user-supplied API keys.
//
// SECURITY PURPOSE:
// - Avoid storing BYOK provider keys in Supabase/database
// - Encrypt provider keys before storing in localStorage
// - Keep a device-local AES-GCM key in browser storage
// - Hydrate decrypted keys only into in-memory authStore.byokKeys
// - Attach keys per request as x-byok-* headers through apiClient
//
// THREAT MODEL COVERED:
// - Server/database compromise cannot read BYOK keys
// - Database row leaks do not expose provider keys
// - Plain localStorage payload is ciphertext
//
// NOT COVERED:
// - Malicious browser extensions with full DOM/storage access
// - Physical access to an unlocked device
// - XSS with runtime access to decrypted in-memory keys
//
// Important:
// This is browser-side encryption for user convenience and server-side
// key isolation. It is not a replacement for XSS prevention.

const VAULT_KEY_STORAGE = "clarify-byok-vault-key-v1";
const VAULT_PAYLOAD_STORAGE = "clarify-byok-vault-v1";

export type BYOKProvider = "openai" | "anthropic" | "gemini";
export type BYOKVault = Partial<Record<BYOKProvider, string>>;

type EncryptedBlob = {
  iv: string;
  ciphertext: string;
};

const PROVIDERS: BYOKProvider[] = ["openai", "anthropic", "gemini"];
const AES_KEY_BYTES = 32;
const AES_GCM_IV_BYTES = 12;

function isBrowserStorageAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function safeGetLocalStorageItem(key: string): string | null {
  if (!isBrowserStorageAvailable()) {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetLocalStorageItem(key: string, value: string): void {
  if (!isBrowserStorageAvailable()) {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage may be blocked or full. Caller handles failure when needed.
  }
}

function safeRemoveLocalStorageItem(key: string): void {
  if (!isBrowserStorageAvailable()) {
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures.
  }
}

function assertWebCryptoAvailable(): void {
  if (
    typeof crypto === "undefined" ||
    !crypto.subtle ||
    typeof crypto.getRandomValues !== "function"
  ) {
    throw new Error("WebCrypto is not available in this browser.");
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const output = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    output[index] = binary.charCodeAt(index);
  }

  return output;
}

function isEncryptedBlob(value: unknown): value is EncryptedBlob {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<EncryptedBlob>;

  return (
    typeof candidate.iv === "string" &&
    candidate.iv.length > 0 &&
    typeof candidate.ciphertext === "string" &&
    candidate.ciphertext.length > 0
  );
}

function cleanVault(vault: BYOKVault): BYOKVault {
  const cleaned: BYOKVault = {};

  for (const provider of PROVIDERS) {
    const value = vault[provider];

    if (typeof value === "string" && value.trim().length > 0) {
      cleaned[provider] = value.trim();
    }
  }

  return cleaned;
}

async function getOrCreateDeviceKey(): Promise<CryptoKey> {
  assertWebCryptoAvailable();

  let rawKey = safeGetLocalStorageItem(VAULT_KEY_STORAGE);

  if (!rawKey) {
    const keyBytes = crypto.getRandomValues(new Uint8Array(AES_KEY_BYTES));
    rawKey = bytesToBase64(keyBytes);
    safeSetLocalStorageItem(VAULT_KEY_STORAGE, rawKey);
  }

  const keyBytes = base64ToBytes(rawKey);

  if (keyBytes.byteLength !== AES_KEY_BYTES) {
    throw new Error("Invalid BYOK vault key length.");
  }

  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptJSON(value: unknown): Promise<EncryptedBlob> {
  const key = await getOrCreateDeviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));

  const plaintext = new TextEncoder().encode(JSON.stringify(value));

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    plaintext
  );

  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

async function decryptJSON<T>(blob: EncryptedBlob): Promise<T> {
  const key = await getOrCreateDeviceKey();

  const iv = base64ToBytes(blob.iv);
  const ciphertext = base64ToBytes(blob.ciphertext);

  if (iv.byteLength !== AES_GCM_IV_BYTES) {
    throw new Error("Invalid BYOK vault IV length.");
  }

  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    ciphertext
  );

  const decoded = new TextDecoder().decode(plaintext);

  return JSON.parse(decoded) as T;
}

/**
 * Persist BYOK keys to encrypted localStorage.
 *
 * Pass an empty object to clear encrypted provider keys.
 */
export async function saveBYOKVault(vault: BYOKVault): Promise<void> {
  const cleaned = cleanVault(vault);

  if (Object.keys(cleaned).length === 0) {
    safeRemoveLocalStorageItem(VAULT_PAYLOAD_STORAGE);
    return;
  }

  const blob = await encryptJSON(cleaned);
  safeSetLocalStorageItem(VAULT_PAYLOAD_STORAGE, JSON.stringify(blob));
}

/**
 * Load and decrypt BYOK keys from localStorage.
 *
 * Returns empty object if:
 * - no vault exists
 * - storage is unavailable
 * - vault payload is corrupt
 * - device key was cleared
 * - decryption fails
 */
export async function loadBYOKVault(): Promise<BYOKVault> {
  try {
    const rawPayload = safeGetLocalStorageItem(VAULT_PAYLOAD_STORAGE);

    if (!rawPayload) {
      return {};
    }

    const parsed = JSON.parse(rawPayload) as unknown;

    if (!isEncryptedBlob(parsed)) {
      safeRemoveLocalStorageItem(VAULT_PAYLOAD_STORAGE);
      return {};
    }

    const decrypted = await decryptJSON<BYOKVault>(parsed);

    return cleanVault(decrypted);
  } catch (error) {
    console.warn("[byokVault] Failed to load vault. Clearing corrupted payload.", error);

    safeRemoveLocalStorageItem(VAULT_PAYLOAD_STORAGE);

    return {};
  }
}

/**
 * Wipe both encrypted payload and local device key.
 *
 * Use on:
 * - sign-out
 * - explicit user vault reset
 * - shared device cleanup
 */
export function clearBYOKVault(): void {
  safeRemoveLocalStorageItem(VAULT_PAYLOAD_STORAGE);
  safeRemoveLocalStorageItem(VAULT_KEY_STORAGE);
}

/**
 * Returns true when encrypted vault payload exists.
 *
 * This does not decrypt keys.
 */
export function hasBYOKVault(): boolean {
  return safeGetLocalStorageItem(VAULT_PAYLOAD_STORAGE) !== null;
}
