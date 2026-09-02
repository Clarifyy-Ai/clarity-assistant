import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api/apiClient";

const mockGetSession = vi.fn();
const mockFetchEdgeJson = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

vi.mock("@/lib/network/fetchEdge", () => ({
  fetchEdgeJson: (...args: unknown[]) => mockFetchEdgeJson(...args),
}));

const baseConfig = {
  exam_type: "CUSTOM",
  test_name: "Quick Drill",
  source_types: ["OFFICIAL_PYP"],
  difficulty_distribution: { EASY: 30, MEDIUM: 50, HARD: 20 },
  question_count: 10,
  duration_minutes: 10,
  marks_positive: 4,
  marks_negative: 1,
  quick_drill: true,
  allow_ai_fill: true,
};

describe("launchMockTest — select-test-questions inventory errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "token" } },
    });
  });

  it("maps legacy 422 inventory shortage to an honest available-count message", async () => {
    mockFetchEdgeJson.mockRejectedValueOnce(
      new ApiClientError({
        message: "Only 0 of 10 questions are available after bank + AI fill.",
        status: 422,
        code: "INSUFFICIENT_APPROVED_QUESTIONS",
        details: { available: 0, requested: 10, required: 10, question_ids: [] },
      }),
    );

    const { launchMockTest } = await import("@/lib/mock-test/launchMockTest");
    await expect(launchMockTest(baseConfig)).rejects.toThrow(
      /Only 0 approved questions are available/i,
    );
    expect(mockFetchEdgeJson).toHaveBeenCalledWith(
      "select-test-questions",
      expect.objectContaining({
        config: expect.objectContaining({
          question_count: 10,
          quick_drill: true,
          allow_ai_fill: true,
        }),
      }),
      expect.anything(),
    );
  });

  it("maps canonical 409 QUESTION_INVENTORY_INSUFFICIENT to an honest message", async () => {
    mockFetchEdgeJson.mockRejectedValueOnce(
      new ApiClientError({
        message: "Only 3 of 10 questions are available after bank + AI fill.",
        status: 409,
        code: "QUESTION_INVENTORY_INSUFFICIENT",
        details: { available: 3, requested: 10, question_ids: ["q1", "q2", "q3"] },
      }),
    );

    const { launchMockTest } = await import("@/lib/mock-test/launchMockTest");
    await expect(launchMockTest(baseConfig)).rejects.toThrow(
      /Only 3 approved questions are available/i,
    );
    expect(mockFetchEdgeJson).toHaveBeenCalledTimes(1);
  });

  it("fail-closes on 200 with zero question_ids instead of creating an empty test", async () => {
    mockFetchEdgeJson.mockResolvedValueOnce({
      question_ids: [],
      count: 0,
      error: "Only 0 of 10 questions are available after bank + AI fill.",
      code: "QUESTION_INVENTORY_INSUFFICIENT",
      available: 0,
      requested: 10,
      gap_fill_failed: true,
    });

    const { launchMockTest } = await import("@/lib/mock-test/launchMockTest");
    await expect(launchMockTest(baseConfig)).rejects.toThrow(
      /Only 0 approved questions are available/i,
    );
    expect(mockFetchEdgeJson).toHaveBeenCalledTimes(1);
  });

  it("fail-closes Quick Drill when bank + AI fill returns a short list", async () => {
    mockFetchEdgeJson.mockResolvedValueOnce({
      question_ids: ["q1", "q2", "q3", "q4"],
      count: 4,
      error: "Only 4 of 10 questions are available after bank + AI fill.",
      code: "QUESTION_INVENTORY_INSUFFICIENT",
      available: 4,
      requested: 10,
      gap_fill_failed: true,
    });

    const { launchMockTest } = await import("@/lib/mock-test/launchMockTest");
    await expect(launchMockTest(baseConfig)).rejects.toThrow(
      /Only 4 approved questions are available/i,
    );
    expect(mockFetchEdgeJson).toHaveBeenCalledTimes(1);
  });

  it("launches when the selector returns 10 ids", async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `q${i + 1}`);
    mockFetchEdgeJson
      .mockResolvedValueOnce({
        question_ids: ids,
        count: 10,
        ai_generated_count: 6,
      })
      .mockResolvedValueOnce({ test_id: "test-1" });

    const { launchMockTest } = await import("@/lib/mock-test/launchMockTest");
    const result = await launchMockTest(baseConfig);
    expect(result).toEqual({
      test_id: "test-1",
      question_count: 10,
      warning: undefined,
      ai_generated_count: 6,
    });
  });
});

describe("Quick Drill client wiring", () => {
  it("TestConfigure sends quick_drill and optional AI fill on the 10-question request", () => {
    const src = readFileSync(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../pages/app/mock-test/TestConfigure.tsx",
      ),
      "utf8",
    );
    expect(src).toContain("quick_drill: isQuick");
    expect(src).toContain("allow_ai_fill: isQuick && canUseAiQuestions");
    expect(src).toContain("question_count: isQuick ? 10 : 30");
  });
});
