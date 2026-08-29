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
    .replace(/⌥/g, "Alt")
    .replace(/⇧/g, "Shift")
    .replace(/⌃/g, "Ctrl")
    .split("+")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .map((p) => {
      if (p === "control") return "ctrl";
      // useHotkey treats metaKey as ctrl — normalize Mac ⌘ to ctrl for matching.
      if (p === "cmd" || p === "command" || p === "⌘" || p === "meta") return "ctrl";
      if (p === "option" || p === "⌥") return "alt";
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

/** Global Electron shortcuts derived from overlay defaults + user overrides. */
export function buildElectronShortcutBindings(
  overrides: HotkeyOverrides = loadHotkeyOverrides(),
): ElectronShortcutBinding[] {
  const pair = (id: HotkeyId, action: string): ElectronShortcutBinding => ({
    accelerator: comboToElectronAccelerator(getEffectiveHotkeyCombo(id, overrides)),
    action,
  });
  const bindings: ElectronShortcutBinding[] = [
    pair("TOGGLE_OVERLAY", "toggle-overlay"),
    pair("TOGGLE_OVERLAY_ALIAS", "toggle-overlay"),
    pair("MINIMIZE_OVERLAY", "toggle-overlay"),
    pair("PANIC_CALM", "panic-calm"),
    pair("REQUEST_AI_ANSWER", "request-ai-answer"),
  ];
  const seen = new Set<string>();
  return bindings.filter((b) => {
    if (seen.has(b.accelerator)) return false;
    seen.add(b.accelerator);
    return true;
  });
}
