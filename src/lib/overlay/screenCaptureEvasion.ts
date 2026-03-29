// ─────────────────────────────────────────────────────────────────
// Screen Capture Evasion
// Applies CSS-based evasion primitives that reduce the likelihood
// of the element being captured during screen-sharing tools.
// Note: This is BEST-EFFORT — browser-level capture cannot be
// perfectly defeated without an extension/native shell.
// ─────────────────────────────────────────────────────────────────

/**
 * The dataset attribute key used to signal stealth mode.
 * CSS selectors can target [data-stealth-active="true"].
 * Exporting this prevents callers from hardcoding the string.
 */
export const STEALTH_ATTR = "stealthActive" as const;

/**
 * Applies stealth mode to an overlay element by setting a dataset flag.
 * Pointer events remain enabled so the element stays interactive.
 */
export function applyStealthToElement(el: HTMLElement): void {
  el.dataset[STEALTH_ATTR] = "true";
}

/**
 * Removes stealth mode and restores normal behaviour.
 */
export function removeStealthFromElement(el: HTMLElement): void {
  delete el.dataset[STEALTH_ATTR];
}

/**
 * Returns true if stealth mode is currently active on the element.
 */
export function isStealthActive(el: HTMLElement): boolean {
  return el.dataset[STEALTH_ATTR] === "true";
}

/**
 * FIX: Toggle helper — callers previously had to call apply/remove separately,
 * leading to conditional logic scattered across the codebase.
 * Returns the new stealth state (true = stealth on, false = stealth off).
 */
export function toggleStealthOnElement(el: HTMLElement): boolean {
  if (isStealthActive(el)) {
    removeStealthFromElement(el);
    return false;
  } else {
    applyStealthToElement(el);
    return true;
  }
}
