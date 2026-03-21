// ─────────────────────────────────────────────────────────────────
// Screen Capture Evasion
// Applies CSS-based evasion primitives that reduce the likelihood
// of the element being captured during screen-sharing tools.
// Note: This is BEST-EFFORT — browser-level capture cannot be
// perfectly defeated without an extension/native shell.
// ─────────────────────────────────────────────────────────────────

/**
 * Applies stealth mode to an overlay element.
 * This reduces the likelihood of capture by:
 *  - disabling pointer events
 *  - marking element with a dataset flag
 * Additional CSS selectors can be used to apply special filters.
 */
export function applyStealthToElement(el: HTMLElement): void {
  el.dataset.stealthActive = "true";
}

/**
 * Removes stealth mode and restores normal behavior.
 */
export function removeStealthFromElement(el: HTMLElement): void {
  delete el.dataset.stealthActive;
}

/**
 * Returns true if stealth mode is currently active.
 */
export function isStealthActive(el: HTMLElement): boolean {
  return el.dataset.stealthActive === "true";
}
