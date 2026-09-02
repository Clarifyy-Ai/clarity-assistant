import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ApiClientError } from "@/lib/api/apiClient";

const maybeSingle = vi.fn();
const fetchEdgeJson = vi.fn();

vi.mock("@/lib/network/fetchEdge", () => ({
  fetchEdgeJson: (...args: unknown[]) => fetchEdgeJson(...args),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: (...args: unknown[]) => maybeSingle(...args),
        }),
      }),
    }),
  },
}));

vi.mock("@/lib/network/aiErrorUx", () => ({
  getAiUserFacingError: (err: unknown) =>
    err instanceof Error ? err.message : "Something went wrong. Please try again.",
}));

import {
  pollCompanyResearchJobUntilTerminal,
  startCompanyResearchJob,
  userFacingCompanyBriefError,
  isCompanyBriefTerminal,
  COMPANY_BRIEF_POLL,
} from "@/lib/company/companyResearchJob";

function jobRow(status: string, extras: Record<string, unknown> = {}) {
  return {
    id: "j1",
    status,
    progress_stage: extras.progress_stage ?? status,
    research_id: extras.research_id ?? null,
    brief: extras.brief ?? null,
    source: extras.source ?? null,
    error_code: extras.error_code ?? null,
    error_message: extras.error_message ?? null,
    retryable: extras.retryable ?? true,
    credits_released_at: extras.credits_released_at ?? null,
  };
}

describe("userFacingCompanyBriefError", () => {
  it("maps provider failure to a retryable credit-safe message", () => {
    expect(userFacingCompanyBriefError({ code: "PROVIDER_UNAVAILABLE" })).toMatch(
      /temporarily unavailable/i,
    );
    expect(userFacingCompanyBriefError({ code: "PROVIDER_UNAVAILABLE" })).toMatch(
      /not charged/i,
    );
  });

  it("maps timeout and cancellation", () => {
    expect(userFacingCompanyBriefError({ code: "AI_TIMEOUT" })).toMatch(/timed out/i);
    expect(userFacingCompanyBriefError({ code: "JOB_TIMEOUT" })).toMatch(/timed out/i);
    expect(userFacingCompanyBriefError({ code: "CANCELLED" })).toMatch(/cancelled/i);
    expect(userFacingCompanyBriefError({ code: "POLL_TIMEOUT" })).toMatch(/longer than expected/i);
  });

  it("keeps insufficient-credit copy when the payload includes balances", () => {
    expect(
      userFacingCompanyBriefError(
        new ApiClientError({
          message: "You need 20 credits, but only 2 are available.",
          status: 402,
          code: "INSUFFICIENT_CREDITS",
        }),
      ),
    ).toMatch(/only 2 are available/i);
  });
});

describe("pollCompanyResearchJobUntilTerminal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    maybeSingle.mockReset();
    fetchEdgeJson.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("completes after long provider latency without failing the job", async () => {
    maybeSingle
      .mockResolvedValueOnce({ data: jobRow("queued"), error: null })
      .mockResolvedValueOnce({
        data: jobRow("processing", { progress_stage: "generating" }),
        error: null,
      })
      .mockResolvedValueOnce({
        data: jobRow("completed", {
          research_id: "r1",
          brief: { overview: "Acme builds industrial automation for manufacturers worldwide." },
        }),
        error: null,
      });

    const pending = pollCompanyResearchJobUntilTerminal(
      "j1",
      { jobId: "j1", status: "queued" },
      { shouldAbort: () => false, maxPolls: 10, nudgeAfterPolls: 99 },
    );

    await vi.runAllTimersAsync();
    const result = await pending;
    expect(result.status).toBe("completed");
    expect(result.brief).toBeTruthy();
    expect(isCompanyBriefTerminal(result.status)).toBe(true);
  });

  it("surfaces a retryable poll timeout instead of hanging", async () => {
    maybeSingle.mockResolvedValue({ data: jobRow("processing"), error: null });

    const pending = pollCompanyResearchJobUntilTerminal(
      "j1",
      { jobId: "j1", status: "queued" },
      { shouldAbort: () => false, maxPolls: 3, nudgeAfterPolls: 99 },
    );

    await vi.runAllTimersAsync();
    const result = await pending;
    expect(result.errorCode).toBe("POLL_TIMEOUT");
    expect(result.retryable).toBe(true);
    expect(result.status).toBe("processing");
  });

  it("stops polling on cancellation", async () => {
    maybeSingle.mockResolvedValue({ data: jobRow("processing"), error: null });
    let aborted = false;
    const pending = pollCompanyResearchJobUntilTerminal(
      "j1",
      { jobId: "j1", status: "queued" },
      {
        shouldAbort: () => aborted,
        maxPolls: 20,
        nudgeAfterPolls: 99,
      },
    );

    await vi.advanceTimersByTimeAsync(COMPANY_BRIEF_POLL.startMs);
    aborted = true;
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(result.status).toBe("processing");
    expect(result.errorCode).not.toBe("POLL_TIMEOUT");
  });

  it("nudges process at most once", async () => {
    maybeSingle
      .mockResolvedValueOnce({ data: jobRow("queued"), error: null })
      .mockResolvedValueOnce({ data: jobRow("processing"), error: null })
      .mockResolvedValueOnce({
        data: jobRow("completed", { brief: { overview: "done" }, research_id: "r1" }),
        error: null,
      });
    const nudge = vi.fn().mockResolvedValue(undefined);

    const pending = pollCompanyResearchJobUntilTerminal(
      "j1",
      { jobId: "j1", status: "queued" },
      { shouldAbort: () => false, maxPolls: 10, nudgeAfterPolls: 1, nudge },
    );

    await vi.runAllTimersAsync();
    await pending;
    expect(nudge).toHaveBeenCalledTimes(1);
  });

  it("treats provider failure as a terminal failed job", async () => {
    maybeSingle.mockResolvedValue({
      data: jobRow("failed", {
        error_code: "PROVIDER_UNAVAILABLE",
        error_message: "Company research is temporarily unavailable. Your credits were not charged.",
        credits_released_at: new Date().toISOString(),
      }),
      error: null,
    });

    const pending = pollCompanyResearchJobUntilTerminal(
      "j1",
      { jobId: "j1", status: "queued" },
      { shouldAbort: () => false, maxPolls: 5 },
    );
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(result.status).toBe("failed");
    expect(result.creditsReleased).toBe(true);
  });
});

describe("startCompanyResearchJob idempotency", () => {
  beforeEach(() => {
    fetchEdgeJson.mockReset();
  });

  it("sends a stable force key so duplicate clicks collapse server-side", async () => {
    fetchEdgeJson.mockResolvedValue({
      jobId: "j1",
      status: "queued",
      accepted: true,
      async: true,
    });
    const userId = "11111111-1111-4111-8111-111111111111";
    await startCompanyResearchJob({ company: "Acme Corp", force: true, userId });
    await startCompanyResearchJob({ company: "Acme Corp", force: true, userId });
    const keys = fetchEdgeJson.mock.calls.map(
      (call) => (call[2] as { headers?: Record<string, string> } | undefined)?.headers?.["x-idempotency-key"],
    );
    expect(keys[0]).toBeTruthy();
    expect(keys[0]).toBe(keys[1]);
    expect(String(keys[0])).toContain("company-research:");
    expect(String(keys[0])).toContain("force:");
  });
});
