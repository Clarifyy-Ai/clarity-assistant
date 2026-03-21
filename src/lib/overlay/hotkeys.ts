import { captureAndAnalyseCodingProblem } from "@/lib/audio/screenshotCapture";
import { useOverlayStore } from "@/store/overlayStore";
import { useUIStore } from "@/store/uiStore";
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
      description: "Show or hide the Clarify AI overlay",
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
        const next = !is_stealth_mode;
        setStealthMode(next);
        useUIStore.getState().setStealthMode(next);
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
        useSessionStore.getState().status === "active" &&
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
      isEnabled:   () => useSessionStore.getState().status === "active",
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
      isEnabled:   () => useSessionStore.getState().status === "active",
      showInHelp:  false, // Hidden — prevent accidental triggers
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
    // Capture phase: useful for iframes and early interception
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
    // Never intercept while typing (except Escape, which should always work)
    const target = e.target as HTMLElement | null;
    const tag = (target?.tagName || "").toUpperCase();
    const isEditable =
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      (target?.isContentEditable ?? false);

    if (isEditable && e.key !== "Escape") return;

    // Build a normalized set of pressed keys
    const pressed = buildPressedSet(e);

    for (const hotkey of this.definitions) {
      if (!hotkey.isEnabled()) continue;
      if (matchesHotkey(pressed, hotkey.keys)) {
        e.preventDefault();
        e.stopPropagation();
        try {
          hotkey.action();
        } catch (err) {
          // Avoid breaking the global handler on action errors
          // eslint-disable-next-line no-console
          console.error(`[HotkeyManager:${hotkey.id}] action failed`, err);
        }
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

/**
 * Normalizes platform: treats Cmd (macOS) as "ctrl" so definitions like
 * ["ctrl","shift","h"] work on both Win/Linux (Ctrl+Shift+H) and macOS (⌘+Shift+H).
 */
function buildPressedSet(e: KeyboardEvent): Set<string> {
  const set = new Set<string>();
  if (e.ctrlKey || e.metaKey) set.add("ctrl");
  if (e.shiftKey) set.add("shift");
  if (e.altKey)   set.add("alt");

  // Normalize the primary key (letter/function/etc.)
  // Note: e.key already respects layout (e.g. 'h'), and we keep lower-case.
  set.add((e.key || "").toLowerCase());
  return set;
}

/**
 * Exact-match helper:
 * - Requires the same number of keys as the definition
 * - Requires every defined key be present
 * This prevents "extra" modifiers from triggering the shortcut.
 */
function matchesHotkey(pressed: Set<string>, required: string[]): boolean {
  if (pressed.size !== required.length) return false;
  return required.every((k) => pressed.has(k.toLowerCase()));
}

export function formatHotkeyLabel(keys: string[]): string {
  return keys
    .map((k) => {
      switch (k.toLowerCase()) {
        case "ctrl":   return "⌃";  // (⌘ on mac also maps to ctrl here)
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
