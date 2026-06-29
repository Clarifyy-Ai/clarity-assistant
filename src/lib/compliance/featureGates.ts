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
 * Enabled for desktop (Electron) builds only — uses OS-native APIs
 * (Windows DWM WDA_EXCLUDEFROMCAPTURE, macOS CGWindowLevel).
 * Returns false for browser/web builds where OS capture APIs are unavailable.
 */
export function isStealthCaptureFeatureAllowed(): boolean {
  // Only allow in Electron desktop builds
  return typeof window !== "undefined" &&
    !!(window as any).electronAPI?.isElectron;
}
