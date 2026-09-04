import { describe, expect, it } from "vitest";
import {
  averageFillerRateWithSessionFallback,
  averageWpmWithSessionFallback,
  sessionFillerRatePerMinute,
  unscoredSessionsStatusCopy,
} from "@/lib/analytics/speechAggregates";

describe("speechAggregates", () => {
  it("averages WPM from scorecards when present", () => {
    expect(
      averageWpmWithSessionFallback([
        { scorecard: { details: { wpm_avg: 120 } }, session: { avg_wpm: 90 } },
        { scorecard: { details: { wpm_avg: 140 } }, session: { avg_wpm: 80 } },
      ]),
    ).toBe(130);
  });

  it("falls back to session avg_wpm when scorecard speech is missing", () => {
    expect(
      averageWpmWithSessionFallback([
        { scorecard: { overall_score: null }, session: { avg_wpm: 110 } },
        { session: { avg_wpm: 130 } },
      ]),
    ).toBe(120);
  });

  it("derives filler rate from filler_words and duration", () => {
    expect(
      sessionFillerRatePerMinute({
        filler_words: 6,
        started_at: "2026-09-01T10:00:00.000Z",
        ended_at: "2026-09-01T10:03:00.000Z",
      }),
    ).toBe(2);
  });

  it("averages filler rate with session fallback", () => {
    expect(
      averageFillerRateWithSessionFallback([
        {
          session: {
            filler_words: 6,
            started_at: "2026-09-01T10:00:00.000Z",
            ended_at: "2026-09-01T10:03:00.000Z",
          },
        },
        {
          scorecard: { details: { filler_rate: 4 } },
          session: { filler_words: 0 },
        },
      ]),
    ).toBe(3);
  });

  it("keeps overall score out of speech fallbacks (null when no speech data)", () => {
    expect(
      averageWpmWithSessionFallback([
        { scorecard: { overall_score: 88 }, session: {} },
      ]),
    ).toBeNull();
  });

  it("explains unscored periods for filter validation", () => {
    expect(unscoredSessionsStatusCopy(19, 0)).toContain("19 completed sessions");
    expect(unscoredSessionsStatusCopy(19, 0)).toContain("0 scored");
    expect(unscoredSessionsStatusCopy(5, 2)).toContain("more sessions are scored");
  });
});
