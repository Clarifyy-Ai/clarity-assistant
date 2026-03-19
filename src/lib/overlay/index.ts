// ─── Hotkeys ──────────────────────────────────────────────────────────────────
export {
  registerHotkey,
  unregisterHotkey,
  clearHotkeys,
  parseHotkey,
  OVERLAY_HOTKEYS,
} from "./hotkeys";

export type { HotkeyBinding, HotkeyAction } from "./hotkeys";

// ─── Overlay Compositor ───────────────────────────────────────────────────────
export {
  OverlayCompositor,
  createOverlayCompositor,
} from "./overlayCompositor";

export type {
  CompositorLayer,
  CompositorConfig,
} from "./overlayCompositor";

// ─── Screen Capture Evasion ───────────────────────────────────────────────────
export {
  ScreenCaptureEvasion,
  createScreenCaptureEvasion,
  isScreenBeingCaptured,
} from "./screenCaptureEvasion";

export type {
  CaptureEvasionConfig,
  CaptureDetectionResult,
} from "./screenCaptureEvasion";

// ─── Stealth Mouse ────────────────────────────────────────────────────────────
export {
  StealthMouse,
  createStealthMouse,
} from "./stealthMouse";

export type { StealthMouseConfig } from "./stealthMouse";

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
