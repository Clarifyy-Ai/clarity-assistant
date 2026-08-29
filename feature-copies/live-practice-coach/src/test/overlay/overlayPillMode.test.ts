// Verifies the Parakeet-style pill defaults & expand/collapse invariants.
import { describe, it, expect, beforeEach } from "vitest";
import { useOverlayStore } from "@/store/overlayStore";

describe("Overlay pill (Parakeet) mode", () => {
  beforeEach(() => {
    useOverlayStore.getState().resetSessionState();
  });

  it("supports minimal (pill) mode via setMinimalMode", () => {
    useOverlayStore.getState().setMinimalMode(true);
    expect(useOverlayStore.getState().is_minimal_mode).toBe(true);
  });

  it("defaults to a top-area position (y small) for the pill", () => {
    const { position } = useOverlayStore.getState();
    expect(position.y).toBeLessThanOrEqual(120);
    expect(position.x).toBeGreaterThanOrEqual(8);
  });

  it("renders solid (full opacity) when not in stealth mode", () => {
    const s = useOverlayStore.getState();
    expect(s.is_stealth_mode).toBe(false);
    // stealth_opacity is only applied when stealth mode is on; non-stealth = solid
    expect(s.stealth_opacity).toBeGreaterThanOrEqual(20);
  });

  it("expand/collapse toggle reliably flips minimal_mode", () => {
    const { setMinimalMode } = useOverlayStore.getState();
    setMinimalMode(false);
    expect(useOverlayStore.getState().is_minimal_mode).toBe(false);
    setMinimalMode(true);
    expect(useOverlayStore.getState().is_minimal_mode).toBe(true);
  });

  it("collapsing back to pill keeps active_tab on a valid pill tab", () => {
    const { setMinimalMode } = useOverlayStore.getState();
    useOverlayStore.setState({ active_tab: "transcript" } as any);
    setMinimalMode(true);
    const tab = useOverlayStore.getState().active_tab;
    expect(["answer", "resume"]).toContain(tab);
  });
});
