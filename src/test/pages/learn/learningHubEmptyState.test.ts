import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("Learning Hub empty / preview honesty", () => {
  it("does not show a learner primary CTA that claims published courses exist", () => {
    const src = fs.readFileSync(
      path.join(root, "src/pages/app/learn/LearningHub.tsx"),
      "utf8",
    );
    expect(src).toContain('badge={isPreview ? "Preview"');
    expect(src).toContain("No published courses yet");
    expect(src).toContain('actionLabel={isAdmin ? "Create a course" : undefined}');
    expect(src).not.toMatch(/actionLabel=\{[^}]*Browse/i);
    expect(src).not.toMatch(/actionLabel=["'](Explore|Browse|View) courses/i);
  });
});
