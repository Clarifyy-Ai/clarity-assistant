import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchEdgeJson = vi.fn();

vi.mock("@/lib/network/fetchEdge", () => ({
  fetchEdgeJson: (...args: unknown[]) => fetchEdgeJson(...args),
}));

const {
  searchGovExams,
  isSearchUnavailableError,
  mapGovSearchError,
} = await import("@/lib/gov-exam/api");

const EXAM = {
  resultType: "official_exam" as const,
  examId: "exam-1",
  code: "SSC_CGL",
  name: "SSC Combined Graduate Level",
  family: "ssc",
  description: null,
  legacyExamType: null,
  recruitingBody: null,
  aliases: [],
  stages: [],
  pattern: null,
  languages: [],
  lastVerified: null,
  primaryActions: [] as readonly string[],
};

describe("searchGovExams", () => {
  beforeEach(() => {
    fetchEdgeJson.mockReset();
  });

  it("treats zero matches as a successful empty result, not an error", async () => {
    fetchEdgeJson.mockResolvedValue({
      success: true,
      results: [],
      count: 0,
      pagination: { page: 1, pageSize: 20, total: 0 },
      disclaimer: "d",
    });

    const res = await searchGovExams({ q: "no-such-exam" });

    expect(res.success).toBe(true);
    expect(res.results).toEqual([]);
    expect(res.count).toBe(0);
    expect(res.pagination.total).toBe(0);
  });

  it("returns the matching exams on a hit", async () => {
    fetchEdgeJson.mockResolvedValue({
      success: true,
      results: [EXAM],
      count: 1,
      pagination: { page: 2, pageSize: 20, total: 21 },
    });

    const res = await searchGovExams({ q: "ssc", page: 2 });

    expect(res.results).toHaveLength(1);
    expect(res.results[0].examId).toBe("exam-1");
    expect(res.pagination).toMatchObject({ page: 2, pageSize: 20, total: 21 });
    expect(res.pagination.hasMore).toBe(false);
    expect(res.pagination.nextCursor).toBe(null);
  });

  it("throws a coded unavailable error when the service reports failure", async () => {
    fetchEdgeJson.mockResolvedValue({
      success: false,
      code: "SEARCH_SERVICE_UNAVAILABLE",
      error: "Exam search is temporarily unavailable. Please try again.",
    });

    await expect(searchGovExams({ q: "ssc" })).rejects.toMatchObject({
      code: "SEARCH_SERVICE_UNAVAILABLE",
    });

    const err = await searchGovExams({ q: "ssc" }).catch((e) => e);
    expect(isSearchUnavailableError(err)).toBe(true);
    expect(mapGovSearchError(err)).toEqual({
      code: "SEARCH_UNAVAILABLE",
      message: "Exam search is temporarily unavailable. Please try again.",
    });
  });

  it("never reports an unavailable service as an empty result set", async () => {
    fetchEdgeJson.mockResolvedValue({ success: false, code: "SEARCH_SERVICE_UNAVAILABLE" });

    const err = await searchGovExams({}).catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { results?: unknown }).results).toBeUndefined();
  });

  it("backfills pagination when an older deployment omits it", async () => {
    fetchEdgeJson.mockResolvedValue({ success: true, results: [EXAM] });

    const res = await searchGovExams({ pageSize: 40 });

    expect(res.pagination).toMatchObject({ page: 1, pageSize: 40, total: 1 });
    expect(res.pagination.hasMore).toBe(false);
    expect(res.pagination.nextCursor).toBe(null);
  });

  it("forwards query, family and pagination to the edge function", async () => {
    fetchEdgeJson.mockResolvedValue({ success: true, results: [], count: 0 });
    const signal = new AbortController().signal;

    await searchGovExams({ q: "  ", family: "banking", page: 3, pageSize: 40 }, { signal });

    expect(fetchEdgeJson).toHaveBeenCalledWith(
      "search-exams",
      { q: "  ", family: "banking", page: 3, pageSize: 40, cursor: undefined },
      { signal, timeoutMs: 45_000 },
    );
  });
});

describe("search error code mapping", () => {
  it("accepts the legacy SERVICE_UNAVAILABLE alias", () => {
    expect(isSearchUnavailableError({ code: "SERVICE_UNAVAILABLE" })).toBe(true);
    expect(isSearchUnavailableError({ code: "SEARCH_UNAVAILABLE" })).toBe(true);
    expect(isSearchUnavailableError({ code: "PROVIDER_UNAVAILABLE" })).toBe(true);
  });

  it("does not treat unrelated failures as unavailable", () => {
    expect(isSearchUnavailableError({ code: "VALIDATION_ERROR" })).toBe(false);
    expect(isSearchUnavailableError(new Error("boom"))).toBe(false);
    expect(isSearchUnavailableError(null)).toBe(false);
  });

  it("maps rate limiting and validation separately from unavailability", () => {
    expect(mapGovSearchError({ code: "RATE_LIMITED" }).code).toBe("RATE_LIMITED");
    expect(mapGovSearchError({ code: "VALIDATION_ERROR" }).code).toBe("INVALID_QUERY");
    expect(mapGovSearchError(new Error("boom")).code).toBe("SEARCH_FAILED");
  });
});
