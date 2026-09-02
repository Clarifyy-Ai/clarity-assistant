import { isMac } from "@/lib/constants/hotkeys";

const DISALLOWED_KEYS = new Set([
  "Tab",
  "CapsLock",
  "Escape",
  "Enter",
  "Backspace",
  "Delete",
  "Insert",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ContextMenu",
  "PrintScreen",
  "Pause",
  "ScrollLock",
  "NumLock",
  "Space",
  "Spacebar",
  " ",
]);

/** Combos the browser often intercepts before the app can handle them. */
const BROWSER_RESERVED = new Set([
  "ctrl+w",
  "ctrl+shift+w",
  "ctrl+t",
  "ctrl+n",
  "ctrl+shift+n",
  "ctrl+shift+h",
  "ctrl+shift+j",
  "ctrl+tab",
  "ctrl+shift+tab",
  "alt+f4",
  "⌘+w",
  "⌘+shift+w",
  "⌘+t",
  "⌘+n",
  "⌘+shift+n",
  "⌘+shift+h",
  "⌘+shift+j",
  "ctrl+v",
  "ctrl+c",
  "ctrl+x",
  "ctrl+a",
  "ctrl+s",
  "ctrl+p",
  "⌘+v",
  "⌘+c",
  "⌘+x",
  "⌘+a",
  "⌘+s",
  "⌘+p",
  "meta+v",
  "meta+c",
  "meta+x",
  "meta+a",
  "meta+s",
  "meta+p",
  "cmd+v",
  "cmd+c",
  "cmd+x",
  "cmd+a",
  "cmd+s",
  "cmd+p",
]);

const REQUIRED_MODIFIER_TOKENS = new Set([
  "ctrl",
  "control",
  "meta",
  "alt",
  "⌘",
  "cmd",
  "command",
  "option",
]);

export function isAllowedHotkeyKey(key: string): boolean {
  if (!key || key.length === 0) return false;
  if (DISALLOWED_KEYS.has(key)) return false;
  if (/^F\d{1,2}$/.test(key)) return false;
  return key.length === 1 || /^[A-Za-z0-9!@#$%^&*()_+\-=[\]{};':",./<>?\\|`~]$/.test(key);
}

export function isBrowserReservedCombo(combo: string): boolean {
  return BROWSER_RESERVED.has(combo.trim().toLowerCase());
}

/** Ctrl, Meta/Cmd, or Alt — Shift alone does not count. */
export function comboHasRequiredModifier(combo: string): boolean {
  return combo
    .trim()
    .toLowerCase()
    .split("+")
    .some((part) => REQUIRED_MODIFIER_TOKENS.has(part.trim()));
}

export function captureCombo(e: KeyboardEvent): string | null {
  const rawKey = e.key;
  if (["Control", "Shift", "Alt", "Meta", "Dead"].includes(rawKey)) return null;
  if (!isAllowedHotkeyKey(rawKey)) return null;

  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.metaKey) parts.push(isMac() ? "⌘" : "Meta");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");

  const key = rawKey.length === 1 ? rawKey.toUpperCase() : rawKey;
  parts.push(key);

  const combo = parts.join("+");
  return combo.trim() && combo.length <= 32 ? combo : null;
}
