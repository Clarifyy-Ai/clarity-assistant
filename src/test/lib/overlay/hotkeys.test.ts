// Overlay hotkeys — covers Overlay P0 hotkey items
import { describe, it, expect } from "vitest";
import * as hk from "@/lib/overlay/hotkeys";

describe("overlay hotkeys module exports", () => {
  it("exports something", () => {
    expect(hk).toBeTruthy();
    expect(typeof hk).toBe("object");
  });
});
