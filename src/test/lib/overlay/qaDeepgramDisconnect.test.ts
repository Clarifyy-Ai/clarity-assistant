import { describe, expect, it } from "vitest";
import { DEFAULT_HOTKEYS } from "@/lib/constants/hotkeys";
import { OVERLAY_HOTKEYS } from "@/components/overlay/OverlayHotkeyHelp";
import { isQaDeepgramDisconnectEnabled } from "@/lib/overlay/qaDeepgramDisconnect";

describe("overlay Ctrl+Shift+H bind", () => {
  it("binds TOGGLE_OVERLAY to Ctrl+Shift+H and lists it in help", () => {
    expect(DEFAULT_HOTKEYS.TOGGLE_OVERLAY.keys).toBe("Ctrl+Shift+H");
    expect(OVERLAY_HOTKEYS[0]?.keys).toEqual(["ctrl", "shift", "h"]);
  });
});

describe("QA Deepgram disconnect flag", () => {
  it("stays off unless explicitly enabled in a non-production runtime", () => {
    expect(isQaDeepgramDisconnectEnabled()).toBe(false);
  });
});
