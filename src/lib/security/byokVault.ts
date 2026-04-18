// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// byokVault.ts — Client-side encrypted vault for user-supplied API keys.
//
// Why this exists:
//   Earlier versions of SettingsBYOK persisted BYOK keys to plaintext columns
//   on `profiles` (byok_*_hint). That meant:
//     • Anyone with read access to the row (admins, leaked service-role key,
//       SQL injection in unrelated paths) could exfiltrate live provider keys.
//     • Keys were stored at rest forever, with no per-user rotation.
//
// Design:
//   • A device-local, randomly-generated AES-GCM 256-bit key is created on
//     first use and stored in localStorage as raw base64. It NEVER leaves
//     the browser and is NEVER sent to the server.
//   • BYOK provider keys (OpenAI / Anthropic / Gemini) are encrypted with
//     this device key before being persisted to localStorage.
//   • On app boot, the vault is decrypted and provider keys are hydrated
//     into the in-memory `authStore.byokKeys` so `apiClient` can attach
//     them as `x-byok-*` headers per request.
//   • If the vault key is wiped (user clears site data), encrypted blobs
//     become permanently unreadable — fail-safe by design.
//
// Threat model covered:
//   ✅ Server compromise can't read the keys (they're not on the server).
//   ✅ Other tabs/extensions reading localStorage see ciphertext only.
//   ✅ DB row leak doesn't expose keys (no DB column anymore).
//
// NOT covered (acceptable):
//   ✗ Malicious browser extensions with full DOM access.
//   ✗ Physical access to the unlocked device.
//   These are outside the threat boundary of any browser-based vault.
// ─────────────────────────────────────────────────────────────────────────────

const VAULT_KEY_STORAGE     = "clarify-byok-vault-key-v1";
const VAULT_PAYLOAD_STORAGE = "clarify-byok-vault-v1";

export type BYOKProvider = "openai" | "anthropic" | "gemini";
export type BYOKVault    = Partial<Record<BYOKProvider, string>>;

interface EncryptedBlob {
  iv:         string;  // base64
  ciphertext: string;  // base64
}

// ─── base64 helpers (browser-safe) ───────────────────────────────────────────

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ─── Device key management ───────────────────────────────────────────────────

async function getOrCreateDeviceKey(): Promise<CryptoKey> {
  let raw = localStorage.getItem(VAULT_KEY_STORAGE);

  if (!raw) {
    const keyBytes = crypto.getRandomValues(new Uint8Array(32)); // 256-bit
    raw = bytesToB64(keyBytes);
    localStorage.setItem(VAULT_KEY_STORAGE, raw);
  }

  return crypto.subtle.importKey(
    "raw",
    b64ToBytes(raw),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// ─── Encrypt / decrypt ───────────────────────────────────────────────────────

async function encryptJSON(value: unknown): Promise<EncryptedBlob> {
  const key       = await getOrCreateDeviceKey();
  const iv        = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));

  // Cast through ArrayBuffer to satisfy TS strict BufferSource typing on
  // Uint8Array (lib.dom flips between ArrayBufferLike / SharedArrayBuffer).
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as ArrayBuffer },
    key,
    plaintext as unknown as ArrayBuffer,
  );

  return {
    iv:         bytesToB64(iv),
    ciphertext: bytesToB64(new Uint8Array(cipher)),
  };
}

async function decryptJSON<T>(blob: EncryptedBlob): Promise<T> {
  const key  = await getOrCreateDeviceKey();
  const iv   = b64ToBytes(blob.iv);
  const data = b64ToBytes(blob.ciphertext);

  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as unknown as ArrayBuffer },
    key,
    data as unknown as ArrayBuffer,
  );

  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Persist BYOK keys to encrypted localStorage. Pass an empty object to clear.
 * Throws on any crypto failure — caller should surface this in the UI.
 */
export async function saveBYOKVault(vault: BYOKVault): Promise<void> {
  // Strip empty / whitespace-only entries so we don't ship blanks to EFs
  const cleaned: BYOKVault = {};
  for (const k of ["openai", "anthropic", "gemini"] as const) {
    const v = vault[k];
    if (typeof v === "string" && v.trim()) cleaned[k] = v.trim();
  }

  if (Object.keys(cleaned).length === 0) {
    localStorage.removeItem(VAULT_PAYLOAD_STORAGE);
    return;
  }

  const blob = await encryptJSON(cleaned);
  localStorage.setItem(VAULT_PAYLOAD_STORAGE, JSON.stringify(blob));
}

/**
 * Load and decrypt BYOK keys from localStorage.
 * Returns an empty object if no vault exists or decryption fails (e.g. user
 * cleared the device key but kept the payload, or storage is corrupt).
 */
export async function loadBYOKVault(): Promise<BYOKVault> {
  try {
    const raw = localStorage.getItem(VAULT_PAYLOAD_STORAGE);
    if (!raw) return {};
    const blob = JSON.parse(raw) as EncryptedBlob;
    return await decryptJSON<BYOKVault>(blob);
  } catch (err) {
    console.warn("[byokVault] Failed to load vault, returning empty:", err);
    return {};
  }
}

/**
 * Wipe both the encrypted payload and the device key. Use on sign-out from
 * a shared device or when the user explicitly requests a vault reset.
 */
export function clearBYOKVault(): void {
  localStorage.removeItem(VAULT_PAYLOAD_STORAGE);
  localStorage.removeItem(VAULT_KEY_STORAGE);
}

/**
 * Returns true when at least one provider key is present. Used by the UI to
 * show "Configured" badges without ever decrypting the keys themselves.
 */
export function hasBYOKVault(): boolean {
  return localStorage.getItem(VAULT_PAYLOAD_STORAGE) !== null;
}
