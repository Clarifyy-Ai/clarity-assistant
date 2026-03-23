// ─── Document Picture-in-Picture ──────────────────────────────────────────────
export { useDocumentPiP } from "./useDocumentPiP";

// ─── Hotkeys ──────────────────────────────────────────────────────────────────
export {
  buildHotkeyDefinitions,
  HotkeyManager,
  formatHotkeyLabel,
  hotkeyManager,
} from "./hotkeys";

export type { HotkeyDefinition } from "./hotkeys";

// ─── Overlay Compositor ───────────────────────────────────────────────────────
export {
  composeHint,
  splitInlineCode,
  highlightSTARComponents,
  truncateForStealth,
  calculateOverlaySize,
  StreamingTextAssembler,
  DEFAULT_SIZE_CONFIG,
} from "./overlayCompositor";

export type {
  ComposedHint,
  ComposedLine,
  OverlaySizeConfig,
} from "./overlayCompositor";

// ─── Screen Capture Evasion ───────────────────────────────────────────────────
export {
  applyStealthToElement,
  removeStealthFromElement,
  isStealthActive,
} from "./screenCaptureEvasion";

// ─── Stealth Mouse ────────────────────────────────────────────────────────────
export {
  createDragHandler,
  createTouchDragHandler,
  computeSnapPosition,
  getSnapEdge,
  getProctorSafePosition,
  getDefaultPosition,
} from "./stealthMouse";

export type { DragState, SnapEdge as StealthSnapEdge, SnapConfig } from "./stealthMouse";

// ─── Window Manager ───────────────────────────────────────────────────────────
export {
  WindowManager,
  createWindowManager,
  getGlobalWindowManager,
} from "./windowManager";

export type {
  WindowState,
  WindowBounds,
  WindowAnchor,
  SnapEdge,
  WindowManagerConfig,
  ViewportInfo,
} from "./windowManager";

// ─── Z-Index Manager ─────────────────────────────────────────────────────────
export {
  ZIndexManager,
  getZIndexManager,
  Z_LAYERS,
  LAYER_GROUPS,
  z,
  injectZIndexVariables,
  isObscured,
  hoistToBody,
} from "./zIndexManager";

export type { ZLayer, ZValue } from "./zIndexManager";
