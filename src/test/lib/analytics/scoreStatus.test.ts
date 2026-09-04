import { describe, expect, it } from "vitest";
import {
  debriefJobStatusLabel,
  formatSessionScore,
  isAuthoritativeScorecard,
  normalizeScoreStatus,
  scorecardStatusLabel,
} from "@/lib/analytics/scoreStatus";

describe("formatSessionScore", () => {
  it("never shows 0 on fail or ineligible rows", () => {
    expect(formatSessionScore(null, "not_scored")).toBe("Not eligible");
    expect(formatSessionScore(undefined, "failed")).toBe("Failed");
    expect(formatSessionScore(0, "not_scored")).toBe("Not eligible");
    expect(formatSessionScore(0, "failed")).toBe("Failed");
    expect(formatSessionScore(0, "pending")).toBe("Processing");
    expect(formatSessionScore(0, "scored")).toBe("0");
    expect(formatSessionScore(82, "scored")).toBe("82");
  });

  it("maps analytics aliases to Not eligible / Processing / Failed", () => {
    expect(formatSessionScore(null, "excluded")).toBe("Not eligible");
    expect(formatSessionScore(null, "processing")).toBe("Processing");
    expect(formatSessionScore(12, "failed")).toBe("Failed");
  });
});

describe("scorecardStatusLabel", () => {
  it("uses canonical job labels", () => {
    expect(scorecardStatusLabel("loading")).toBe("Processing");
    expect(scorecardStatusLabel("pending")).toBe("Processing");
    expect(scorecardStatusLabel("not_scored")).toBe("Not eligible");
    expect(scorecardStatusLabel("failed")).toBe("Failed");
    expect(scorecardStatusLabel("scored")).toBe("Scored");
    expect(isAuthoritativeScorecard("pending")).toBe(false);
    expect(isAuthoritativeScorecard("not_scored")).toBe(false);
    expect(isAuthoritativeScorecard("failed")).toBe(false);
    expect(isAuthoritativeScorecard("scored")).toBe(true);
  });
});

describe("normalizeScoreStatus / debriefJobStatusLabel", () => {
  it("normalizes mixed statuses", () => {
    expect(normalizeScoreStatus("failed", 0)).toBe("failed");
    expect(normalizeScoreStatus("pending")).toBe("pending");
    expect(normalizeScoreStatus("excluded")).toBe("not_scored");
    expect(normalizeScoreStatus(undefined, 70)).toBe("scored");
  });

  it("labels debrief jobs consistently", () => {
    expect(debriefJobStatusLabel("queued")).toBe("Processing");
    expect(debriefJobStatusLabel("processing")).toBe("Processing");
    expect(debriefJobStatusLabel("failed")).toBe("Failed");
    expect(debriefJobStatusLabel("not_scored")).toBe("Not eligible");
    expect(debriefJobStatusLabel("completed")).toBe("Ready");
  });
});
