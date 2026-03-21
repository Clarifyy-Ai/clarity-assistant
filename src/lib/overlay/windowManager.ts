// ─────────────────────────────────────────────────────────────────────────────
// windowManager.ts — Overlay window lifecycle: position, size, visibility,
// bounds clamping, edge snapping, multi-monitor awareness, and persistence.
// This is the spatial brain of the stealth overlay system.
// ─────────────────────────────────────────────────────────────────────────────

import { OverlayError, ErrorCode } from "@/lib/errors";

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY           = "clarify:overlay:window";
const SNAP_THRESHOLD_PX     = 20;
const MIN_WIDTH             = 280;
const MIN_HEIGHT            = 180;
const MAX_WIDTH_RATIO       = 0.6;   // max 60% of viewport
const MAX_HEIGHT_RATIO      = 0.85;
const DEFAULT_OPACITY       = 0.92;
const EDGE_MARGIN_PX        = 8;     // gap from viewport edges when snapped

// ─── Types ────────────────────────────────────────────────────────────────────

export type SnapEdge = "none" | "left" | "right" | "top" | "bottom"
  | "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type WindowAnchor =
  | "top-left" | "top-center" | "top-right"
  | "middle-left" | "middle-right"
  | "bottom-left" | "bottom-center" | "bottom-right";

export interface WindowBounds {
  x:      number;
  y:      number;
  width:  number;
  height: number;
}

export interface WindowState {
  bounds:       WindowBounds;
  visible:      boolean;
  opacity:      number;
  snapEdge:     SnapEdge;
  minimized:    boolean;
  anchor:       WindowAnchor;
  pinned:       boolean;     // stays on top even when focus lost
  locked:       boolean;     // position locked — can't be dragged
}

export interface WindowManagerConfig {
  initialBounds?:   Partial<WindowBounds>;
  initialAnchor?:   WindowAnchor;
  persistPosition?: boolean;
  onStateChange?:   (state: WindowState) => void;
  onVisibilityChange?: (visible: boolean) => void;
  onBoundsChange?:  (bounds: WindowBounds) => void;
}

export interface ViewportInfo {
  width:   number;
  height:  number;
  scrollX: number;
  scrollY: number;
}

// ─── Viewport Helper ──────────────────────────────────────────────────────────

function getViewport(): ViewportInfo {
  return {
    width:   window.innerWidth,
    height:  window.innerHeight,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  };
}

// ─── Anchor → Initial Position ────────────────────────────────────────────────

function boundsFromAnchor(
  anchor: WindowAnchor,
  width: number,
  height: number,
  vp: ViewportInfo
): { x: number; y: number } {
  const m = EDGE_MARGIN_PX;

  const positions: Record<WindowAnchor, { x: number; y: number }> = {
    "top-left":       { x: m,                              y: m },
    "top-center":     { x: (vp.width - width) / 2,         y: m },
    "top-right":      { x: vp.width - width - m,            y: m },
    "middle-left":    { x: m,                              y: (vp.height - height) / 2 },
    "middle-right":   { x: vp.width - width - m,            y: (vp.height - height) / 2 },
    "bottom-left":    { x: m,                              y: vp.height - height - m },
    "bottom-center":  { x: (vp.width - width) / 2,         y: vp.height - height - m },
    "bottom-right":   { x: vp.width - width - m,            y: vp.height - height - m },
  };

  return positions[anchor];
}

// ─── Bounds Clamper ───────────────────────────────────────────────────────────

function clampBounds(bounds: WindowBounds, vp: ViewportInfo): WindowBounds {
  const maxW = Math.floor(vp.width  * MAX_WIDTH_RATIO);
  const maxH = Math.floor(vp.height * MAX_HEIGHT_RATIO);

  const width  = Math.max(MIN_WIDTH,  Math.min(maxW, bounds.width));
  const height = Math.max(MIN_HEIGHT, Math.min(maxH, bounds.height));
  const x      = Math.max(0, Math.min(vp.width  - width,  bounds.x));
  const y      = Math.max(0, Math.min(vp.height - height, bounds.y));

  return { x, y, width, height };
}

// ─── Snap Detector ────────────────────────────────────────────────────────────

function detectSnapEdge(bounds: WindowBounds, vp: ViewportInfo): SnapEdge {
  const t = SNAP_THRESHOLD_PX;
  const nearLeft   = bounds.x <= t;
  const nearRight  = bounds.x + bounds.width  >= vp.width  - t;
  const nearTop    = bounds.y <= t;
  const nearBottom = bounds.y + bounds.height >= vp.height - t;

  if (nearTop    && nearLeft)  return "top-left";
  if (nearTop    && nearRight) return "top-right";
  if (nearBottom && nearLeft)  return "bottom-left";
  if (nearBottom && nearRight) return "bottom-right";
  if (nearLeft)                return "left";
  if (nearRight)               return "right";
  if (nearTop)                 return "top";
  if (nearBottom)              return "bottom";
  return "none";
}

// ─── Snap Applier ─────────────────────────────────────────────────────────────

function applySnap(bounds: WindowBounds, edge: SnapEdge, vp: ViewportInfo): WindowBounds {
  const m = EDGE_MARGIN_PX;
  let { x, y, width, height } = bounds;

  switch (edge) {
    case "left":         x = m; break;
    case "right":        x = vp.width  - width  - m; break;
    case "top":          y = m; break;
    case "bottom":       y = vp.height - height - m; break;
    case "top-left":     x = m; y = m; break;
    case "top-right":    x = vp.width  - width  - m; y = m; break;
    case "bottom-left":  x = m; y = vp.height - height - m; break;
    case "bottom-right": x = vp.width  - width  - m; y = vp.height - height - m; break;
    default: break;
  }

  return { x, y, width, height };
}

// ─── WindowManager Class ──────────────────────────────────────────────────────

export class WindowManager {
  private state: WindowState;
  private config: Required<WindowManagerConfig>;
  private resizeObserver: ResizeObserver | null = null;
  private isDragging  = false;
  private isResizing  = false;
  private dragOffset  = { x: 0, y: 0 };

  constructor(config: WindowManagerConfig = {}) {
    this.config = {
      initialBounds:       config.initialBounds       ?? {},
      initialAnchor:       config.initialAnchor       ?? "bottom-right",
      persistPosition:     config.persistPosition     ?? true,
      onStateChange:       config.onStateChange       ?? (() => {}),
      onVisibilityChange:  config.onVisibilityChange  ?? (() => {}),
      onBoundsChange:      config.onBoundsChange      ?? (() => {}),
    };

    this.state = this.buildInitialState();
    this.attachViewportListener();
  }

  // ── Initial State ─────────────────────────────────────────────────────────
  private buildInitialState(): WindowState {
    // Try persisted state first
    if (this.config.persistPosition) {
      const persisted = this.loadPersistedState();
      if (persisted) return persisted;
    }

    const vp     = getViewport();
    const width  = this.config.initialBounds?.width  ?? 380;
    const height = this.config.initialBounds?.height ?? 480;
    const pos    = boundsFromAnchor(this.config.initialAnchor, width, height, vp);

    const bounds = clampBounds(
      {
        x:      this.config.initialBounds?.x ?? pos.x,
        y:      this.config.initialBounds?.y ?? pos.y,
        width,
        height,
      },
      vp
    );

    return {
      bounds,
      visible:   true,
      opacity:   DEFAULT_OPACITY,
      snapEdge:  detectSnapEdge(bounds, vp),
      minimized: false,
      anchor:    this.config.initialAnchor,
      pinned:    false,
      locked:    false,
    };
  }

  // ── State Persistence ─────────────────────────────────────────────────────
  private loadPersistedState(): WindowState | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as WindowState;
      // Re-clamp to current viewport in case screen size changed
      parsed.bounds = clampBounds(parsed.bounds, getViewport());
      return parsed;
    } catch {
      return null;
    }
  }

  private persistState(): void {
    if (!this.config.persistPosition) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {}
  }

  // ── State Updater ─────────────────────────────────────────────────────────
  private setState(partial: Partial<WindowState>): void {
    this.state = { ...this.state, ...partial };
    this.persistState();
    this.config.onStateChange(this.state);
  }

  // ── Visibility ────────────────────────────────────────────────────────────

  show(): void {
    this.setState({ visible: true, minimized: false });
    this.config.onVisibilityChange(true);
  }

  hide(): void {
    this.setState({ visible: false });
    this.config.onVisibilityChange(false);
  }

  toggle(): void {
    this.state.visible ? this.hide() : this.show();
  }

  minimize(): void {
    this.setState({ minimized: true });
  }

  restore(): void {
    this.setState({ minimized: false, visible: true });
  }

  // ── Position ──────────────────────────────────────────────────────────────

  moveTo(x: number, y: number): void {
    if (this.state.locked) return;

    const vp = getViewport();
    const bounds = clampBounds(
      { ...this.state.bounds, x, y },
      vp
    );
    const snapEdge = detectSnapEdge(bounds, vp);
    const snapped  = applySnap(bounds, snapEdge, vp);

    this.setState({ bounds: snapped, snapEdge });
    this.config.onBoundsChange(snapped);
  }

  resize(width: number, height: number): void {
    const vp     = getViewport();
    const bounds = clampBounds({ ...this.state.bounds, width, height }, vp);
    this.setState({ bounds });
    this.config.onBoundsChange(bounds);
  }

  snapTo(edge: SnapEdge): void {
    const vp      = getViewport();
    const snapped = applySnap(this.state.bounds, edge, vp);
    this.setState({ bounds: snapped, snapEdge: edge });
    this.config.onBoundsChange(snapped);
  }

  centerIn(anchor: WindowAnchor): void {
    const vp  = getViewport();
    const pos = boundsFromAnchor(
      anchor,
      this.state.bounds.width,
      this.state.bounds.height,
      vp
    );
    this.moveTo(pos.x, pos.y);
    this.setState({ anchor });
  }

  // ── Opacity ───────────────────────────────────────────────────────────────

  setOpacity(opacity: number): void {
    this.setState({ opacity: Math.max(0.1, Math.min(1, opacity)) });
  }

  // ── Lock / Pin ────────────────────────────────────────────────────────────

  lock(): void   { this.setState({ locked: true }); }
  unlock(): void { this.setState({ locked: false }); }
  pin(): void    { this.setState({ pinned: true }); }
  unpin(): void  { this.setState({ pinned: false }); }

  // ── Drag Handlers (attach to overlay element) ────────────────────────────

  onDragStart(clientX: number, clientY: number): void {
    if (this.state.locked) return;
    this.isDragging = true;
    this.dragOffset = {
      x: clientX - this.state.bounds.x,
      y: clientY - this.state.bounds.y,
    };
  }

  onDragMove(clientX: number, clientY: number): void {
    if (!this.isDragging) return;
    this.moveTo(
      clientX - this.dragOffset.x,
      clientY - this.dragOffset.y
    );
  }

  onDragEnd(): void {
    this.isDragging = false;
  }

  // ── Viewport Resize Handling ──────────────────────────────────────────────
  private attachViewportListener(): void {
    const handler = () => {
      const vp      = getViewport();
      const clamped = clampBounds(this.state.bounds, vp);
      const snap    = detectSnapEdge(clamped, vp);
      const snapped = applySnap(clamped, snap, vp);
      this.setState({ bounds: snapped, snapEdge: snap });
    };

    window.addEventListener("resize", handler, { passive: true });
  }

  // ── Getters ───────────────────────────────────────────────────────────────

  getState():  Readonly<WindowState>  { return { ...this.state }; }
  getBounds(): Readonly<WindowBounds> { return { ...this.state.bounds }; }
  isVisible(): boolean                { return this.state.visible; }
  isPinned():  boolean                { return this.state.pinned; }
  isLocked():  boolean                { return this.state.locked; }

  // ── CSS Style Object (apply directly to overlay element) ─────────────────

  getCSSStyles(): React.CSSProperties {
    const { bounds, visible, opacity, minimized } = this.state;
    return {
      position:   "fixed",
      left:       `${bounds.x}px`,
      top:        `${bounds.y}px`,
      width:      `${bounds.width}px`,
      height:     minimized ? "44px" : `${bounds.height}px`,
      opacity:    visible ? opacity : 0,
      visibility: visible ? "visible" : "hidden",
      overflow:   minimized ? "hidden" : "auto",
      transition: "opacity 0.15s ease, visibility 0.15s ease, height 0.2s ease",
      willChange: "transform, opacity",
      userSelect: "none",
    };
  }

  // ── Reset ─────────────────────────────────────────────────────────────────

  reset(): void {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    this.state = this.buildInitialState();
    this.config.onStateChange(this.state);
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createWindowManager(config?: WindowManagerConfig): WindowManager {
  return new WindowManager(config);
}

// ─── Singleton for app-wide overlay window ────────────────────────────────────
let _globalWindowManager: WindowManager | null = null;

export function getGlobalWindowManager(): WindowManager {
  if (!_globalWindowManager) {
    _globalWindowManager = new WindowManager({
      initialAnchor:   "bottom-right",
      persistPosition: true,
    });
  }
  return _globalWindowManager;
}
