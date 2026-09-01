import { describe, it, expect, vi } from "vitest";
import {
  getOrLoadPaperTrends,
  paperTrendsCacheKey,
} from "@/lib/gov-exam/paperTrendsCache";

describe("paperTrendsCache", () => {
  it("keys by exam, stage, and years", () => {
    expect(paperTrendsCacheKey("e1", "s1", [2024, 2023])).toBe("e1|s1|2024,2023");
    expect(paperTrendsCacheKey("e1", "s1", [2024, 2023])).not.toBe(
      paperTrendsCacheKey("e1", "s1", [2023, 2022]),
    );
  });

  it("reuses the cached result and shares in-flight loads", async () => {
    const cache = new Map<string, { n: number }>();
    const inflight = new Map<string, Promise<{ n: number }>>();
    const load = vi.fn(async () => ({ n: 1 }));
    const key = paperTrendsCacheKey("exam", "stage", [2024]);

    const [a, b] = await Promise.all([
      getOrLoadPaperTrends(cache, inflight, key, load),
      getOrLoadPaperTrends(cache, inflight, key, load),
    ]);
    expect(a).toEqual({ n: 1 });
    expect(b).toEqual({ n: 1 });
    expect(load).toHaveBeenCalledTimes(1);

    const c = await getOrLoadPaperTrends(cache, inflight, key, load);
    expect(c).toEqual({ n: 1 });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed load", async () => {
    const cache = new Map<string, { n: number }>();
    const inflight = new Map<string, Promise<{ n: number }>>();
    const load = vi
      .fn<() => Promise<{ n: number }>>()
      .mockRejectedValueOnce(new Error("edge down"))
      .mockResolvedValueOnce({ n: 2 });
    const key = paperTrendsCacheKey("exam", "stage", [2024]);

    await expect(getOrLoadPaperTrends(cache, inflight, key, load)).rejects.toThrow(
      "edge down",
    );
    await expect(getOrLoadPaperTrends(cache, inflight, key, load)).resolves.toEqual({
      n: 2,
    });
    expect(load).toHaveBeenCalledTimes(2);
  });
});
