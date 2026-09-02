import { describe, expect, it } from "vitest";
import { enrichDetailedReport } from "@/lib/debrief/enrichDetailedReport";

describe("enrichDetailedReport", () => {
  it("builds wpm and filler series only from segments with offset_ms", () => {
    const result = enrichDetailedReport(
      {},
      { avg_wpm: 130, filler_words: 12, confidence_score: 80 },
      [
        { wpm: 110, filler_count: 2, offset_ms: 0 },
        { wpm: 125, filler_count: 0, offset_ms: 30_000 },
        { wpm: 140, offset_ms: 60_000 },
      ],
    );

    expect(result.wpm_series).toEqual([
      { t: 0, wpm: 110 },
      { t: 30, wpm: 125 },
      { t: 60, wpm: 140 },
    ]);
    expect(result.filler_series).toEqual([
      { t: 0, count: 2 },
      { t: 30, count: 0 },
    ]);
  });

  it("ignores segments missing offset_ms", () => {
    const result = enrichDetailedReport(
      {},
      { avg_wpm: 130 },
      [{ wpm: 110 }, { wpm: 120, offset_ms: 15_000 }],
    );

    expect(result.wpm_series).toEqual([{ t: 15, wpm: 120 }]);
  });

  it("does not synthesize series from session averages or hardcoded pauses", () => {
    const result = enrichDetailedReport(
      {},
      { avg_wpm: 130, filler_words: 12, confidence_score: 80 },
      [],
    );

    expect(result.wpm_series).toBeUndefined();
    expect(result.filler_series).toBeUndefined();
    expect(result.pause_series).toBeUndefined();
    expect(result.confidence_series).toBeUndefined();
  });

  it("preserves report series and sets charts_available flags", () => {
    const result = enrichDetailedReport(
      {
        wpm_series: [
          { t: 0, wpm: 100 },
          { t: 30, wpm: 110 },
        ],
        pause_series: [{ bucket: "0–1s", count: 3 }],
      },
      null,
      [],
    );

    expect(result.wpm_series).toHaveLength(2);
    expect(result.pause_series).toEqual([{ bucket: "0–1s", count: 3 }]);
    expect(result.charts_available).toEqual({
      wpm: true,
      fillers: false,
      pauses: true,
      confidence: false,
    });
  });

  it("marks charts unavailable when only one data point exists", () => {
    const result = enrichDetailedReport(
      {},
      null,
      [{ wpm: 120, filler_count: 1, offset_ms: 5_000 }],
    );

    expect(result.charts_available).toEqual({
      wpm: false,
      fillers: false,
      pauses: false,
      confidence: false,
    });
  });
});
