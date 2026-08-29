import { describe, it, expect } from "vitest";
import { OVERLAY_HOTKEY_CATALOG } from "@/lib/overlay/hotkeyCatalog";

function comboKey(keys: string[]): string {
  return keys.map((k) => k.toLowerCase()).join("+");
}

describe("OVERLAY_HOTKEY_CATALOG", () => {
  it("exports a non-empty catalog with labels, descriptions, and groups", () => {
    expect(OVERLAY_HOTKEY_CATALOG.length).toBeGreaterThan(0);
    for (const entry of OVERLAY_HOTKEY_CATALOG) {
      expect(entry.keys.length).toBeGreaterThan(0);
      expect(entry.label.trim().length).toBeGreaterThan(0);
      expect(entry.description.trim().length).toBeGreaterThan(0);
      expect(entry.group).toMatch(/^(visibility|hints|actions|session|layout)$/);
    }
  });

  it("does not assign the same combo to different rows", () => {
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
    expect(scroll?.description).not.toMatch(/discrete|stealth|opacity/i);

    const discrete = byCombo.get("ctrl+shift+t");
    expect(discrete?.label).toMatch(/discrete/i);

    const generate = byCombo.get("ctrl+shift+a");
    expect(generate?.label).toMatch(/generate/i);
  });

  it("includes toggle, mute, and dock entries", () => {
    const labels = OVERLAY_HOTKEY_CATALOG.map((e) => e.label.toLowerCase()).join(" | ");
    expect(labels).toMatch(/toggle overlay/);
    expect(labels).toMatch(/mute/);
    expect(labels).toMatch(/dock/);
  });
});
