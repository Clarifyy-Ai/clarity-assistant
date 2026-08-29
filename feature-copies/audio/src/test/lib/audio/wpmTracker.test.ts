// WPM tracking — covers Audio/Analytics P0 items
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  calculateWPM,
  countWords,
  rateWPM,
  getWPMLabel,
  WPMTracker,
  analyseWPMTrend,
  WPM_RANGES,
} from "@/lib/audio/wpmTracker";

describe("calculateWPM", () => {
  it("returns 0 for zero/negative duration", () => {
    expect(calculateWPM(100, 0)).toBe(0);
    expect(calculateWPM(100, -1)).toBe(0);
  });
  it("returns 0 for zero words", () => {
    expect(calculateWPM(0, 30)).toBe(0);
  });
  it("computes 60 WPM correctly", () => {
    expect(calculateWPM(60, 60)).toBe(60);
    expect(calculateWPM(30, 30)).toBe(60);
  });
  it("rounds to nearest int", () => {
    expect(calculateWPM(100, 33)).toBe(Math.round((100 / 33) * 60));
  });
});

describe("countWords", () => {
  it("handles empty/whitespace", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
  });
  it("counts simple words", () => {
    expect(countWords("hello world")).toBe(2);
  });
  it("handles multiple spaces", () => {
    expect(countWords("a   b   c")).toBe(3);
  });
});

describe("rateWPM", () => {
  it("rates too_slow under 110", () => expect(rateWPM(80)).toBe("too_slow"));
  it("rates ideal in 110-160", () => expect(rateWPM(140)).toBe("ideal"));
  it("rates fast 161-180", () => expect(rateWPM(170)).toBe("fast"));
  it("rates too_fast above 180", () => expect(rateWPM(220)).toBe("too_fast"));
  it("getWPMLabel returns a non-empty string for each rating", () => {
    (["too_slow", "ideal", "fast", "too_fast"] as const).forEach((r) => {
      expect(getWPMLabel(r).length).toBeGreaterThan(0);
    });
  });
});

describe("WPMTracker class", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts on first processText", () => {
    const t = new WPMTracker();
    t.processText("hello world");
    expect(t.getTotalWordCount()).toBe(2);
  });

  it("accumulates word count", () => {
    const t = new WPMTracker();
    t.start();
    t.processText("one two three");
    t.processText("four five");
    expect(t.getTotalWordCount()).toBe(5);
  });

  it("reset() clears state", () => {
    const t = new WPMTracker();
    t.start();
    t.processText("a b c");
    t.reset();
    expect(t.getTotalWordCount()).toBe(0);
    expect(t.getCurrentWPM()).toBe(0);
  });

  it("getCurrentWPM returns 0 when no words", () => {
    const t = new WPMTracker();
    t.start();
    expect(t.getCurrentWPM()).toBe(0);
  });

  it("per-question WPM works", () => {
    const t = new WPMTracker();
    t.startQuestion();
    t.processQuestionText("one two three four");
    vi.advanceTimersByTime(2000); // 2s
    const wpm = t.endQuestion();
    expect(wpm).toBe(120); // 4 words / 2s * 60
  });

  it("calls onUpdate callback", () => {
    const cb = vi.fn();
    const t = new WPMTracker(cb);
    t.start();
    t.processText("hello world");
    expect(cb).toHaveBeenCalled();
  });
});

describe("analyseWPMTrend", () => {
  it("empty returns stable zeros", () => {
    const r = analyseWPMTrend([]);
    expect(r).toEqual({ trend: "stable", avg: 0, min: 0, max: 0, variance: 0 });
  });
  it("computes avg/min/max", () => {
    const r = analyseWPMTrend([
      { timestamp: 1, wpm: 100 },
      { timestamp: 2, wpm: 120 },
      { timestamp: 3, wpm: 140 },
    ]);
    expect(r.avg).toBe(120);
    expect(r.min).toBe(100);
    expect(r.max).toBe(140);
  });
  it("returns stable when delta < 10", () => {
    const r = analyseWPMTrend([
      { timestamp: 1, wpm: 130 },
      { timestamp: 2, wpm: 132 },
      { timestamp: 3, wpm: 131 },
    ]);
    expect(r.trend).toBe("stable");
  });
});

describe("WPM_RANGES constants", () => {
  it("ranges are sensible", () => {
    expect(WPM_RANGES.IDEAL.min).toBe(110);
    expect(WPM_RANGES.IDEAL.max).toBe(160);
    expect(WPM_RANGES.TOO_FAST.max).toBe(Infinity);
  });
});
