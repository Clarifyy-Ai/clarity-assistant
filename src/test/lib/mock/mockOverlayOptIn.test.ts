import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("mock overlay opt-in", () => {
  it("MockSession defaults overlay closed and mounts OverlayWindow only when toggled", () => {
    const src = fs.readFileSync(
      path.join(root, "src/pages/app/mock/MockSession.tsx"),
      "utf8",
    );
    expect(src).toContain('useState(false)');
    expect(src).toContain("mockOverlayOpen");
    expect(src).toContain("mock-overlay-toggle");
    expect(src).toMatch(/mockOverlayOpen &&[\s\S]*OverlayWindow/);
  });

  it("mock hints work without overlay via mockHintBridge", () => {
    const bridge = fs.readFileSync(
      path.join(root, "src/lib/mock/mockHintBridge.ts"),
      "utf8",
    );
    const orchestrator = fs.readFileSync(
      path.join(root, "src/hooks/useSessionOrchestrator.ts"),
      "utf8",
    );
    expect(bridge).toContain("useMockHintBridge");
    expect(orchestrator).toContain("useMockHintBridge");
    expect(orchestrator).not.toContain("getLocalHintFallback");
  });
});
