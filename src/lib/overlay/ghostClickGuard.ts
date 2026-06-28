let suppressUntil = 0;

/** Block the next stray click/pointer-up after overlay drag or resize. */
export function suppressOverlayGhostClicks(ms = 500): void {
  suppressUntil = Date.now() + ms;
}

export function isOverlayGhostClickSuppressed(): boolean {
  return Date.now() < suppressUntil;
}

function guardHandler(e: Event): void {
  if (!isOverlayGhostClickSuppressed()) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
}

/** Install a capture-phase guard so drag-release does not activate controls under the overlay. */
export function installOverlayGhostClickGuard(): () => void {
  const events = ["click", "pointerup", "mouseup"] as const;
  for (const ev of events) {
    document.addEventListener(ev, guardHandler, true);
  }
  return () => {
    for (const ev of events) {
      document.removeEventListener(ev, guardHandler, true);
    }
  };
}
