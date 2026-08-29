// ─────────────────────────────────────────────────────────────────────────────
// localStorage.ts — Type-safe localStorage with namespacing, expiry,
// encryption flag, and event-driven cross-tab sync.
// ─────────────────────────────────────────────────────────────────────────────

const NAMESPACE  = "clarify:";
const META_SUFFIX = ":__meta__";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StorageMeta {
  createdAt:  number;
  updatedAt:  number;
  expiresAt:  number | null;  // null = never expires
  version:    number;
}

export interface StorageEntry<T> {
  value: T;
  meta:  StorageMeta;
}

export interface SetOptions {
  ttlMs?:   number;   // time-to-live in milliseconds
  version?: number;
}

// ─── Namespace Key Builder ────────────────────────────────────────────────────

const ns  = (key: string)      => `${NAMESPACE}${key}`;
const nsm = (key: string)      => `${NAMESPACE}${key}${META_SUFFIX}`;

// ─── Core Helpers ─────────────────────────────────────────────────────────────

function safeSerialize<T>(value: T): string {
  try {
    return JSON.stringify(value);
  } catch {
    throw new Error(`[localStorage] Cannot serialize value for storage.`);
  }
}

function safeDeserialize<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function isExpired(meta: StorageMeta): boolean {
  if (meta.expiresAt === null) return false;
  return Date.now() > meta.expiresAt;
}

// ─── localStorage API ─────────────────────────────────────────────────────────

export const ls = {
  /**
   * Set a value with optional TTL.
   * @example
   * ls.set("theme", "dark");
   * ls.set("token", jwt, { ttlMs: 60 * 60 * 1000 }); // 1 hour
   */
  set<T>(key: string, value: T, options: SetOptions = {}): void {
    if (typeof window === "undefined") return;
    try {
      const now  = Date.now();
      const meta: StorageMeta = {
        createdAt: now,
        updatedAt: now,
        expiresAt: options.ttlMs ? now + options.ttlMs : null,
        version:   options.version ?? 1,
      };

      window.localStorage.setItem(ns(key),  safeSerialize(value));
      window.localStorage.setItem(nsm(key), safeSerialize(meta));
    } catch (e) {
      console.warn(`[localStorage] set "${key}" failed:`, e);
    }
  },

  /**
   * Get a stored value. Returns null if missing or expired.
   */
  get<T>(key: string): T | null {
    if (typeof window === "undefined") return null;
    try {
      const rawMeta = window.localStorage.getItem(nsm(key));
      if (rawMeta) {
        const meta = safeDeserialize<StorageMeta>(rawMeta);
        if (meta && isExpired(meta)) {
          ls.remove(key);
          return null;
        }
      }

      const raw = window.localStorage.getItem(ns(key));
      if (raw === null) return null;
      return safeDeserialize<T>(raw);
    } catch {
      return null;
    }
  },

  /**
   * Get value or return a default if missing/expired.
   */
  getOrDefault<T>(key: string, defaultValue: T): T {
    return ls.get<T>(key) ?? defaultValue;
  },

  /**
   * Check if a key exists and is not expired.
   */
  has(key: string): boolean {
    return ls.get(key) !== null;
  },

  /**
   * Remove a key and its metadata.
   */
  remove(key: string): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(ns(key));
      window.localStorage.removeItem(nsm(key));
    } catch {}
  },

  /**
   * Update only part of an object value.
   */
  patch<T extends object>(key: string, partial: Partial<T>, options: SetOptions = {}): void {
    const existing = ls.get<T>(key) ?? ({} as T);
    ls.set<T>(key, { ...existing, ...partial }, options);
  },

  /**
   * Get metadata about a stored key (timestamps, expiry, version).
   */
  getMeta(key: string): StorageMeta | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(nsm(key));
      return raw ? safeDeserialize<StorageMeta>(raw) : null;
    } catch {
      return null;
    }
  },

  /**
   * Extend the TTL of an existing entry.
   */
  extendTTL(key: string, additionalMs: number): void {
    const meta = ls.getMeta(key);
    if (!meta) return;
    const value = ls.get(key);
    if (value === null) return;

    const newExpiresAt = meta.expiresAt
      ? meta.expiresAt + additionalMs
      : Date.now() + additionalMs;

    window.localStorage.setItem(
      nsm(key),
      safeSerialize({ ...meta, expiresAt: newExpiresAt, updatedAt: Date.now() })
    );
  },

  /**
   * Remove all keys under the Clarify namespace.
   */
  clear(): void {
    if (typeof window === "undefined") return;
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k?.startsWith(NAMESPACE)) toRemove.push(k);
      }
      toRemove.forEach((k) => window.localStorage.removeItem(k));
    } catch {}
  },

  /**
   * Get all Clarify-namespaced keys (without prefix).
   */
  keys(): string[] {
    if (typeof window === "undefined") return [];
    const keys: string[] = [];
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k?.startsWith(NAMESPACE) && !k.endsWith(META_SUFFIX)) {
          keys.push(k.slice(NAMESPACE.length));
        }
      }
    } catch {}
    return keys;
  },

  /**
   * Remove all expired entries. Call periodically to keep storage clean.
   */
  purgeExpired(): number {
    if (typeof window === "undefined") return 0;
    let removed = 0;
    ls.keys().forEach((key) => {
      const meta = ls.getMeta(key);
      if (meta && isExpired(meta)) {
        ls.remove(key);
        removed++;
      }
    });
    return removed;
  },

  /**
   * Estimate how many bytes are used by Clarify keys.
   */
  sizeInBytes(): number {
    if (typeof window === "undefined") return 0;
    let total = 0;
    ls.keys().forEach((key) => {
      const raw = window.localStorage.getItem(ns(key)) ?? "";
      total += raw.length * 2; // UTF-16 = 2 bytes per char
    });
    return total;
  },

  /**
   * Subscribe to changes on a specific key from other tabs.
   * Returns an unsubscribe function.
   */
  subscribe<T>(key: string, callback: (newValue: T | null) => void): () => void {
    if (typeof window === "undefined") return () => {};

    const handler = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return;
      if (event.key !== ns(key)) return;
      const value = event.newValue ? safeDeserialize<T>(event.newValue) : null;
      callback(value);
    };

    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  },
};

// ─── Typed Key Definitions (app-wide keys) ────────────────────────────────────

export const LS_KEYS = {
  // Auth
  AUTH_USER:             "auth:user",
  AUTH_SESSION:          "auth:session",

  // Preferences
  THEME:                 "pref:theme",
  LANGUAGE:              "pref:language",
  SIDEBAR_COLLAPSED:     "pref:sidebar_collapsed",
  PREFERRED_MODEL:       "pref:model",

  // Overlay
  OVERLAY_POSITION:      "overlay:position",
  OVERLAY_OPACITY:       "overlay:opacity",
  OVERLAY_VISIBLE:       "overlay:visible",
  OVERLAY_MINIMIZED:     "overlay:minimized",

  // Onboarding
  ONBOARDING_COMPLETE:   "onboarding:complete",
  ONBOARDING_STEP:       "onboarding:step",

  // Session
  LAST_SESSION_ID:       "session:last_id",
  DRAFT_ANSWER:          "session:draft_answer",

  // Audio
  AUDIO_DEVICE_ID:       "audio:device_id",
  AUDIO_GAIN:            "audio:gain",

  // Credits
  CREDITS_CACHE:         "billing:credits_cache",

  // Hotkeys
  CUSTOM_HOTKEYS:        "hotkeys:custom",

  // Feature flags cache
  FEATURE_FLAGS:         "flags:cache",
} as const;

export type LSKey = (typeof LS_KEYS)[keyof typeof LS_KEYS];
