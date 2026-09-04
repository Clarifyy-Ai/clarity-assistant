import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("live scorecard wiring", () => {
  it("enqueues generate-scorecard after live session finalize", () => {
    const source = fs.readFileSync(
      path.join(root, "src/hooks/useLiveCopilot.ts"),
      "utf8",
    );
    expect(source).toContain("enqueueSessionScorecard");
    expect(source).toContain("finalizeSessionApi");
    const finalizeIdx = source.indexOf("finalizeSessionApi");
    const enqueueIdx = source.indexOf("enqueueSessionScorecard");
    expect(finalizeIdx).toBeGreaterThan(-1);
    expect(enqueueIdx).toBeGreaterThan(finalizeIdx);
  });
});
