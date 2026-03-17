import { captureAndAnalyseCodingProblem } from "@/lib/audio/screenshotCapture";
import { useOverlayStore } from "@/store/overlayStore";
import { useSessionStore } from "@/store/sessionStore";

// ─────────────────────────────────────────────────────────────────
// Global Hotkey Manager
// All keyboard shortcuts for the Live Co-pilot overlay.
// Uses capture-phase listeners so they fire even inside iframes.
// ─────────────────────────────────────────────────────────────────

export interface HotkeyDefinition {
  id:          string;
  label:       string;
  description: string;
  keys:        string[];          // e.g. ["ctrl", "shift", "h"]
  category:    "overlay" | "session" | "hint" | "coding";
  action:      () => void;
  isEnabled:   () => boolean;
  showInHelp:  boolean;
}

// ─────────────────────────────────────────────────────────────────
// Hotkey definitions
// ─────────────────────────────────────────────────────────────────

export function buildHotkeyDefinitions(): HotkeyDefinition[] {
  return [
    // ── Overlay visibility ─────────────────────────────────
    {
      id:          "toggle_overlay",
      label:       "Toggle Overlay",
      description: "Show or hide the ConfideQ overlay",
      keys:        ["ctrl", "shift", "h"],
      category:    "overlay",
      action:      () => useOverlayStore.getState().toggleOverlay(),
      isEnabled:   () => true,
      showInHelp:  true,
    },
    {
      id:          "toggle_stealth",
      label:       "Toggle Stealth Mode",
      description: "Switch overlay to minimal stealth view",
      keys:        ["ctrl", "shift", "s"],
      category:    "overlay",
      action:      () => {
        const { is_stealth_mode, setStealthMode } = useOverlayStore.getState();
        setStealthMode(!is_stealth_mode);
      },
      isEnabled:   () => useOverlayStore.getState().is_visible,
      showInHelp:  true,
    },

    // ── Hint style cycling ─────────────────────────────────
    {
      id:          "cycle_hint_style",
      label:       "Cycle Hint Style",
      description: "Switch between Full Answer → Short Hints → Keywords",
      keys:        ["ctrl", "shift", "y"],
      category:    "hint",
      action:      () => useOverlayStore.getState().cycleHintStyle(),
      isEnabled:   () => useOverlayStore.getState().is_visible,
      showInHelp:  true,
    },

    // ── Coding screenshot ──────────────────────────────────
    {
      id:          "capture_coding_problem",
      label:       "Capture Coding Problem",
      description: "Screenshot current problem and get AI analysis",
      keys:        ["ctrl", "shift", "c"],
      category:    "coding",
      action:      () => captureAndAnalyseCodingProblem(),
      isEnabled:   () =>
        useSessionStore.getState().status === "in_progress" &&
        useOverlayStore.getState().is_visible,
      showInHelp:  true,
    },

    // ── Panic ──────────────────────────────────────────────
    {
      id:          "trigger_panic",
      label:       "Panic Button",
      description: "Show immediate calming steps",
      keys:        ["ctrl", "shift", "p"],
      category:    "session",
      action:      () => {
        const result = useSessionStore.getState().triggerPanic();
        useOverlayStore.getState().showPanic(result);
      },
      isEnabled:   () => useSessionStore.getState().status === "in_progress",
      showInHelp:  true,
    },

    // ── Session control ────────────────────────────────────
    {
      id:          "end_session",
      label:       "End Session",
      description: "Mark session as complete and go to scorecard",
      keys:        ["ctrl", "shift", "e"],
      category:    "session",
      action:      () => useSessionStore.getState().setStatus("completed"),
      isEnabled:   () => useSessionStore.getState().status === "in_progress",
      showInHelp:  false,           // Hidden — prevent accidental triggers
    },

    // ── Clear hint ─────────────────────────────────────────
    {
      id:          "clear_hint",
      label:       "Clear Hint",
      description: "Clear current hint from overlay",
      keys:        ["escape"],
      category:    "hint",
      action:      () => {
        const store = useOverlayStore.getState();
        if (store.is_panic_visible) {
          store.hidePanic();
        } else {
          store.clearHint();
        }
      },
      isEnabled:   () => useOverlayStore.getState().is_visible,
      showInHelp:  true,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────
// Hotkey Manager class
// ─────────────────────────────────────────────────────────────────

export class HotkeyManager {
  private definitions: HotkeyDefinition[];
  private boundHandler: (e: KeyboardEvent) => void;
  private isActive = false;

  constructor() {
    this.definitions = buildHotkeyDefinitions();
    this.boundHandler = this.handleKeyDown.bind(this);
  }

  // ── Register all hotkeys ──────────────────────────────────────

  register(): void {
    if (this.isActive) return;
    document.addEventListener("keydown", this.boundHandler, { capture: true });
    this.isActive = true;
  }

  // ── Unregister all hotkeys ────────────────────────────────────

  unregister(): void {
    document.removeEventListener("keydown", this.boundHandler, { capture: true });
    this.isActive = false;
  }

  // ── Key event handler ─────────────────────────────────────────

  private handleKeyDown(e: KeyboardEvent): void {
    // Never intercept inside text inputs / editable content
    const target = e.target as HTMLElement;
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable
    ) {
      // Exception: Escape always works everywhere
      if (e.key !== "Escape") return;
    }

    const pressed = buildPressedSet(e);

    for (const hotkey of this.definitions) {
      if (!hotkey.isEnabled()) continue;
      if (matchesHotkey(pressed, hotkey.keys)) {
        e.preventDefault();
        e.stopPropagation();
        hotkey.action();
        return;
      }
    }
  }

  // ── Get help definitions ──────────────────────────────────────

  getHelpItems(): Array<{ label: string; keys: string; description: string }> {
    return this.definitions
      .filter((d) => d.showInHelp)
      .map((d) => ({
        label:       d.label,
        keys:        formatHotkeyLabel(d.keys),
        description: d.description,
      }));
  }
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function buildPressedSet(e: KeyboardEvent): Set<string> {
  const set = new Set<string>();
  if (e.ctrlKey || e.metaKey) set.add("ctrl");
  if (e.shiftKey) set.add("shift");
  if (e.altKey)   set.add("alt");
  set.add(e.key.toLowerCase());
  return set;
}

function matchesHotkey(pressed: Set<string>, required: string[]): boolean {
  if (pressed.size !== required.length) return false;
  return required.every((k) => pressed.has(k.toLowerCase()));
}

export function formatHotkeyLabel(keys: string[]): string {
  return keys
    .map((k) => {
      switch (k) {
        case "ctrl":   return "⌃";
        case "shift":  return "⇧";
        case "alt":    return "⌥";
        case "escape": return "Esc";
        default:       return k.toUpperCase();
      }
    })
    .join(" ");
}

// ─────────────────────────────────────────────────────────────────
// Singleton instance — used across the app
// ─────────────────────────────────────────────────────────────────

export const hotkeyManager = new HotkeyManager();
