import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ApiClientError } from "@/lib/api/apiClient";

vi.mock("@/lib/debug/debugLog4a9592", () => ({
  debugLog4a9592: () => undefined,
}));

const getPaperGenerationJob = vi.fn();
vi.mock("@/lib/gov-exam/api", () => ({
  getPaperGenerationJob: (...args: unknown[]) => getPaperGenerationJob(...args),
}));

import { pollPaperJobUntilTerminal } from "@/lib/gov-exam/pollPaperJob";

describe("pollPaperJobUntilTerminal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getPaperGenerationJob.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not fail the job on the first 429; continues until completed", async () => {
    getPaperGenerationJob
      .mockRejectedValueOnce(
        new ApiClientError({
          message: "Rate limit exceeded.",
          status: 429,
          code: "RATE_LIMITED",
          details: { retryAfterSeconds: 1 },
        }),
      )
      .mockResolvedValueOnce({
        jobId: "11111111-1111-1111-1111-111111111111",
        status: "completed",
        mockTestId: "mt-1",
      });

    const jobs: string[] = [];
    const pending = pollPaperJobUntilTerminal(
      "11111111-1111-1111-1111-111111111111",
      { jobId: "11111111-1111-1111-1111-111111111111", status: "queued" },
      {
        setJob: (job) => jobs.push(job.status),
        shouldAbort: () => false,
        maxPolls: 5,
      },
    );

    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result.status).toBe("completed");
    expect(result.mockTestId).toBe("mt-1");
    expect(jobs).toContain("completed");
    expect(jobs).not.toContain("failed_retryable");
  });

  it("backs off on 502 and completes without throwing", async () => {
    getPaperGenerationJob
      .mockRejectedValueOnce(
        new ApiClientError({
          message: "Bad gateway",
          status: 502,
          code: "BAD_GATEWAY",
        }),
      )
      .mockResolvedValueOnce({
        jobId: "11111111-1111-1111-1111-111111111111",
        status: "completed",
        mockTestId: "mt-2",
      });

    const pending = pollPaperJobUntilTerminal(
      "11111111-1111-1111-1111-111111111111",
      { jobId: "11111111-1111-1111-1111-111111111111", status: "queued" },
      {
        setJob: () => undefined,
        shouldAbort: () => false,
        maxPolls: 5,
      },
    );

    await vi.runAllTimersAsync();
    const result = await pending;
    expect(result.status).toBe("completed");
  });

  it("stops polling after bounded 429s and surfaces failed_retryable", async () => {
    getPaperGenerationJob.mockRejectedValue(
      new ApiClientError({
        message: "Rate limit exceeded.",
        status: 429,
        code: "RATE_LIMITED",
        details: { retryAfterSeconds: 1 },
      }),
    );

    const pending = pollPaperJobUntilTerminal(
      "11111111-1111-1111-1111-111111111111",
      { jobId: "11111111-1111-1111-1111-111111111111", status: "queued" },
      {
        setJob: () => undefined,
        shouldAbort: () => false,
        maxPolls: 20,
      },
    );

    await vi.runAllTimersAsync();
    const result = await pending;
    expect(result.status).toBe("failed_retryable");
    expect(result.errorCode).toBe("RATE_LIMITED");
    expect(getPaperGenerationJob.mock.calls.length).toBeLessThanOrEqual(8);
  });

  it("nudges process-paper-generation-job at most once", async () => {
    getPaperGenerationJob
      .mockResolvedValueOnce({
        jobId: "11111111-1111-1111-1111-111111111111",
        status: "queued",
      })
      .mockResolvedValueOnce({
        jobId: "11111111-1111-1111-1111-111111111111",
        status: "selecting",
      })
      .mockResolvedValueOnce({
        jobId: "11111111-1111-1111-1111-111111111111",
        status: "completed",
        mockTestId: "mt-nudge",
      });

    const nudge = vi.fn().mockResolvedValue(undefined);
    const pending = pollPaperJobUntilTerminal(
      "11111111-1111-1111-1111-111111111111",
      { jobId: "11111111-1111-1111-1111-111111111111", status: "queued" },
      {
        setJob: () => undefined,
        shouldAbort: () => false,
        maxPolls: 10,
        nudgeAfterPolls: 1,
        nudge,
      },
    );

    await vi.runAllTimersAsync();
    const result = await pending;
    expect(result.status).toBe("completed");
    expect(nudge).toHaveBeenCalledTimes(1);
  });

  it("treats 409 as in-flight and continues until completed", async () => {
    getPaperGenerationJob
      .mockRejectedValueOnce(
        new ApiClientError({
          message: "Conflict",
          status: 409,
          code: "GENERATION_CONFLICT",
        }),
      )
      .mockResolvedValueOnce({
        jobId: "11111111-1111-1111-1111-111111111111",
        status: "completed",
        mockTestId: "mt-409",
      });

    const pending = pollPaperJobUntilTerminal(
      "11111111-1111-1111-1111-111111111111",
      { jobId: "11111111-1111-1111-1111-111111111111", status: "queued" },
      {
        setJob: () => undefined,
        shouldAbort: () => false,
        maxPolls: 5,
      },
    );

    await vi.runAllTimersAsync();
    const result = await pending;
    expect(result.status).toBe("completed");
  });

  it("does not poll when the seed job is already terminal", async () => {
    const pending = pollPaperJobUntilTerminal(
      "11111111-1111-1111-1111-111111111111",
      {
        jobId: "11111111-1111-1111-1111-111111111111",
        status: "failed_retryable",
        errorCode: "CONTENT_INSUFFICIENT",
      },
      {
        setJob: () => undefined,
        shouldAbort: () => false,
        maxPolls: 5,
      },
    );

    await vi.runAllTimersAsync();
    const result = await pending;
    expect(result.status).toBe("failed_retryable");
    expect(getPaperGenerationJob).not.toHaveBeenCalled();
  });

  it("treats 404 as failed_retryable and stops polling", async () => {
    getPaperGenerationJob.mockRejectedValue(
      new ApiClientError({
        message: "Job not found",
        status: 404,
        code: "PAPER_NOT_FOUND",
      }),
    );

    const pending = pollPaperJobUntilTerminal(
      "11111111-1111-1111-1111-111111111111",
      { jobId: "11111111-1111-1111-1111-111111111111", status: "queued" },
      {
        setJob: () => undefined,
        shouldAbort: () => false,
        maxPolls: 5,
      },
    );

    await vi.runAllTimersAsync();
    const result = await pending;
    expect(result.status).toBe("failed_retryable");
    expect(result.errorCode).toBe("PAPER_NOT_FOUND");
    expect(getPaperGenerationJob).toHaveBeenCalledTimes(1);
  });

  it("stops after wall-clock timeout with GENERATION_POLL_TIMEOUT", async () => {
    getPaperGenerationJob.mockResolvedValue({
      jobId: "11111111-1111-1111-1111-111111111111",
      status: "generating",
    });

    const pending = pollPaperJobUntilTerminal(
      "11111111-1111-1111-1111-111111111111",
      { jobId: "11111111-1111-1111-1111-111111111111", status: "queued" },
      {
        setJob: () => undefined,
        shouldAbort: () => false,
        maxPolls: 100,
        maxWallClockMs: 1_000,
      },
    );

    await vi.runAllTimersAsync();
    const result = await pending;
    expect(result.status).toBe("failed_retryable");
    expect(result.errorCode).toBe("GENERATION_POLL_TIMEOUT");
  });

  it("stops after max polls with GENERATION_POLL_TIMEOUT", async () => {
    getPaperGenerationJob.mockResolvedValue({
      jobId: "11111111-1111-1111-1111-111111111111",
      status: "generating",
    });

    const pending = pollPaperJobUntilTerminal(
      "11111111-1111-1111-1111-111111111111",
      { jobId: "11111111-1111-1111-1111-111111111111", status: "queued" },
      {
        setJob: () => undefined,
        shouldAbort: () => false,
        maxPolls: 2,
        maxWallClockMs: 600_000,
      },
    );

    await vi.runAllTimersAsync();
    const result = await pending;
    expect(result.status).toBe("failed_retryable");
    expect(result.errorCode).toBe("GENERATION_POLL_TIMEOUT");
  });
});
