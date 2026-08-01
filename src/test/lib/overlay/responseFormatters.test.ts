import { describe, it, expect } from "vitest";
import {
  structureForMode,
  formatStarFramework,
} from "@/lib/overlay/responseFormatters";
import {
  comboToKeyArray,
  comboToElectronAccelerator,
  buildElectronShortcutBindings,
} from "@/lib/overlay/hotkeyOverrides";
import { hintIdempotencyKey } from "@/lib/ai/questionDetection";

describe("responseFormatters", () => {
  it("STAR framework never invents personal metrics", () => {
    const text = formatStarFramework("Tell me about leadership");
    expect(text).toMatch(/STAR/i);
    expect(text).toMatch(/do not invent/i);
  });

  it("supports technical and coding modes", () => {
    expect(structureForMode("technical", "What is CAP?")).toMatch(/Trade-offs/i);
    expect(structureForMode("coding", "Reverse a list")).toMatch(/Pseudocode/i);
  });
});

describe("hotkeyOverrides", () => {
  it("parses combos for useHotkey", () => {
    expect(comboToKeyArray("Ctrl+Shift+H")).toEqual(["ctrl", "shift", "h"]);
  });

  it("builds Electron accelerators", () => {
    expect(comboToElectronAccelerator("Ctrl+Shift+A")).toBe(
      "CommandOrControl+Shift+A",
    );
  });

  it("builds default electron bindings", () => {
    const bindings = buildElectronShortcutBindings({});
    expect(bindings.some((b) => b.action === "toggle-overlay")).toBe(true);
    expect(bindings.some((b) => b.action === "request-ai-answer")).toBe(true);
  });
});

describe("live hint idempotency", () => {
  it("is stable for the same session and question", () => {
    const a = hintIdempotencyKey("s1", "What is your strength?");
    const b = hintIdempotencyKey("s1", "what is your strength?");
    expect(a).toBe(b);
  });
});
