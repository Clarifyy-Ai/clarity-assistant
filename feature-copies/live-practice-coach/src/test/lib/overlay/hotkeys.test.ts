import { describe, it, expect } from "vitest";
import * as hk from "@/lib/overlay/hotkeys";
import { DEFAULT_HOTKEYS } from "@/lib/constants/hotkeys";
import { eventMatchesKeys, primaryKeyFromEvent } from "@/lib/overlay/hotkeyMatch";
import { comboToKeyArray } from "@/lib/overlay/hotkeyOverrides";
import { OVERLAY_HOTKEY_CATALOG } from "@/lib/overlay/hotkeyCatalog";

describe("overlay hotkeys module exports", () => {
  it("exports something", () => {
    expect(hk).toBeTruthy();
    expect(typeof hk).toBe("object");
  });
});

describe("default hotkey uniqueness", () => {
  it("does not assign the same combo to different actions", () => {
    const byCombo = new Map<string, string[]>();
    for (const def of Object.values(DEFAULT_HOTKEYS)) {
      const combo = def.keys.toLowerCase();
      const actions = byCombo.get(combo) ?? [];
      if (!actions.includes(def.action)) actions.push(def.action);
      byCombo.set(combo, actions);
    }
    const clashes = [...byCombo.entries()].filter(([, actions]) => actions.length > 1);
    expect(clashes).toEqual([]);
  });
});

describe("overlay hotkey catalog", () => {
  function comboKey(keys: string[]): string {
    return keys.map((k) => k.toLowerCase()).join("+");
  }

  it("has unique combos", () => {
    const combos = OVERLAY_HOTKEY_CATALOG.map((entry) => comboKey(entry.keys));
    expect(new Set(combos).size).toBe(combos.length);
  });

  it("maps S to scroll, T to discrete UI, and A to generate", () => {
    const byCombo = new Map(
      OVERLAY_HOTKEY_CATALOG.map((entry) => [comboKey(entry.keys), entry]),
    );

    const scroll = byCombo.get("ctrl+shift+s");
    expect(scroll?.label).toMatch(/scroll/i);
    expect(scroll?.label).not.toMatch(/discrete/i);

    const discrete = byCombo.get("ctrl+shift+t");
    expect(discrete?.label).toMatch(/discrete/i);

    const generate = byCombo.get("ctrl+shift+a");
    expect(generate?.label).toMatch(/generate/i);
  });
});

describe("hotkey matching", () => {
  function fakeEvent(partial: Partial<KeyboardEvent>): KeyboardEvent {
    return {
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      key: "",
      code: "",
      ...partial,
    } as KeyboardEvent;
  }

  it("matches Ctrl+Shift+H using e.code even when e.key is uppercase", () => {
    const e = fakeEvent({
      ctrlKey: true,
      shiftKey: true,
      key: "H",
      code: "KeyH",
    });
    expect(primaryKeyFromEvent(e)).toBe("h");
    expect(eventMatchesKeys(e, ["ctrl", "shift", "h"])).toBe(true);
  });

  it("parses dashboard combo with Alt", () => {
    expect(comboToKeyArray("Ctrl+Alt+D")).toEqual(["ctrl", "alt", "d"]);
    expect(comboToKeyArray("⌘+⌥+D")).toEqual(["ctrl", "alt", "d"]);
  });
});
