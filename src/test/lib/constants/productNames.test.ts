import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";

describe("product name punctuation contracts", () => {
  it("keeps intentional periods only in the brand tagline", () => {
    expect(PRODUCT_NAMES.tagline).toBe("Navigate Your Career. Prepare With Confidence.");
    expect(PRODUCT_NAMES.practiceCoach).toBe("Practice Coach");
    expect(PRODUCT_NAMES.practiceCoach).not.toMatch(/[.,]/);
    expect(PRODUCT_NAMES.mockInterview).not.toMatch(/[.,]/);
    expect(PRODUCT_NAMES.govExams).not.toMatch(/[.,]/);
    expect(PRODUCT_NAMES.brand).not.toMatch(/[.,]/);
  });

  it("Practice Coach walkthrough does not use tracking-widest on the product eyebrow", () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
    const src = fs.readFileSync(
      path.join(root, "src/components/marketing/PracticeCoachWalkthrough.tsx"),
      "utf8",
    );
    expect(src).toContain("PRODUCT_NAMES.practiceCoach");
    expect(src).toContain("text-pretty");
    expect(src).not.toMatch(/tracking-widest/);
    expect(src).not.toMatch(/PRACTICE\s*[.,]+\s*COACH/);
  });
});
