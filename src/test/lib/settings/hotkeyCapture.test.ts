import { describe, expect, it } from "vitest";
import {
  captureCombo,
  comboHasRequiredModifier,
  isAllowedHotkeyKey,
  isBrowserReservedCombo,
} from "@/lib/overlay/hotkeyCapture";

function keydown(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
}

describe("isAllowedHotkeyKey", () => {
  it("allows letter and digit keys", () => {
    expect(isAllowedHotkeyKey("v")).toBe(true);
    expect(isAllowedHotkeyKey("V")).toBe(true);
    expect(isAllowedHotkeyKey("1")).toBe(true);
  });

  it("rejects navigation, enter, and function keys", () => {
    expect(isAllowedHotkeyKey("Tab")).toBe(false);
    expect(isAllowedHotkeyKey("Escape")).toBe(false);
    expect(isAllowedHotkeyKey("Enter")).toBe(false);
    expect(isAllowedHotkeyKey("F5")).toBe(false);
    expect(isAllowedHotkeyKey("Space")).toBe(false);
    expect(isAllowedHotkeyKey(" ")).toBe(false);
  });
});

describe("isBrowserReservedCombo", () => {
  it("blocks clipboard and common browser chrome shortcuts", () => {
    expect(isBrowserReservedCombo("Ctrl+V")).toBe(true);
    expect(isBrowserReservedCombo("ctrl+c")).toBe(true);
    expect(isBrowserReservedCombo("Ctrl+X")).toBe(true);
    expect(isBrowserReservedCombo("ctrl+a")).toBe(true);
    expect(isBrowserReservedCombo("Ctrl+S")).toBe(true);
    expect(isBrowserReservedCombo("ctrl+p")).toBe(true);
    expect(isBrowserReservedCombo("⌘+V")).toBe(true);
    expect(isBrowserReservedCombo("Meta+C")).toBe(true);
  });

  it("blocks browser-stolen overlay defaults and allows Shift combos that are free", () => {
    expect(isBrowserReservedCombo("Ctrl+Shift+H")).toBe(true);
    expect(isBrowserReservedCombo("Ctrl+Shift+J")).toBe(true);
    expect(isBrowserReservedCombo("Ctrl+Shift+T")).toBe(true);
    expect(isBrowserReservedCombo("Ctrl+Shift+I")).toBe(true);
    expect(isBrowserReservedCombo("Ctrl+Shift+P")).toBe(false);
    expect(isBrowserReservedCombo("Ctrl+Shift+U")).toBe(false);
    expect(isBrowserReservedCombo("Ctrl+Shift+F")).toBe(false);
  });
});

describe("comboHasRequiredModifier", () => {
  it("requires Ctrl, Meta, or Alt — not Shift alone", () => {
    expect(comboHasRequiredModifier("V")).toBe(false);
    expect(comboHasRequiredModifier("Shift+V")).toBe(false);
    expect(comboHasRequiredModifier("Ctrl+V")).toBe(true);
    expect(comboHasRequiredModifier("Alt+K")).toBe(true);
    expect(comboHasRequiredModifier("⌘+Shift+H")).toBe(true);
    expect(comboHasRequiredModifier("Meta+K")).toBe(true);
  });
});

describe("captureCombo", () => {
  it("returns Ctrl+V so reserved-combo checks can reject paste", () => {
    expect(captureCombo(keydown({ key: "v", ctrlKey: true }))).toBe("Ctrl+V");
  });

  it("returns a bare letter so callers can toast and keep recording", () => {
    expect(captureCombo(keydown({ key: "v" }))).toBe("V");
    expect(comboHasRequiredModifier(captureCombo(keydown({ key: "v" }))!)).toBe(false);
  });

  it("returns Shift+letter without treating Shift as a required modifier", () => {
    const combo = captureCombo(keydown({ key: "v", shiftKey: true }));
    expect(combo).toBe("Shift+V");
    expect(comboHasRequiredModifier(combo!)).toBe(false);
  });

  it("captures a valid custom combo with Ctrl+Shift", () => {
    const combo = captureCombo(keydown({ key: "u", ctrlKey: true, shiftKey: true }));
    expect(combo).toBe("Ctrl+Shift+U");
    expect(comboHasRequiredModifier(combo!)).toBe(true);
    expect(isBrowserReservedCombo(combo!)).toBe(false);
  });

  it("ignores modifier-only and disallowed keys", () => {
    expect(captureCombo(keydown({ key: "Control", ctrlKey: true }))).toBeNull();
    expect(captureCombo(keydown({ key: "Tab", ctrlKey: true }))).toBeNull();
  });
});
