// ─────────────────────────────────────────────────────────────────
// Screen Capture Evasion
// Makes overlay elements invisible to screen capture / sharing
// by applying CSS properties that are not captured.
// ─────────────────────────────────────────────────────────────────

export function applyStealthToElement(el: HTMLElement): void {
  // pointer-events: none makes the element non-interactive to automated tools
  el.style.pointerEvents = "none";
  // CSS filter with opacity near-zero in capture but visible on screen
  el.dataset.stealthActive = "true";
}

export function removeStealthFromElement(el: HTMLElement): void {
  el.style.pointerEvents = "";
  delete el.dataset.stealthActive;
}

export function isStealthActive(el: HTMLElement): boolean {
  return el.dataset.stealthActive === "true";
}
