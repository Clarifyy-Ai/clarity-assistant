/**
 * Load custom hotkey overrides and convert to useHotkey key arrays / Electron accelerators.
 */
import {
  DEFAULT_HOTKEYS,
  type HotkeyId,
  isMac,
} from "@/lib/constants/hotkeys";

export const HOTKEY_STORAGE_KEY = "clarify_custom_hotkeys";

export type HotkeyOverrides = Partial<Record<HotkeyId, string>>;

export function loadHotkeyOverrides(): HotkeyOverrides {
  try {
    return JSON.parse(localStorage.getItem(HOTKEY_STORAGE_KEY) ?? "{}") as HotkeyOverrides;
  } catch {
    return {};
  }
}

export function getEffectiveHotkeyCombo(
  id: HotkeyId,
  overrides: HotkeyOverrides = loadHotkeyOverrides(),
): string {
  const def = DEFAULT_HOTKEYS[id];
  return overrides[id] ?? (isMac() && def.mac ? def.mac : def.keys);
}

/** "Ctrl+Shift+H" → ["ctrl","shift","h"] for useHotkey */
export function comboToKeyArray(combo: string): string[] {
  return combo
    .replace(/⌘/g, "Meta")
    .split("+")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .map((p) => {
      if (p === "control") return "ctrl";
      // useHotkey treats metaKey as ctrl — normalize Mac ⌘ to ctrl for matching.
      if (p === "cmd" || p === "command" || p === "⌘" || p === "meta") return "ctrl";
      return p;
    });
}

/** "Ctrl+Shift+H" → Electron "CommandOrControl+Shift+H" */
export function comboToElectronAccelerator(combo: string): string {
  const parts = combo.replace(/⌘/g, "Meta").split("+").map((p) => p.trim());
  return parts
    .map((p) => {
      const lower = p.toLowerCase();
      if (lower === "ctrl" || lower === "control") return "CommandOrControl";
      if (lower === "meta" || lower === "cmd" || lower === "command")
        return "CommandOrControl";
      if (lower === "shift") return "Shift";
      if (lower === "alt" || lower === "option") return "Alt";
      if (p.length === 1) return p.toUpperCase();
      return p;
    })
    .join("+");
}

export type ElectronShortcutBinding = {
  accelerator: string;
  action: string;
};

/** Global Electron shortcuts derived from overrides (toggle + AI answer). */
export function buildElectronShortcutBindings(
  overrides: HotkeyOverrides = loadHotkeyOverrides(),
): ElectronShortcutBinding[] {
  const toggle = getEffectiveHotkeyCombo("TOGGLE_OVERLAY", overrides);
  const ai = getEffectiveHotkeyCombo(
    "REQUEST_AI_ANSWER" in DEFAULT_HOTKEYS
      ? ("REQUEST_AI_ANSWER" as HotkeyId)
      : ("GENERATE_ANSWER" as HotkeyId),
    overrides,
  );
  const bindings: ElectronShortcutBinding[] = [
    {
      accelerator: comboToElectronAccelerator(toggle),
      action: "toggle-overlay",
    },
    {
      accelerator: comboToElectronAccelerator(ai),
      action: "request-ai-answer",
    },
  ];
  // de-dupe accelerators
  const seen = new Set<string>();
  return bindings.filter((b) => {
    if (seen.has(b.accelerator)) return false;
    seen.add(b.accelerator);
    return true;
  });
}
