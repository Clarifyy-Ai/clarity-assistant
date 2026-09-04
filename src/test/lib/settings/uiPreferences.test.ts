import { describe, expect, it } from "vitest";
import {
  asUiPreferencesRecord,
  hasHotkeyOverrides,
  mergeUiPreferences,
  readHotkeysFromUiPreferences,
} from "@/lib/settings/uiPreferences";
import { comboToKeyArray } from "@/lib/overlay/hotkeyOverrides";
import { eventMatchesKeys } from "@/lib/overlay/hotkeyMatch";

describe("mergeUiPreferences", () => {
  it("preserves sibling keys when patching a slice", () => {
    expect(
      mergeUiPreferences(
        { theme: "dark", hotkeys: { GO_ANSWERS: "Ctrl+Alt+A" } },
        { polish: { retention: {} } },
      ),
    ).toEqual({
      theme: "dark",
      hotkeys: { GO_ANSWERS: "Ctrl+Alt+A" },
      polish: { retention: {} },
    });
  });

  it("starts from empty object when existing prefs are missing", () => {
    expect(mergeUiPreferences(null, { theme: "light" })).toEqual({ theme: "light" });
    expect(mergeUiPreferences(undefined, { hotkeys: {} })).toEqual({ hotkeys: {} });
  });
});

describe("readHotkeysFromUiPreferences", () => {
  it("returns null when hotkeys key is absent so device LS is preserved", () => {
    expect(readHotkeysFromUiPreferences({ theme: "dark" })).toBeNull();
    expect(readHotkeysFromUiPreferences(null)).toBeNull();
    expect(asUiPreferencesRecord([])).toBeNull();
  });

  it("returns empty object when hotkeys is present but empty", () => {
    expect(readHotkeysFromUiPreferences({ hotkeys: {} })).toEqual({});
    expect(hasHotkeyOverrides({})).toBe(false);
    expect(hasHotkeyOverrides(null)).toBe(false);
  });

  it("returns bindings when present", () => {
    const hotkeys = { GO_ANSWERS: "Ctrl+Alt+B" };
    expect(readHotkeysFromUiPreferences({ hotkeys })).toEqual(hotkeys);
    expect(hasHotkeyOverrides(hotkeys)).toBe(true);
  });
});

describe("GO_ANSWERS Ctrl+Alt+A matching", () => {
  it("matches a synthetic Ctrl+Alt+A KeyboardEvent", () => {
    const required = comboToKeyArray("Ctrl+Alt+A");
    expect(required).toEqual(["ctrl", "alt", "a"]);
    const e = {
      ctrlKey: true,
      metaKey: false,
      altKey: true,
      shiftKey: false,
      code: "KeyA",
      key: "a",
    } as KeyboardEvent;
    expect(eventMatchesKeys(e, required)).toBe(true);
  });
});
