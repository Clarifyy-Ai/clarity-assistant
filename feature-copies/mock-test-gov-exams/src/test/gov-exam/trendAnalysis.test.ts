import { describe, expect, it } from "vitest";
import {
  ALGORITHM_VERSION,
  analyzePatternVersions,
  applyShiftToWeightTable,
  buildTopicTrends,
  occurrencesFromQuestionRows,
} from "@/lib/gov-exam/trendAnalysis";
import { DEFAULT_RECENCY_WEIGHTS } from "@/lib/gov-exam/recencyWeights";

describe("occurrencesFromQuestionRows", () => {
  it("buckets topic×year counts and skips invalid years", () => {
    const occ = occurrencesFromQuestionRows([
      { topic: "Algebra", year: 2024 },
      { topic: "Algebra", year: 2024 },
      { topic: "History", year: 2023 },
      { topic: null, year: 1980 },
      { topic: "  ", year: 2022 },
    ]);
    expect(occ).toEqual(
      expect.arrayContaining([
        { topic: "Algebra", year: 2024, count: 2 },
        { topic: "History", year: 2023, count: 1 },
        { topic: "Unknown", year: 2022, count: 1 },
      ]),
    );
    expect(occ.find((o) => o.year === 1980)).toBeUndefined();
  });
});

describe("buildTopicTrends", () => {
  it("returns honest empty payload when no PYQ data", () => {
    const result = buildTopicTrends([], [2024, 2023]);
    expect(result.empty).toBe(true);
    expect(result.algorithmVersion).toBe(ALGORITHM_VERSION);
    expect(result.topics).toEqual([]);
    expect(result.message).toMatch(/No previous-year/i);
  });

  it("ranks topics with recency_v1 weights favoring newer years", () => {
    const result = buildTopicTrends(
      [
        { topic: "Polity", year: 2022, count: 10 },
        { topic: "Economy", year: 2024, count: 10 },
      ],
      [2024, 2023, 2022],
    );
    expect(result.empty).toBe(false);
    expect(result.algorithmVersion).toBe("recency_v1");
    // Same raw count: newer year (weight 1.0) ranks above older (weight 0.7)
    expect(result.topics[0].topic).toBe("Economy");
    expect(result.topics[0].weightedFrequency).toBeGreaterThan(
      result.topics[1].weightedFrequency,
    );
  });

  it("filters to requested source years", () => {
    const result = buildTopicTrends(
      [
        { topic: "A", year: 2024, count: 1 },
        { topic: "B", year: 2020, count: 50 },
      ],
      [2024],
    );
    expect(result.topics.map((t) => t.topic)).toEqual(["A"]);
    expect(result.sourceYearsUsed).toEqual([2024]);
  });
});

describe("pattern shift + weight damping", () => {
  it("detects material shift across versions", () => {
    const shift = analyzePatternVersions([
      {
        total_questions: 100,
        total_marks: 100,
        duration_minutes: 60,
        negative_mark: 0.25,
        section_codes: ["GA", "Quant"],
      },
      {
        total_questions: 120,
        total_marks: 120,
        duration_minutes: 90,
        negative_mark: 0.25,
        section_codes: ["GA", "Quant", "Reasoning"],
      },
    ]);
    expect(shift?.material).toBe(true);
    // versions[0]=current (100Q), versions[1]=previous (120Q + Reasoning)
    expect(shift?.changes).toEqual(
      expect.arrayContaining([
        "question_count",
        "total_marks",
        "duration",
        "section_removed:Reasoning",
      ]),
    );
    expect(shift?.historicalWeightFactor).toBe(0.35);
  });

  it("returns null when fewer than two versions", () => {
    expect(analyzePatternVersions([])).toBeNull();
    expect(
      analyzePatternVersions([
        {
          total_questions: 100,
          total_marks: 100,
          duration_minutes: 60,
          negative_mark: 0,
          section_codes: [],
        },
      ]),
    ).toBeNull();
  });

  it("damps older weights when material shift present", () => {
    const shift = analyzePatternVersions([
      {
        total_questions: 100,
        total_marks: 100,
        duration_minutes: 60,
        negative_mark: 0,
        section_codes: ["A"],
      },
      {
        total_questions: 80,
        total_marks: 80,
        duration_minutes: 60,
        negative_mark: 0,
        section_codes: ["A"],
      },
    ]);
    const damped = applyShiftToWeightTable(DEFAULT_RECENCY_WEIGHTS, shift);
    expect(damped.latest).toBe(DEFAULT_RECENCY_WEIGHTS.latest);
    expect(damped.older).toBeCloseTo(DEFAULT_RECENCY_WEIGHTS.older * 0.35, 5);
  });
});
