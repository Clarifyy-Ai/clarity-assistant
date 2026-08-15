import { describe, expect, it } from "vitest";
import {
  formatSessionScore,
  isAuthoritativeScorecard,
  scorecardStatusLabel,
} from "@/lib/analytics/scoreStatus";

describe("formatSessionScore", () => {
  it("never coerces missing scores to zero", () => {
    expect(formatSessionScore(null, "not_scored")).toBe("Not scored");
    expect(formatSessionScore(undefined, "failed")).toBe("Not scored");
    expect(formatSessionScore(0, "not_scored")).toBe("Not scored");
    expect(formatSessionScore(0, "scored")).toBe("0");
    expect(formatSessionScore(82, "scored")).toBe("82");
  });

  it("treats only persisted scored rows as authoritative", () => {
    expect(isAuthoritativeScorecard("pending")).toBe(false);
    expect(isAuthoritativeScorecard("not_scored")).toBe(false);
    expect(isAuthoritativeScorecard("failed")).toBe(false);
    expect(isAuthoritativeScorecard("scored")).toBe(true);
    expect(scorecardStatusLabel("pending")).toBe("Score pending");
    expect(scorecardStatusLabel("not_scored")).toBe("Not scored");
  });
});
