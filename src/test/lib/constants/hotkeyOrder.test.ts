import { describe, expect, it } from "vitest";
import {
  HOTKEY_CATEGORY_ORDER,
  HOTKEY_ORDER,
  getOrderedHotkeyCatalog,
  getOrderedHotkeysForCategory,
} from "@/lib/constants/hotkeys";

describe("hotkey frequency ordering", () => {
  it("lists General first", () => {
    expect(HOTKEY_CATEGORY_ORDER[0]).toBe("general");
  });

  it("orders General shortcuts theme → notifications → help", () => {
    const general = HOTKEY_ORDER.general;
    const themeIdx = general.indexOf("TOGGLE_THEME");
    const notifIdx = general.indexOf("OPEN_NOTIFICATIONS");
    const helpIdx = general.indexOf("HELP");
    expect(themeIdx).toBeGreaterThan(-1);
    expect(notifIdx).toBeGreaterThan(themeIdx);
    expect(helpIdx).toBeGreaterThan(notifIdx);
  });

  it("keeps settings and public catalog in the same category order", () => {
    const catalog = getOrderedHotkeyCatalog();
    expect(catalog.map((c) => c.category)).toEqual(
      HOTKEY_CATEGORY_ORDER.filter(
        (cat) => getOrderedHotkeysForCategory(cat).length > 0,
      ),
    );
  });

  it("matches General descriptions between settings and public page", () => {
    const general = getOrderedHotkeysForCategory("general").map(([, def]) => def.description);
    expect(general).toContain("Toggle dark / light theme");
    expect(general).toContain("Open notifications");
    expect(general).toContain("Show contextual help");
  });

  it("keeps overlay shortcuts aligned with DEFAULT_HOTKEYS (no legacy H/J)", () => {
    const catalog = getOrderedHotkeyCatalog();
    const overlay = catalog.find((c) => c.category === "overlay");
    expect(overlay).toBeDefined();
    const combos = overlay!.shortcuts.map((s) => s.keys.join("+").toLowerCase());
    expect(combos).toContain("ctrl+shift+u");
    expect(combos).toContain("ctrl+shift+x");
    expect(combos).toContain("ctrl+shift+k");
    expect(combos).not.toContain("ctrl+shift+h");
    expect(combos).not.toContain("ctrl+shift+j");
  });

  it("shows the same AI hint shortcut on settings and public pages", () => {
    const catalog = getOrderedHotkeyCatalog();
    const ai = catalog.find((c) => c.category === "ai");
    const hint = ai?.shortcuts.find((s) => s.id === "GENERATE_HINT");
    expect(hint?.keys.map((k) => k.toLowerCase())).toEqual(["ctrl", "shift", "i"]);
  });

  it("matches Practice Session shortcuts between settings and public page", () => {
    const settingsSession = getOrderedHotkeysForCategory("session");
    const publicSession = getOrderedHotkeyCatalog().find((c) => c.category === "session");

    expect(publicSession?.shortcuts.map((s) => s.id)).toEqual(
      settingsSession.map(([id]) => id),
    );
    expect(publicSession?.shortcuts.map((s) => s.description)).toEqual(
      settingsSession.map(([, def]) => def.description),
    );
    expect(publicSession?.shortcuts.map((s) => s.id)).toEqual([
      "TOGGLE_STEALTH",
      "END_SESSION",
      "NEXT_QUESTION",
      "PREVIOUS_QUESTION",
    ]);
    expect(publicSession?.shortcuts.map((s) => s.id)).not.toContain("TOGGLE_MIC");
  });

  it("lists mic mute under Audio Controls, not Practice Session", () => {
    const catalog = getOrderedHotkeyCatalog();
    const session = catalog.find((c) => c.category === "session");
    const audio = catalog.find((c) => c.category === "audio");
    expect(session?.shortcuts.some((s) => s.id === "TOGGLE_MIC")).toBe(false);
    expect(audio?.shortcuts.some((s) => s.id === "TOGGLE_MIC")).toBe(true);
  });

  it("matches Audio Controls shortcuts between settings and public page", () => {
    const settingsAudio = getOrderedHotkeysForCategory("audio");
    const publicAudio = getOrderedHotkeyCatalog().find((c) => c.category === "audio");

    expect(publicAudio?.title).toBe("Audio Controls");
    expect(publicAudio?.shortcuts.map((s) => s.id)).toEqual(
      settingsAudio.map(([id]) => id),
    );
    expect(publicAudio?.shortcuts.map((s) => s.description)).toEqual(
      settingsAudio.map(([, def]) => def.description),
    );
    expect(publicAudio?.shortcuts.map((s) => s.id)).toEqual([
      "TOGGLE_MIC",
      "TOGGLE_SYSTEM_AUDIO",
    ]);
    expect(publicAudio?.shortcuts.find((s) => s.id === "TOGGLE_MIC")?.keys).toEqual([
      "Ctrl",
      "Shift",
      "M",
    ]);
    expect(publicAudio?.shortcuts.find((s) => s.id === "TOGGLE_SYSTEM_AUDIO")?.keys).toEqual([
      "Ctrl",
      "Shift",
      "L",
    ]);
  });
});
