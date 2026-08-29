import { describe, expect, it } from "vitest";
import {
  assessStarFactualIntegrity,
  starSectionsToText,
} from "@/lib/prep/starFactualIntegrity";

describe("assessStarFactualIntegrity", () => {
  it("accepts output that only reuses source facts", () => {
    const source =
      "At Acme Corp I led a team of 5 and improved latency by 15% using Redis.";
    const output =
      "Situation: At Acme Corp I led a team of 5.\nResult: improved latency by 15% using Redis.";
    expect(assessStarFactualIntegrity(source, output).ok).toBe(true);
  });

  it("rejects invented percentages not in the source", () => {
    const source = "I improved checkout conversion at RetailCo.";
    const output = "Result: increased conversion by 47% and saved $2,000,000.";
    const result = assessStarFactualIntegrity(source, output);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.inventedNumbers.length).toBeGreaterThan(0);
    }
  });

  it("starSectionsToText joins labeled sections", () => {
    expect(
      starSectionsToText({
        situation: "S",
        task: "T",
        action: "A",
        result: "R",
      }),
    ).toContain("Situation: S");
  });
});
