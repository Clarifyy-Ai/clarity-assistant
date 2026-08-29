import { describe, it, expect } from "vitest";
import {
  layoutModeDimensions,
  layoutModePosition,
} from "@/lib/overlay/applyOverlayWindowPrefs";

describe("applyOverlayWindowPrefs", () => {
  it("sizes compact smaller than floating", () => {
    const compact = layoutModeDimensions("compact");
    const floating = layoutModeDimensions("floating");
    expect(compact.width).toBeLessThanOrEqual(floating.width);
    expect(compact.height).toBeLessThan(floating.height);
  });

  it("docks to the right edge", () => {
    // jsdom window is typically 1024x768
    const pos = layoutModePosition("docked", { x: 10, y: 10 });
    const dims = layoutModeDimensions("docked");
    expect(pos.x).toBeGreaterThan(200);
    expect(pos.x + dims.width).toBeLessThanOrEqual(window.innerWidth);
  });
});
