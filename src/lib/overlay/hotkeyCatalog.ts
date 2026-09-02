export type OverlayHotkeyGroup =
  | "visibility"
  | "hints"
  | "actions"
  | "session"
  | "layout";

export interface OverlayHotkeyCatalogEntry {
  keys: string[];
  label: string;
  description: string;
  group: OverlayHotkeyGroup;
}

/**
 * Canonical overlay shortcut map for help, settings, and the toolbar cheat sheet.
 * Combos must match OverlayKeyboardHandler + DEFAULT_HOTKEYS (S = scroll, T = discrete UI).
 */
export const OVERLAY_HOTKEY_CATALOG: OverlayHotkeyCatalogEntry[] = [
  {
    keys: ["ctrl", "shift", "u"],
    label: "Toggle overlay",
    description: "Show or hide the Career Pilot overlay",
    group: "visibility",
  },
  {
    keys: ["ctrl", "shift", "x"],
    label: "Toggle overlay (alt)",
    description: "Same as Ctrl+Shift+U — show or hide overlay",
    group: "visibility",
  },
  {
    keys: ["ctrl", "shift", "k"],
    label: "Minimize overlay",
    description: "Minimize overlay to title bar",
    group: "visibility",
  },
  {
    keys: ["ctrl", "shift", "t"],
    label: "Discrete UI",
    description: "Lower overlay opacity until hover",
    group: "visibility",
  },
  {
    keys: ["ctrl", "shift", "a"],
    label: "Generate answer",
    description: "Trigger AI answer for current question",
    group: "hints",
  },
  {
    keys: ["ctrl", "shift", "y"],
    label: "Cycle hint style",
    description: "Full Answer → Short Hints → Keywords",
    group: "hints",
  },
  {
    keys: ["ctrl", "shift", "s"],
    label: "Scroll up",
    description: "Scroll the answer panel upward",
    group: "hints",
  },
  {
    keys: ["ctrl", "shift", "d"],
    label: "Scroll down",
    description: "Scroll the answer panel downward",
    group: "hints",
  },
  {
    keys: ["ctrl", "shift", "q"],
    label: "Clear answer",
    description: "Clear the current hint / answer text",
    group: "hints",
  },
  {
    keys: ["ctrl", "shift", "c"],
    label: "Screenshot + analyse",
    description: "Screenshot a coding problem & get AI analysis",
    group: "actions",
  },
  {
    keys: ["ctrl", "shift", "p"],
    label: "Calm steps",
    description: "Show grounding coaching prompts",
    group: "actions",
  },
  {
    keys: ["ctrl", "shift", "m"],
    label: "Mute / unmute",
    description: "Toggle microphone during a live session",
    group: "session",
  },
  {
    keys: ["ctrl", "shift", "/"],
    label: "Hotkey help",
    description: "Show this keyboard shortcut reference",
    group: "session",
  },
  {
    keys: ["ctrl", "1-4"],
    label: "Dock to corner",
    description: "Snap overlay to top-left / top-right / bottom corners",
    group: "layout",
  },
  {
    keys: ["escape"],
    label: "Dismiss",
    description: "Clear current hint or close panel",
    group: "layout",
  },
  {
    keys: ["ctrl", "shift", "escape"],
    label: "Emergency hide",
    description: "Hide overlay and reset session state",
    group: "layout",
  },
];
