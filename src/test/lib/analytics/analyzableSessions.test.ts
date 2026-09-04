import { describe, expect, it } from "vitest";
import {
  getAnalyzableSessionIds,
  isAnalyzableSession,
} from "@/lib/analytics/analyzableSessions";

describe("getAnalyzableSessionIds", () => {
  it("returns unscored sessions that have answers", () => {
    expect(
      getAnalyzableSessionIds([
        {
          session_id: "a",
          score_status: "not_scored",
          overall_score: null,
          answered_count: 2,
        },
        {
          session_id: "b",
          score_status: "scored",
          overall_score: 80,
          answered_count: 3,
        },
        {
          session_id: "c",
          score_status: "not_scored",
          overall_score: null,
          answered_count: 0,
        },
        {
          session_id: "d",
          score_status: "not_scored",
          answered_count: 1,
        },
      ]),
    ).toEqual(["a", "d"]);
  });

  it("skips processing placeholders even when a stub score is present", () => {
    expect(
      getAnalyzableSessionIds([
        {
          session_id: "p",
          score_status: "processing",
          overall_score: 0,
          answered_count: 3,
        },
        {
          session_id: "q",
          score_status: "not_scored",
          overall_score: null,
          answered_count: 2,
        },
      ]),
    ).toEqual(["q"]);
  });

  it("treats numeric overall_score as already scored", () => {
    expect(
      isAnalyzableSession({
        session_id: "x",
        score_status: "not_scored",
        overall_score: 72,
        answered_count: 4,
      }),
    ).toBe(false);
  });

  it("returns empty for null/empty input", () => {
    expect(getAnalyzableSessionIds(null)).toEqual([]);
    expect(getAnalyzableSessionIds([])).toEqual([]);
  });
});
