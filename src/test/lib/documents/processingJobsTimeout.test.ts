import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api/apiClient";

const fetchEdgeJson = vi.fn();

vi.mock("@/lib/network/fetchEdge", () => ({
  fetchEdgeJson: (...args: unknown[]) => fetchEdgeJson(...args),
}));

import {
  DOCUMENT_JOB_SOFT_WAIT_MS,
  isClientWaitElapsed,
  pollDocumentJobUntilDone,
  shouldFallbackToSyncParse,
} from "@/lib/documents/processingJobs";
import { DOCUMENT_ERROR_CODES, DOCUMENT_FAILURE_MESSAGES } from "@/lib/documents/documentFailure";

describe("library job poll soft wait", () => {
  afterEach(() => {
    fetchEdgeJson.mockReset();
  });

  it("returns CLIENT_WAIT_ELAPSED without rewriting in-flight status to failed", async () => {
    fetchEdgeJson.mockResolvedValue({
      success: true,
      job: { id: "job-1", status: "extracting", error_code: null },
    });
    const job = await pollDocumentJobUntilDone("job-1", { intervalMs: 5, timeoutMs: 18 });
    expect(job?.status).toBe("extracting");
    expect(job?.error_code).toBe(DOCUMENT_ERROR_CODES.CLIENT_WAIT_ELAPSED);
    expect(job?.retryable).toBe(false);
    expect(isClientWaitElapsed(job)).toBe(true);
    expect(isClientWaitElapsed({ status: "failed_retryable", error_code: "PARSER_TIMEOUT" })).toBe(
      false,
    );
  });

  it("treats legacy in-flight PARSER_TIMEOUT as client wait elapsed", () => {
    expect(
      isClientWaitElapsed({ status: "OCR", error_code: "PARSER_TIMEOUT" }),
    ).toBe(true);
    expect(DOCUMENT_FAILURE_MESSAGES.CLIENT_WAIT_ELAPSED).toMatch(/still processing/i);
  });

  it("defaults soft wait above worker lease (180s)", () => {
    expect(DOCUMENT_JOB_SOFT_WAIT_MS).toBeGreaterThanOrEqual(180_000);
  });

  it("does not treat soft wait as a reason to create a second parse charge", () => {
    const soft = new Error("Still processing — refresh to check progress. No extra charge.");
    expect(shouldFallbackToSyncParse(soft, { jobId: "job-1" })).toBe(false);
    expect(shouldFallbackToSyncParse(new Error("CLIENT_WAIT_ELAPSED"), { jobId: "job-1" })).toBe(
      false,
    );
    expect(
      shouldFallbackToSyncParse(
        new ApiClientError({ message: "unavailable", status: 503, code: "PYTHON_UNAVAILABLE" }),
        { jobId: "job-1" },
      ),
    ).toBe(true);
  });
});
