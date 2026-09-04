/**
 * Career Pilot brand helpers for storage keys + download/export filenames.
 * New writes use Career Pilot; reads fall back to legacy Clarify keys.
 */

import { PRODUCT_NAMES } from "@/lib/constants/productNames";

/** Filename / download slug (kebab-case). */
export const BRAND_FILE_SLUG = "career-pilot";

/** Legacy filename prefixes still accepted for read/migration. */
export const LEGACY_FILE_SLUGS = ["clarify-ai", "clarify", "Clarify-AI"] as const;

export function brandExportBasename(kind: string, dateOrId: string): string {
  const safeKind = String(kind || "export").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
  const safeTail = String(dateOrId || "data").replace(/[^a-z0-9._-]+/gi, "-");
  return `${BRAND_FILE_SLUG}-${safeKind}-${safeTail}`;
}

/** User-facing product label for downloads / exports. */
export function brandProductLabel(): string {
  return PRODUCT_NAMES.brand;
}

/**
 * Read localStorage with Career Pilot key first, then legacy Clarify keys.
 * Optionally copies legacy value into the new key (one-time migration).
 */
export function localStorageGetWithLegacy(
  primaryKey: string,
  legacyKeys: readonly string[],
  opts?: { migrate?: boolean },
): string | null {
  if (typeof window === "undefined") return null;
  try {
    const primary = window.localStorage.getItem(primaryKey);
    if (primary != null) return primary;
    for (const legacy of legacyKeys) {
      const value = window.localStorage.getItem(legacy);
      if (value == null) continue;
      if (opts?.migrate !== false) {
        try {
          window.localStorage.setItem(primaryKey, value);
        } catch {
          /* ignore quota */
        }
      }
      return value;
    }
  } catch {
    return null;
  }
  return null;
}

export function localStorageSetBrand(
  primaryKey: string,
  value: string,
  legacyKeysToRemove?: readonly string[],
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(primaryKey, value);
    for (const legacy of legacyKeysToRemove ?? []) {
      try {
        window.localStorage.removeItem(legacy);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}
