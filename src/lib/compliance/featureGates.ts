/**
 * Compliance feature gates (production audit P0).
 *
 * Covert-assistance capabilities (hiding UI from screen capture, panic-hide,
 * anti-detection overlays) must stay OFF unless explicitly approved by
 * legal/compliance and enabled via server-side admin flag.
 */

/** Screen-capture exclusion / evasion — permanently disabled in production builds. */
export const SCREEN_CAPTURE_EVASION_ENABLED = false;

/**
 * "Discrete UI" renames nav labels only (no capture hiding).
 * Safe for practice privacy at home; does not conceal the app from others.
 */
export const DISCRETE_UI_LABELS_ENABLED = true;

/** Requires VITE_COMPLIANCE_STEALTH_APPROVED=true AND admin profile flag (future). */
export function isStealthCaptureFeatureAllowed(): boolean {
  if (!SCREEN_CAPTURE_EVASION_ENABLED) return false;
  return import.meta.env.VITE_COMPLIANCE_STEALTH_APPROVED === "true";
}
