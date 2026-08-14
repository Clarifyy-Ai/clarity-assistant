/**
 * Reliable Ctrl/Cmd+Shift matching. Prefer e.code so Shift does not
 * change the identity of the primary key (e.key is "H" / "{" / etc.).
 */

const CODE_TO_KEY: Record<string, string> = {
  BracketLeft: "[",
  BracketRight: "]",
  Period: ".",
  Comma: ",",
  Slash: "/",
  Backslash: "\\",
  Minus: "-",
  Equal: "=",
  Semicolon: ";",
  Quote: "'",
  Backquote: "`",
  Escape: "escape",
  Enter: "enter",
  Space: " ",
};

export function primaryKeyFromEvent(e: KeyboardEvent): string {
  const code = e.code ?? "";
  if (code.startsWith("Key") && code.length === 4) {
    return code.slice(3).toLowerCase();
  }
  if (code.startsWith("Digit") && code.length === 6) {
    return code.slice(5);
  }
  if (CODE_TO_KEY[code]) return CODE_TO_KEY[code];
  return (e.key ?? "").toLowerCase();
}

export function pressedKeysFromEvent(e: KeyboardEvent): Set<string> {
  const set = new Set<string>();
  if (e.ctrlKey || e.metaKey) set.add("ctrl");
  if (e.shiftKey) set.add("shift");
  if (e.altKey) set.add("alt");
  set.add(primaryKeyFromEvent(e));
  return set;
}

export function eventMatchesKeys(e: KeyboardEvent, required: string[]): boolean {
  if (!required.length) return false;
  const pressed = pressedKeysFromEvent(e);
  const need = required.map((k) => k.toLowerCase());
  if (pressed.size !== need.length) return false;
  return need.every((k) => pressed.has(k));
}
