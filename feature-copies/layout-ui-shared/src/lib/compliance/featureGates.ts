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
 * Screen-capture exclusion / overlay hiding is not permitted.
 * Practice overlay must remain visible on screen share.
 */
export function isStealthCaptureFeatureAllowed(): boolean {
  return false;
}
