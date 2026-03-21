// ─────────────────────────────────────────────────────────────────────────────
// zIndexManager.ts — Centralized z-index hierarchy for the overlay system.
// Ensures all overlay layers stack correctly and never conflict with app UI.
// Critical for stealth: overlay must always render above Zoom/Meet UI chrome.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Z-Index Layers (in ascending order) ─────────────────────────────────────

export const Z_LAYERS = {
  // ── App UI (base) ─────────────────────────────────────────────────────────
  APP_BASE:             1,
  APP_CONTENT:          10,
  APP_HEADER:           100,
  APP_SIDEBAR:          200,
  APP_DROPDOWN:         300,
  APP_MODAL_BACKDROP:   400,
  APP_MODAL:            500,
  APP_TOAST:            600,
  APP_TOOLTIP:          700,

  // ── Overlay System ────────────────────────────────────────────────────────
  OVERLAY_BASE:         1000,    // base overlay container
  OVERLAY_WINDOW:       1100,    // draggable overlay window
  OVERLAY_HINT_PANEL:   1200,    // hints/answers panel
  OVERLAY_TRANSCRIPT:   1300,    // transcript stream
  OVERLAY_METRICS:      1400,    // live metrics panel
  OVERLAY_QUESTION_BAR: 1500,    // question capture bar
  OVERLAY_SETTINGS:     1600,    // overlay settings panel
  OVERLAY_NETWORK_BADGE:1700,    // network quality badge

  // ── Stealth Critical (always on top of everything) ────────────────────────
  STEALTH_MOUSE_GUARD:  9000,    // invisible mouse tracking layer
  STEALTH_SCREEN_BLOCK: 9100,    // screen capture blocker overlay
  PANIC_BUTTON:         9200,    // emergency hide — must be always clickable
  VISIBILITY_MANAGER:   9300,    // window visibility controller
  CAPTURE_EVASION:      9999,    // absolute top — capture evasion layer
} as const;

export type ZLayer = keyof typeof Z_LAYERS;
export type ZValue = (typeof Z_LAYERS)[ZLayer];

// ─── Layer Groups ─────────────────────────────────────────────────────────────

export const LAYER_GROUPS = {
  APP:     Object.entries(Z_LAYERS)
    .filter(([k]) => k.startsWith("APP_"))
    .map(([, v]) => v),

  OVERLAY: Object.entries(Z_LAYERS)
    .filter(([k]) => k.startsWith("OVERLAY_"))
    .map(([, v]) => v),

  STEALTH: Object.entries(Z_LAYERS)
    .filter(([k]) => k.startsWith("STEALTH_") || k === "PANIC_BUTTON" || k === "CAPTURE_EVASION" || k === "VISIBILITY_MANAGER")
    .map(([, v]) => v),
} as const;

// ─── ZIndexManager Class ──────────────────────────────────────────────────────

interface ManagedElement {
  id:        string;
  layer:     ZLayer;
  element:   HTMLElement | null;
  baseZ:     number;
  offset:    number;       // dynamic offset added on top of layer base
  elevated:  boolean;      // temporarily promoted to top of its group
}

export class ZIndexManager {
  private elements = new Map<string, ManagedElement>();
  private elevationStack: string[] = [];  // LRU stack for elevation

  // ── Register ──────────────────────────────────────────────────────────────

  /**
   * Register an element with a z-index layer.
   * Optionally pass the DOM element to apply styles immediately.
   */
  register(
    id: string,
    layer: ZLayer,
    element?: HTMLElement,
    offset = 0
  ): number {
    const baseZ = Z_LAYERS[layer];
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
      element.style.zIndex = String(finalZ);
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
    const managed = this.elements.get(id);
    if (!managed) return null;
    return managed.baseZ + managed.offset + (managed.elevated ? 50 : 0);
  }

  getLayerZ(layer: ZLayer): number {
    return Z_LAYERS[layer];
  }

  // ── Elevate (bring to front within group) ─────────────────────────────────

  /**
   * Temporarily elevate an element to the top of its layer group.
   * Used when user clicks/focuses an overlay panel.
   */
  elevate(id: string): void {
    const managed = this.elements.get(id);
    if (!managed) return;

    // Lower previously elevated element in same group
    const sameGroup = [...this.elements.values()].filter(
      (m) => m.layer === managed.layer && m.id !== id && m.elevated
    );
    sameGroup.forEach((m) => {
      m.elevated = false;
      this.applyZ(m);
    });

    managed.elevated = true;
    this.applyZ(managed);

    // Track elevation order
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

  // ── Apply Z to DOM Element ────────────────────────────────────────────────

  private applyZ(managed: ManagedElement): void {
    if (!managed.element) return;
    const z = managed.baseZ + managed.offset + (managed.elevated ? 50 : 0);
    managed.element.style.zIndex = String(z);
  }

  // ── Batch Apply ───────────────────────────────────────────────────────────

  /**
   * Apply z-index to all registered elements that have DOM references.
   * Call after dynamic DOM changes.
   */
  applyAll(): void {
    this.elements.forEach((managed) => this.applyZ(managed));
  }

  // ── Stealth Promotion ─────────────────────────────────────────────────────

  /**
   * Promote overlay above any detected third-party UI (Zoom, Meet, etc.)
   * by scanning the DOM for high z-index elements and outbidding them.
   */
  promoteAboveExternalUI(elementId: string): void {
    const maxExternal = this.detectMaxExternalZIndex();
    const managed = this.elements.get(elementId);
    if (!managed) return;

    // If external UI is higher than our overlay layer, bump up
    if (maxExternal >= managed.baseZ) {
      const newOffset = maxExternal - managed.baseZ + 10;
      this.setOffset(elementId, newOffset);
    }
  }

  private detectMaxExternalZIndex(): number {
    let max = 0;

    try {
      const allElements = document.querySelectorAll("*");
      const overlayIds  = new Set([...this.elements.values()]
        .map((m) => m.element)
        .filter(Boolean));

      allElements.forEach((el) => {
        if (overlayIds.has(el as HTMLElement)) return;
        const z = parseInt(window.getComputedStyle(el).zIndex, 10);
        if (!isNaN(z) && z > max && z < 9000) max = z;
      });
    } catch {}

    return max;
  }

  // ── Debug Snapshot ────────────────────────────────────────────────────────

  getSnapshot(): Array<{ id: string; layer: ZLayer; z: number; elevated: boolean }> {
    return [...this.elements.entries()].map(([id, m]) => ({
      id,
      layer:    m.layer,
      z:        m.baseZ + m.offset + (m.elevated ? 50 : 0),
      elevated: m.elevated,
    })).sort((a, b) => b.z - a.z);
  }

  // ── Reset ─────────────────────────────────────────────────────────────────

  reset(): void {
    this.elements.forEach((m) => {
      m.elevated = false;
      m.offset   = 0;
      this.applyZ(m);
    });
    this.elevationStack = [];
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
 * Use this in React inline styles or Tailwind arbitrary values.
 *
 * @example
 * style={{ zIndex: z("OVERLAY_HINT_PANEL") }}
 * className={`z-[${z("PANIC_BUTTON")}]`}
 */
export const z = (layer: ZLayer): number => Z_LAYERS[layer];

/**
 * CSS variable injection — call once at app root to expose
 * all z-index values as CSS custom properties.
 *
 * @example
 * // In main.tsx or App.tsx
 * injectZIndexVariables();
 *
 * // In CSS:
 * .overlay { z-index: var(--z-overlay-window); }
 */
export function injectZIndexVariables(): void {
  const root = document.documentElement;
  Object.entries(Z_LAYERS).forEach(([key, value]) => {
    const cssVar = `--z-${key.toLowerCase().replace(/_/g, "-")}`;
    root.style.setProperty(cssVar, String(value));
  });
}

/**
 * Check if an element is currently obscured by another element.
 * Used by the stealth system to detect unexpected occlusion.
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
 * Force an element to always be the topmost in the DOM
 * by moving it to document.body as the last child.
 */
export function hoistToBody(element: HTMLElement): void {
  if (element.parentElement !== document.body) {
    document.body.appendChild(element);
  } else if (element !== document.body.lastElementChild) {
    document.body.appendChild(element); // re-append to move to end
  }
}
