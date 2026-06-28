/**
 * Compliance feature gates (production audit P0).
 *
 * Covert-assistance capabilities (hiding UI from screen capture, panic-hide,
 * anti-detection overlays) have been removed from the codebase.
 */

/**
 * "Discrete UI" renames nav labels only (no capture hiding).
 * Safe for practice privacy at home; does not conceal the app from others.
 */
export const DISCRETE_UI_LABELS_ENABLED = true;

/**
 * Stealth capture-evasion is permanently disabled by compliance policy.
 * This always returns false; callers should treat it as a hard gate.
 */
export function isStealthCaptureFeatureAllowed(): boolean {
  return false;
}
