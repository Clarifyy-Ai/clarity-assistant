import { describe, expect, it } from "vitest";
import { DEFAULT_HOTKEYS } from "@/lib/constants/hotkeys";
import { OVERLAY_HOTKEYS } from "@/components/overlay/OverlayHotkeyHelp";
import { isQaDeepgramDisconnectEnabled } from "@/lib/overlay/qaDeepgramDisconnect";

describe("overlay Ctrl+Shift+U bind", () => {
  it("binds TOGGLE_OVERLAY to Ctrl+Shift+U and lists it in help", () => {
    expect(DEFAULT_HOTKEYS.TOGGLE_OVERLAY.keys).toBe("Ctrl+Shift+U");
    expect(OVERLAY_HOTKEYS[0]?.keys).toEqual(["ctrl", "shift", "u"]);
  });

  it("does not map Ctrl+Shift+C to overlay toggle (C is coding capture)", () => {
    expect(DEFAULT_HOTKEYS.TOGGLE_OVERLAY_ALIAS.keys).toBe("Ctrl+Shift+X");
    expect(DEFAULT_HOTKEYS.CAPTURE_CODING.keys).toBe("Ctrl+Shift+C");
    const capture = OVERLAY_HOTKEYS.find((h) => h.keys.join("+") === "ctrl+shift+c");
    expect(capture?.label).toMatch(/screenshot|analyse|analyze/i);
    const toggle = OVERLAY_HOTKEYS.find((h) => h.keys.join("+") === "ctrl+shift+u");
    expect(toggle?.label).toMatch(/toggle overlay/i);
  });
});

describe("QA Deepgram disconnect flag", () => {
  it("stays off unless explicitly enabled in a non-production runtime", () => {
    expect(isQaDeepgramDisconnectEnabled()).toBe(false);
  });
});
