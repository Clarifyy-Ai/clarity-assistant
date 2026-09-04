// ─── Document Picture-in-Picture ──────────────────────────────────────────────
export { useDocumentPiP } from "./useDocumentPiP";

// ─── Hotkeys ──────────────────────────────────────────────────────────────────
export {
  buildHotkeyDefinitions,
  HotkeyManager,
  formatHotkeyLabel,
} from "./hotkeys";

export type { HotkeyDefinition } from "./hotkeys";

// ─── Overlay Compositor ───────────────────────────────────────────────────────
export {
  composeHint,
  splitInlineCode,
  splitInlineRich,
  stripMarkdownEmphasis,
  highlightSTARComponents,
  truncateForStealth,
  calculateOverlaySize,
  StreamingTextAssembler,
  DEFAULT_SIZE_CONFIG,
} from "./overlayCompositor";

export type {
  ComposedHint,
  ComposedLine,
  InlinePart,
  OverlaySizeConfig,
} from "./overlayCompositor";

// ─── Screen Capture Evasion ───────────────────────────────────────────────────
export {
  STEALTH_ATTR,
  CAPTURE_ATTR,
  CAPTURE_EXCLUSION_DISCLAIMER,
  CAPTURE_EXCLUSION_STATUS_LABEL,
  applyStealthToElement,
  removeStealthFromElement,
  isStealthActive,
  toggleStealthOnElement,
  getSupportInfo,
  getCaptureExclusionStatus,
  patchGetDisplayMedia,
  enableContentProtection,
  onCaptureStateChange,
  isElectron,
} from "./screenCaptureEvasion";

export type {
  SupportLevel,
  SupportInfo,
  CaptureExclusionStatus,
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

export type {
  DragState,
  SnapEdge as StealthSnapEdge,
  SnapConfig,
} from "./stealthMouse";

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

// ─── Z-Index Manager ──────────────────────────────────────────────────────────
export {
  ZIndexManager,
  getZIndexManager,
  Z_LAYERS,
  LAYER_GROUPS,
  z,
  getOverlayPortalZIndex,
  injectZIndexVariables,
  isObscured,
  hoistToBody,
} from "./zIndexManager";

export type { ZLayer, ZValue, OverlayStackContext } from "./zIndexManager";
