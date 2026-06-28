// ─────────────────────────────────────────────────────────────────────────────
// zIndexManager.ts — Centralized z-index hierarchy for the overlay system.
// Ensures all overlay layers stack correctly and never conflict with app UI.
// Critical for stealth: overlay must always render above Zoom/Meet UI chrome.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Z-Index Layers (ascending order) ────────────────────────────────────────

export const Z_LAYERS = {
  // ── App UI (base) ─────────────────────────────────────────────────────────
  APP_BASE:              1,
  APP_CONTENT:          10,
  APP_HEADER:          100,
  APP_SIDEBAR:         200,
  APP_DROPDOWN:        300,
  APP_MODAL_BACKDROP:  400,
  APP_MODAL:           500,
  APP_TOAST:           600,
  APP_TOOLTIP:         700,

  // ── Overlay in app shell (below sidebar/header so nav stays clickable) ──
  OVERLAY_IN_SHELL:      150,

  // ── Overlay System ────────────────────────────────────────────────────────
  OVERLAY_BASE:         1000,
  OVERLAY_WINDOW:       1100,
  OVERLAY_HINT_PANEL:   1200,
  OVERLAY_TRANSCRIPT:   1300,
  OVERLAY_METRICS:      1400,
  OVERLAY_QUESTION_BAR: 1500,
  OVERLAY_SETTINGS:     1600,
  OVERLAY_NETWORK_BADGE:1700,

  // ── Stealth Critical (always on top) ─────────────────────────────────────
  STEALTH_MOUSE_GUARD:  9000,
  STEALTH_SCREEN_BLOCK: 9100,
  PANIC_BUTTON:         9200,
  VISIBILITY_MANAGER:   9300,
  CAPTURE_EVASION:      9999,
} as const;

export type ZLayer = keyof typeof Z_LAYERS;
export type ZValue = (typeof Z_LAYERS)[ZLayer];

// ─── Layer Groups ─────────────────────────────────────────────────────────────

export const LAYER_GROUPS = {
  APP: Object.entries(Z_LAYERS)
    .filter(([k]) => k.startsWith("APP_"))
    .map(([, v]) => v),

  OVERLAY: Object.entries(Z_LAYERS)
    .filter(([k]) => k.startsWith("OVERLAY_"))
    .map(([, v]) => v),

  STEALTH: Object.entries(Z_LAYERS)
    .filter(([k]) =>
      k.startsWith("STEALTH_") ||
      k === "PANIC_BUTTON"     ||
      k === "CAPTURE_EVASION"  ||
      k === "VISIBILITY_MANAGER",
    )
    .map(([, v]) => v),
} as const;

// ─── ZIndexManager Class ──────────────────────────────────────────────────────

interface ManagedElement {
  id:       string;
  layer:    ZLayer;
  element:  HTMLElement | null;
  baseZ:    number;
  offset:   number;
  elevated: boolean;
}

export class ZIndexManager {
  private elements        = new Map<string, ManagedElement>();
  private elevationStack: string[] = [];

  // FIX: cache external z-index scan result to avoid O(n) DOM query every call.
  // Cache is invalidated after `externalZCacheTtlMs` (default 2 000 ms).
  private externalZCache:      number | null = null;
  private externalZCachedAt:   number        = 0;
  private externalZCacheTtlMs: number        = 2_000;

  // ── Register ──────────────────────────────────────────────────────────────

  register(
    id:       string,
    layer:    ZLayer,
    element?: HTMLElement,
    offset    = 0,
  ): number {
    const baseZ  = Z_LAYERS[layer];
    const finalZ = baseZ + offset;

    const managed: ManagedElement = {
      id,
      layer,
      element: element ?? null,
      baseZ,
      offset,
      elevated: false,
    };

    this.elements.set(id, managed);

    if (element) {
      element.style.zIndex   = String(finalZ);
      element.style.position = element.style.position || "fixed";
    }

    return finalZ;
  }

  // ── Unregister ────────────────────────────────────────────────────────────

  unregister(id: string): void {
    const managed = this.elements.get(id);
    if (managed?.element) {
      managed.element.style.zIndex = "";
    }
    this.elements.delete(id);
    this.elevationStack = this.elevationStack.filter((eid) => eid !== id);
  }

  // ── Get Z Value ───────────────────────────────────────────────────────────

  getZ(id: string): number | null {
    const m = this.elements.get(id);
    if (!m) return null;
    return m.baseZ + m.offset + (m.elevated ? 50 : 0);
  }

  getLayerZ(layer: ZLayer): number {
    return Z_LAYERS[layer];
  }

  // ── Elevate ───────────────────────────────────────────────────────────────

  elevate(id: string): void {
    const managed = this.elements.get(id);
    if (!managed) return;

    // Lower any other elevated element in the same layer
    for (const m of this.elements.values()) {
      if (m.layer === managed.layer && m.id !== id && m.elevated) {
        m.elevated = false;
        this.applyZ(m);
      }
    }

    managed.elevated = true;
    this.applyZ(managed);

    this.elevationStack = [
      id,
      ...this.elevationStack.filter((eid) => eid !== id),
    ].slice(0, 20);
  }

  deelevate(id: string): void {
    const managed = this.elements.get(id);
    if (!managed) return;
    managed.elevated = false;
    this.applyZ(managed);
  }

  // ── Offset Adjustment ─────────────────────────────────────────────────────

  setOffset(id: string, offset: number): void {
    const managed = this.elements.get(id);
    if (!managed) return;
    managed.offset = offset;
    this.applyZ(managed);
  }

  // ── Apply Z to DOM ────────────────────────────────────────────────────────

  private applyZ(managed: ManagedElement): void {
    if (!managed.element) return;
    const z = managed.baseZ + managed.offset + (managed.elevated ? 50 : 0);
    managed.element.style.zIndex = String(z);
  }

  applyAll(): void {
    this.elements.forEach((m) => this.applyZ(m));
  }

  // ── Stealth Promotion ─────────────────────────────────────────────────────

  /**
   * Promote overlay above any detected third-party UI (Zoom, Meet, etc.)
   * by scanning the DOM for high z-index elements and outbidding them.
   */
  promoteAboveExternalUI(elementId: string): void {
    const maxExternal = this.detectMaxExternalZIndex();
    const managed     = this.elements.get(elementId);
    if (!managed) return;

    if (maxExternal >= managed.baseZ) {
      this.setOffset(elementId, maxExternal - managed.baseZ + 10);
    }
  }

  /**
   * FIX: cache the expensive DOM scan for `externalZCacheTtlMs` milliseconds
   * so repeated calls (e.g. on every drag frame) don't re-scan the entire DOM.
   * Call `invalidateExternalZCache()` after major DOM mutations if needed.
   */
  private detectMaxExternalZIndex(): number {
    const now = Date.now();
    if (
      this.externalZCache !== null &&
      now - this.externalZCachedAt < this.externalZCacheTtlMs
    ) {
      return this.externalZCache;
    }

    let max = 0;

    try {
      const ownElements = new Set(
        [...this.elements.values()].map((m) => m.element).filter(Boolean),
      );

      document.querySelectorAll("*").forEach((el) => {
        if (ownElements.has(el as HTMLElement)) return;
        const z = parseInt(window.getComputedStyle(el).zIndex, 10);
        if (!isNaN(z) && z > max && z < 9000) max = z;
      });
    } catch {}

    this.externalZCache    = max;
    this.externalZCachedAt = now;
    return max;
  }

  /** Force the next call to detectMaxExternalZIndex to re-scan the DOM. */
  invalidateExternalZCache(): void {
    this.externalZCache    = null;
    this.externalZCachedAt = 0;
  }

  // ── Debug Snapshot ────────────────────────────────────────────────────────

  getSnapshot(): Array<{ id: string; layer: ZLayer; z: number; elevated: boolean }> {
    return [...this.elements.entries()]
      .map(([id, m]) => ({
        id,
        layer:    m.layer,
        z:        m.baseZ + m.offset + (m.elevated ? 50 : 0),
        elevated: m.elevated,
      }))
      .sort((a, b) => b.z - a.z);
  }

  // ── Reset ─────────────────────────────────────────────────────────────────

  reset(): void {
    this.elements.forEach((m) => {
      m.elevated = false;
      m.offset   = 0;
      this.applyZ(m);
    });
    this.elevationStack = [];
    this.invalidateExternalZCache();
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _zManager: ZIndexManager | null = null;

export function getZIndexManager(): ZIndexManager {
  if (!_zManager) _zManager = new ZIndexManager();
  return _zManager;
}

// ─── Convenience Helpers ──────────────────────────────────────────────────────

/**
 * Get z-index value for a layer directly.
 *
 * @example
 * style={{ zIndex: z("OVERLAY_HINT_PANEL") }}
 * className={`z-[${z("PANIC_BUTTON")}]`}
 */
export const z = (layer: ZLayer): number => Z_LAYERS[layer];

export type OverlayStackContext = "in-app-shell" | "fullscreen" | "electron";

/** Z-index for the floating overlay panel — below app chrome when embedded in the shell. */
export function getOverlayPortalZIndex(
  context: OverlayStackContext,
  sessionActive = false,
): number {
  if (sessionActive && context === "in-app-shell") {
    return Z_LAYERS.OVERLAY_WINDOW;
  }

  switch (context) {
    case "in-app-shell":
      return Z_LAYERS.OVERLAY_IN_SHELL;
    case "electron":
    case "fullscreen":
    default:
      return Z_LAYERS.OVERLAY_WINDOW;
  }
}

/**
 * Inject all z-index values as CSS custom properties on :root.
 * Call once at app root.
 *
 * @example
 * // In main.tsx
 * injectZIndexVariables();
 *
 * // In CSS:
 * .overlay { z-index: var(--z-overlay-window); }
 */
export function injectZIndexVariables(): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(Z_LAYERS)) {
    const cssVar = `--z-${key.toLowerCase().replace(/_/g, "-")}`;
    root.style.setProperty(cssVar, String(value));
  }
}

/**
 * Returns true if `element` is visually obscured by another DOM element
 * at its centre point.
 */
export function isObscured(element: HTMLElement): boolean {
  try {
    const rect   = element.getBoundingClientRect();
    const centerX = rect.left + rect.width  / 2;
    const centerY = rect.top  + rect.height / 2;
    const topEl  = document.elementFromPoint(centerX, centerY);
    return topEl !== null && !element.contains(topEl);
  } catch {
    return false;
  }
}

/**
 * Move `element` to the end of `document.body` so it renders on top of all
 * siblings without changing its z-index value.
 */
export function hoistToBody(element: HTMLElement): void {
  if (
    element.parentElement !== document.body ||
    element !== document.body.lastElementChild
  ) {
    document.body.appendChild(element);
  }
}
