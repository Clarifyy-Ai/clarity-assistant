// ─────────────────────────────────────────────────────────────────────────────
// hotkeys.ts — Global keyboard shortcut definitions.
// All hotkeys in the app are defined here and referenced by string key.
// Never hardcode key combos directly in components.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HotkeyDefinition {
  keys:        string;        // display string e.g. "Ctrl+Shift+H"
  action:      string;        // machine-readable action ID
  description: string;        // human-readable description
  category:    HotkeyCategory;
  global?:     boolean;       // fires even when input is focused
  mac?:        string;        // macOS variant display
}

export type HotkeyCategory =
  | "overlay"
  | "session"
  | "ai"
  | "navigation"
  | "audio"
  | "general";

// ─── Default Hotkeys ──────────────────────────────────────────────────────────

export const DEFAULT_HOTKEYS: Record<string, HotkeyDefinition> = {

  // ── Overlay ─────────────────────────────────────────────────────────────────
  TOGGLE_OVERLAY: {
    keys:        "Ctrl+Shift+H",
    mac:         "⌘+Shift+H",
    action:      "overlay:toggle",
    description: "Show / hide the overlay window",
    category:    "overlay",
    global:      true,
  },
  /** T-0293/T-0307/T-0308 — alias for overlay toggle (also registered globally in Electron) */
  TOGGLE_OVERLAY_ALIAS: {
    keys:        "Ctrl+Shift+C",
    mac:         "⌘+Shift+C",
    action:      "overlay:toggle",
    description: "Show / hide the overlay window (alternate shortcut)",
    category:    "overlay",
    global:      true,
  },
  PANIC_CALM: {
    keys:        "Ctrl+Shift+P",
    mac:         "⌘+Shift+P",
    action:      "overlay:panic_calm",
    description: "Show calm coaching steps (does not hide overlay)",
    category:    "overlay",
    global:      true,
  },
  MINIMIZE_OVERLAY: {
    keys:        "Ctrl+Shift+J",
    mac:         "⌘+Shift+J",
    action:      "overlay:minimize",
    description: "Minimize overlay to title bar",
    category:    "overlay",
    global:      true,
  },
  DOCK_TOP_LEFT: {
    keys:        "Ctrl+1",
    mac:         "⌘+1",
    action:      "overlay:dock_top_left",
    description: "Dock overlay to top-left corner",
    category:    "overlay",
  },
  DOCK_TOP_RIGHT: {
    keys:        "Ctrl+2",
    mac:         "⌘+2",
    action:      "overlay:dock_top_right",
    description: "Dock overlay to top-right corner",
    category:    "overlay",
  },
  DOCK_BOTTOM_LEFT: {
    keys:        "Ctrl+3",
    mac:         "⌘+3",
    action:      "overlay:dock_bottom_left",
    description: "Dock overlay to bottom-left corner",
    category:    "overlay",
  },
  DOCK_BOTTOM_RIGHT: {
    keys:        "Ctrl+4",
    mac:         "⌘+4",
    action:      "overlay:dock_bottom_right",
    description: "Dock overlay to bottom-right corner",
    category:    "overlay",
  },
  INCREASE_OPACITY: {
    keys:        "Ctrl+Shift+]",
    mac:         "⌘+Shift+]",
    action:      "overlay:opacity_up",
    description: "Increase overlay opacity",
    category:    "overlay",
  },
  DECREASE_OPACITY: {
    keys:        "Ctrl+Shift+[",
    mac:         "⌘+Shift+[",
    action:      "overlay:opacity_down",
    description: "Decrease overlay opacity",
    category:    "overlay",
  },
  SCROLL_ANSWER_UP: {
    keys:        "Ctrl+Shift+S",
    mac:         "⌘+Shift+S",
    action:      "overlay:scroll_up",
    description: "Scroll answer panel up",
    category:    "overlay",
  },
  SCROLL_ANSWER_DOWN: {
    keys:        "Ctrl+Shift+D",
    mac:         "⌘+Shift+D",
    action:      "overlay:scroll_down",
    description: "Scroll answer panel down",
    category:    "overlay",
  },
  CLEAR_ANSWER: {
    keys:        "Ctrl+Shift+Q",
    mac:         "⌘+Shift+Q",
    action:      "overlay:clear_answer",
    description: "Clear current answer / hint",
    category:    "overlay",
  },

  // ── Practice Session ─────────────────────────────────────────────────────────────
  // T-0295/T-0305: click-through stealth removed for compliance — discrete UI is opacity-only.
  TOGGLE_STEALTH: {
    keys:        "Ctrl+Shift+T",
    mac:         "⌘+Shift+T",
    action:      "overlay:toggle_stealth",
    description: "Toggle discrete UI mode (lower opacity until hover)",
    category:    "session",
  },
  END_SESSION: {
    keys:        "Ctrl+Shift+E",
    mac:         "⌘+Shift+E",
    action:      "session:end",
    description: "End the current session",
    category:    "session",
  },
  NEXT_QUESTION: {
    keys:        "Ctrl+Shift+N",
    mac:         "⌘+Shift+N",
    action:      "session:next_question",
    description: "Move to next question",
    category:    "session",
  },
  PREVIOUS_QUESTION: {
    keys:        "Ctrl+Shift+B",
    mac:         "⌘+Shift+B",
    action:      "session:prev_question",
    description: "Go back to previous question",
    category:    "session",
  },

  // ── AI Actions ───────────────────────────────────────────────────────────────
  GENERATE_ANSWER: {
    keys:        "Ctrl+Enter",
    mac:         "⌘+Enter",
    action:      "ai:generate_answer",
    description: "Generate AI answer for current question",
    category:    "ai",
    global:      false,
  },
  GENERATE_HINT: {
    keys:        "Ctrl+Shift+I",
    mac:         "⌘+Shift+I",
    action:      "ai:generate_hint",
    description: "Get a quick AI hint",
    category:    "ai",
  },
  REPHRASE_ANSWER: {
    keys:        "Ctrl+Shift+R",
    mac:         "⌘+Shift+R",
    action:      "ai:rephrase",
    description: "Rephrase the current answer",
    category:    "ai",
  },
  CAPTURE_CODING: {
    keys:        "Ctrl+Shift+G",
    mac:         "⌘+Shift+G",
    action:      "ai:capture_coding",
    description: "Capture coding problem screenshot for AI analysis",
    category:    "ai",
  },
  REQUEST_AI_ANSWER: {
    keys:        "Ctrl+Shift+A",
    mac:         "⌘+Shift+A",
    action:      "ai:request_answer",
    description: "Request AI answer (global shortcut in Electron)",
    category:    "ai",
    global:      true,
  },
  CYCLE_HINT_STYLE: {
    keys:        "Ctrl+Shift+Y",
    mac:         "⌘+Shift+Y",
    action:      "ai:cycle_hint_style",
    description: "Cycle hint style (Full → Short → Keywords)",
    category:    "ai",
  },
  CYCLE_MODEL: {
    keys:        "Ctrl+Shift+.",
    mac:         "⌘+Shift+.",
    action:      "ai:cycle_model",
    description: "Cycle through available AI models",
    category:    "ai",
  },

  // ── Audio ────────────────────────────────────────────────────────────────────
  TOGGLE_MIC: {
    keys:        "Ctrl+Shift+M",
    mac:         "⌘+Shift+M",
    action:      "audio:toggle_mic",
    description: "Mute / unmute microphone",
    category:    "audio",
    global:      true,
  },
  TOGGLE_SYSTEM_AUDIO: {
    keys:        "Ctrl+Shift+L",
    mac:         "⌘+Shift+L",
    action:      "audio:toggle_system",
    description: "Toggle system audio capture",
    category:    "audio",
  },

  // ── Navigation ───────────────────────────────────────────────────────────────
  GO_DASHBOARD: {
    keys:        "Ctrl+Shift+D",
    mac:         "⌘+Shift+D",
    action:      "nav:dashboard",
    description: "Go to dashboard",
    category:    "navigation",
  },
  GO_COACH: {
    keys:        "Ctrl+Shift+O",
    mac:         "⌘+Shift+O",
    action:      "nav:coach",
    description: "Open AI coach",
    category:    "navigation",
  },
  GO_ANSWERS: {
    keys:        "Ctrl+Shift+W",
    mac:         "⌘+Shift+W",
    action:      "nav:answers",
    description: "Open answer bank",
    category:    "navigation",
  },
  OPEN_SETTINGS: {
    keys:        "Ctrl+,",
    mac:         "⌘+,",
    action:      "nav:settings",
    description: "Open settings",
    category:    "navigation",
  },

  // ── General ──────────────────────────────────────────────────────────────────
  SEARCH: {
    keys:        "Ctrl+K",
    mac:         "⌘+K",
    action:      "general:search",
    description: "Open global search / command palette",
    category:    "general",
  },
  HELP: {
    keys:        "?",
    action:      "general:help",
    description: "Show keyboard shortcuts",
    category:    "general",
  },
  UNDO: {
    keys:        "Ctrl+Z",
    mac:         "⌘+Z",
    action:      "general:undo",
    description: "Undo last action",
    category:    "general",
  },
} as const;

export type HotkeyId = keyof typeof DEFAULT_HOTKEYS;

// ─── Grouped by Category ──────────────────────────────────────────────────────

export function getHotkeysByCategory(
  category: HotkeyCategory
): HotkeyDefinition[] {
  return Object.values(DEFAULT_HOTKEYS).filter((h) => h.category === category);
}

export function getHotkeyByAction(action: string): HotkeyDefinition | null {
  return Object.values(DEFAULT_HOTKEYS).find((h) => h.action === action) ?? null;
}

// ─── Platform Detection ───────────────────────────────────────────────────────

export function isMac(): boolean {
  return /Mac|iPod|iPhone|iPad/.test(navigator.platform);
}

/**
 * Get the display string for a hotkey, automatically picking
 * the Mac variant when on macOS.
 *
 * @example
 * getHotkeyDisplay(DEFAULT_HOTKEYS.TOGGLE_OVERLAY) → "⌘+Shift+H" (Mac)
 *                                                  → "Ctrl+Shift+H" (Win/Linux)
 */
export function getHotkeyDisplay(hotkey: HotkeyDefinition): string {
  return isMac() && hotkey.mac ? hotkey.mac : hotkey.keys;
}

// ─── All Categories ───────────────────────────────────────────────────────────

export const HOTKEY_CATEGORIES: Record<HotkeyCategory, string> = {
  overlay:    "Overlay Controls",
  session:    "Practice Session",
  ai:         "AI Actions",
  audio:      "Audio Controls",
  navigation: "Navigation",
  general:    "General",
};
