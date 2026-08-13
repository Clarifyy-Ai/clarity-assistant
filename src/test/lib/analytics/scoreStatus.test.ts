import { describe, expect, it } from "vitest";
import { formatSessionScore } from "@/lib/analytics/scoreStatus";

describe("formatSessionScore", () => {
  it("never coerces missing scores to zero", () => {
    expect(formatSessionScore(null, "not_scored")).toBe("Not scored");
    expect(formatSessionScore(undefined, "failed")).toBe("Not scored");
    expect(formatSessionScore(0, "not_scored")).toBe("Not scored");
    expect(formatSessionScore(0, "scored")).toBe("0");
    expect(formatSessionScore(82, "scored")).toBe("82");
  });
});
