import type { HotkeyId } from "@/lib/constants/hotkeys";

export type UiPreferencesRecord = Record<string, unknown>;
export type HotkeyOverridesRecord = Partial<Record<HotkeyId, string>>;

/** Narrow unknown/json prefs to a plain object, or null. */
export function asUiPreferencesRecord(value: unknown): UiPreferencesRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as UiPreferencesRecord;
}

/**
 * Shallow-merge top-level ui_preferences keys so theme / polish / hotkeys / audio
 * patches do not wipe sibling keys when writers only know their slice.
 */
export function mergeUiPreferences(
  existing: unknown,
  patch: UiPreferencesRecord,
): UiPreferencesRecord {
  const base = asUiPreferencesRecord(existing) ?? {};
  return { ...base, ...patch };
}

/**
 * Read hotkey overrides from account prefs.
 * Returns null when missing/invalid so callers can keep localStorage intact.
 * Returns the object (possibly empty) when a hotkeys key is present.
 */
export function readHotkeysFromUiPreferences(
  prefs: unknown,
): HotkeyOverridesRecord | null {
  const record = asUiPreferencesRecord(prefs);
  if (!record) return null;
  if (!("hotkeys" in record)) return null;
  const hotkeys = record.hotkeys;
  if (!hotkeys || typeof hotkeys !== "object" || Array.isArray(hotkeys)) return null;
  return hotkeys as HotkeyOverridesRecord;
}

/** True when account hotkeys contain at least one binding to apply to the device. */
export function hasHotkeyOverrides(hotkeys: HotkeyOverridesRecord | null): boolean {
  if (!hotkeys) return false;
  return Object.keys(hotkeys).length > 0;
}
