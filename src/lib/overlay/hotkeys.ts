import { AI_CREDIT_COSTS } from "@/lib/constants/creditEconomics";
import { captureAndAnalyseCodingProblem } from "@/lib/audio/screenshotCapture";
import { useOverlayStore } from "@/store/overlayStore";
import { useSessionStore } from "@/store/sessionStore";
import { useAudioStore } from "@/store/audioStore";
import { toggleAppStealthMode } from "@/lib/stealth/stealthActions";
import { eventMatchesKeys } from "@/lib/overlay/hotkeyMatch";

// ─────────────────────────────────────────────────────────────────
// Global Hotkey Manager
// All keyboard shortcuts for the Practice Coach overlay.
// Uses capture-phase listeners so they fire even inside iframes.
//
// T-0295/T-0305: click-through / screen-capture evasion removed for compliance.
// Discrete UI lowers opacity only — overlay stays visible on screen share.
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

// ─── Corner anchor map for dock positions ─────────────────────────

const DOCK_POSITIONS: Array<{
  key: string;
  anchor: import("./windowManager").WindowAnchor;
}> = [
  { key: "1", anchor: "top-left"     },
  { key: "2", anchor: "top-right"    },
  { key: "3", anchor: "bottom-left"  },
  { key: "4", anchor: "bottom-right" },
];

const HINT_SCROLL_STEP_PX = 120;

function getHintScrollContainer(): HTMLElement | null {
  const root = document.getElementById("clarify-overlay-root");
  return root?.querySelector<HTMLElement>(".scroll-container") ?? null;
}

function scrollHintPanel(direction: "up" | "down"): void {
  const el = getHintScrollContainer();
  if (!el) return;
  el.scrollBy({
    top: direction === "up" ? -HINT_SCROLL_STEP_PX : HINT_SCROLL_STEP_PX,
    behavior: "smooth",
  });
}

/** T-0314 — warn when two definitions share the same key combo. */
export function detectHotkeyConflicts(
  definitions: HotkeyDefinition[],
): Array<{ keys: string; ids: string[] }> {
  const byKeys = new Map<string, string[]>();
  for (const def of definitions) {
    const normalized = def.keys.map((k) => k.toLowerCase()).join("+");
    const ids = byKeys.get(normalized) ?? [];
    ids.push(def.id);
    byKeys.set(normalized, ids);
  }
  return [...byKeys.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([keys, ids]) => ({ keys, ids }));
}

// ─────────────────────────────────────────────────────────────────
// Runtime handlers (registered by live overlay pages)
// ─────────────────────────────────────────────────────────────────

let generateAnswerHandler: (() => void) | null = null;

export function setGenerateAnswerHandler(handler: (() => void) | null): void {
  generateAnswerHandler = handler;
}

// ─────────────────────────────────────────────────────────────────
// Hotkey definitions
// ─────────────────────────────────────────────────────────────────

export function buildHotkeyDefinitions(): HotkeyDefinition[] {
  return [
    // ── Overlay visibility ─────────────────────────────────────
    {
      id:          "toggle_overlay",
      label:       "Toggle Overlay",
      description: "Minimize, restore, or show the overlay panel",
      keys:        ["ctrl", "shift", "u"],
      category:    "overlay",
      action:      () => useOverlayStore.getState().toggleMinimize(),
      isEnabled:   () => true,
      showInHelp:  true,
    },
    // Alias for overlay toggle — Ctrl+Shift+L (Y is used for hint style cycle).
    {
      id:          "toggle_overlay_alias",
      label:       "Toggle Overlay (Alt)",
      description: "Same as Ctrl+Shift+U — show / hide overlay",
      keys:        ["ctrl", "shift", "x"],
      category:    "overlay",
      action:      () => useOverlayStore.getState().toggleMinimize(),
      isEnabled:   () => true,
      showInHelp:  true,
    },
    {
      id:          "toggle_stealth",
      label:       "Discrete UI",
      description: "Lower overlay opacity until you hover (still visible on screen share)",
      keys:        ["ctrl", "shift", "f"],
      category:    "overlay",
      action:      toggleAppStealthMode,
      isEnabled:   () => true,
      showInHelp:  true,
    },

    // T-0310/T-0311 — scroll answer panel
    {
      id:          "scroll_answer_up",
      label:       "Scroll Answer Up",
      description: "Scroll the answer panel upward",
      keys:        ["ctrl", "shift", "s"],
      category:    "overlay",
      action:      () => scrollHintPanel("up"),
      isEnabled:   () => useOverlayStore.getState().is_visible,
      showInHelp:  true,
    },
    {
      id:          "scroll_answer_down",
      label:       "Scroll Answer Down",
      description: "Scroll the answer panel downward",
      keys:        ["ctrl", "shift", "d"],
      category:    "overlay",
      action:      () => scrollHintPanel("down"),
      isEnabled:   () => useOverlayStore.getState().is_visible,
      showInHelp:  true,
    },
    // T-0312 — clear answer
    {
      id:          "clear_answer",
      label:       "Clear Answer",
      description: "Clear the current hint / answer text",
      keys:        ["ctrl", "shift", "q"],
      category:    "hint",
      action:      () => useOverlayStore.getState().clearHint(),
      isEnabled:   () => useOverlayStore.getState().is_visible,
      showInHelp:  true,
    },

    // ── Generate AI answer ─────────────────────────────────────
    {
      id:          "generate_answer",
      label:       "Generate Answer",
      description: "Manually trigger AI answer for the current question",
      keys:        ["ctrl", "shift", "a"],
      category:    "hint",
      action:      () => generateAnswerHandler?.(),
      isEnabled:   () =>
        useSessionStore.getState().status === "active" &&
        useOverlayStore.getState().is_visible &&
        !!generateAnswerHandler,
      showInHelp:  true,
    },

    // ── Hint style cycling ─────────────────────────────────────
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

    // ── Coding screenshot ──────────────────────────────────────
    {
      id:          "capture_coding_problem",
      label:       "Capture Coding Problem",
      description: `Screenshot current problem and generate a full answer (${AI_CREDIT_COSTS.screenshot_answer} credits)`,
      keys:        ["ctrl", "shift", "c"],
      category:    "coding",
      action:      () => {
        const handler = useOverlayStore.getState().capture_coding_handler;
        if (handler) {
          handler();
          return;
        }
        captureAndAnalyseCodingProblem();
      },
      isEnabled:   () =>
        useSessionStore.getState().status === "active" &&
        useOverlayStore.getState().is_visible &&
        useOverlayStore.getState().network_color !== "red" &&
        (typeof navigator === "undefined" || navigator.onLine),
      showInHelp:  true,
    },

    // ── Panic ──────────────────────────────────────────────────
    {
      id:          "trigger_panic",
      label:       "Calm steps",
      description: "Show grounding coaching prompts",
      keys:        ["ctrl", "shift", "p"],
      category:    "session",
      action:      () => {
        const result = useSessionStore.getState().triggerPanic();
        useOverlayStore.getState().showPanic(result);
      },
      isEnabled:   () => useSessionStore.getState().status === "active",
      showInHelp:  true,
    },

    // ── Mute / Unmute ──────────────────────────────────────────
    // FIX: was referenced in OverlayHotkeyHelp but missing from definitions
    {
      id:          "toggle_mute",
      label:       "Mute / Unmute",
      description: "Toggle microphone during a live session",
      keys:        ["ctrl", "shift", "m"],
      category:    "session",
      action:      () => {
        const audio = useAudioStore.getState();
        const stream = audio.streams?.mic_stream;
        if (!stream) {
          console.warn("[HotkeyManager] No mic stream — mute unavailable");
          return;
        }
        const muted = !audio.is_muted;
        stream.getAudioTracks().forEach((t) => {
          t.enabled = !muted;
        });
        audio.setIsMuted(muted);
      },
      isEnabled:   () => useSessionStore.getState().status === "active",
      showInHelp:  true,
    },

    // ── Hotkey help panel ──────────────────────────────────────
    // FIX: was referenced in OverlayHotkeyHelp but missing from definitions
    {
      id:          "show_hotkey_help",
      label:       "Hotkey Help",
      description: "Show this keyboard shortcut reference",
      keys:        ["ctrl", "shift", "/"],
      category:    "overlay",
      action:      () => {
        const store = useOverlayStore.getState();
        // Toggle: if already visible, dismiss; otherwise show
        if (typeof store.setHotkeyHelpVisible === "function") {
          store.setHotkeyHelpVisible(!store.is_hotkey_help_visible);
        }
      },
      isEnabled:   () => true,
      showInHelp:  true,
    },

    // ── Dock positions 1–4 ─────────────────────────────────────
    // FIX: was referenced in OverlayHotkeyHelp ("Quick dock positions") but
    //      no definitions existed. Four separate entries so matchesHotkey
    //      (exact-key-count matcher) can distinguish each numeric key.
    ...DOCK_POSITIONS.map(({ key, anchor }) => ({
      id:          `dock_position_${key}`,
      label:       `Dock Position ${key}`,
      description: `Snap overlay to ${anchor.replace("-", " ")} corner`,
      keys:        ["ctrl", "shift", key],
      category:    "overlay" as const,
      action:      () => {
        const store = useOverlayStore.getState();
        // Prefer overlayStore's snapTo if available, else fall through to
        // the global WindowManager singleton.
        if (typeof (store as any).snapTo === "function") {
          (store as any).snapTo(anchor);
        } else {
          try {
            const { getGlobalWindowManager } = require("./windowManager");
            getGlobalWindowManager().centerIn(anchor);
          } catch {}
        }
      },
      isEnabled:   () => useOverlayStore.getState().is_visible,
      showInHelp:  false, // grouped under a single "1–4" entry in the help UI
    })),

    // ── Session control ────────────────────────────────────────
    {
      id:          "end_session",
      label:       "End Session",
      description: "Mark session as complete and go to scorecard",
      keys:        ["ctrl", "shift", "e"],
      category:    "session",
      action:      () => useSessionStore.getState().setStatus("completed"),
      isEnabled:   () => useSessionStore.getState().status === "active",
      showInHelp:  false, // Hidden — prevent accidental trigger
    },

    // ── Clear hint / close ────────────────────────────────────
    {
      id:          "clear_hint",
      label:       "Clear Hint",
      description: "Clear current hint or dismiss the overlay panel",
      keys:        ["escape"],
      category:    "hint",
      action:      () => {
        const store = useOverlayStore.getState();
        if (store.is_panic_visible) {
          store.hidePanic();
        } else if (store.is_hotkey_help_visible) {
          store.setHotkeyHelpVisible(false);
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
    this.warnConflicts();
  }

  private warnConflicts(): void {
    for (const { keys, ids } of detectHotkeyConflicts(this.definitions)) {
      console.warn(
        `[HotkeyManager] Duplicate hotkey "${keys}" assigned to: ${ids.join(", ")}`,
      );
    }
  }

  // ── Register all hotkeys ──────────────────────────────────────
  register(): void {
    if (this.isActive) return;
    this.warnConflicts();
    // Capture phase: fires before any element's own keydown handler
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
    // Never intercept while typing in an input (Escape is always allowed through)
    const target = e.target as HTMLElement | null;
    const tag = (target?.tagName ?? "").toUpperCase();
    const isEditable =
      tag === "INPUT"    ||
      tag === "TEXTAREA" ||
      (target?.isContentEditable ?? false);

    if (isEditable && e.key !== "Escape") return;

    for (const hotkey of this.definitions) {
      if (!hotkey.isEnabled()) continue;
      if (eventMatchesKeys(e, hotkey.keys)) {
        e.preventDefault();
        e.stopPropagation();
        try {
          hotkey.action();
        } catch (err) {
          console.error(`[HotkeyManager:${hotkey.id}] action failed`, err);
        }
        return;
      }
    }
  }

  // ── Help items (for the hotkey help panel) ────────────────────
  getHelpItems(): Array<{ label: string; keys: string; description: string }> {
    return this.definitions
      .filter((d) => d.showInHelp)
      .map((d) => ({
        label:       d.label,
        keys:        formatHotkeyLabel(d.keys),
        description: d.description,
      }));
  }

  // ── Add / remove definitions at runtime ───────────────────────
  addDefinition(def: HotkeyDefinition): void {
    // Replace if same id already exists
    this.definitions = [
      ...this.definitions.filter((d) => d.id !== def.id),
      def,
    ];
    this.warnConflicts();
  }

  removeDefinition(id: string): void {
    this.definitions = this.definitions.filter((d) => d.id !== id);
  }
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/** Format a keys array into a human-readable shortcut label. */
export function formatHotkeyLabel(keys: string[]): string {
  return keys
    .map((k) => {
      switch (k.toLowerCase()) {
        case "ctrl":   return "⌃";
        case "shift":  return "⇧";
        case "alt":    return "⌥";
        case "escape": return "Esc";
        default:       return k.toUpperCase();
      }
    })
    .join(" ");
}
