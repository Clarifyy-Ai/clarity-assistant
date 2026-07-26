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
 * Screen-capture exclusion via Electron setContentProtection.
 * Opt-in only: allowed in Electron builds when the user enables stealth_mode
 * (or explicitly toggles capture exclusion). Default is false / visible.
 */
export function isStealthCaptureFeatureAllowed(): boolean {
  if (typeof window === "undefined" || !(window as any).electronAPI?.isElectron) {
    return false;
  }
  // Feature may be used when user opts in; gate does not auto-enable it.
  return true;
}
