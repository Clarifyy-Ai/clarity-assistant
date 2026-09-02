import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api/apiClient";

const fetchEdgeJson = vi.fn();

vi.mock("@/lib/network/fetchEdge", () => ({
  fetchEdgeJson: (...args: unknown[]) => fetchEdgeJson(...args),
}));

import {
  pollDocumentJobUntilDone,
  shouldFallbackToSyncParse,
} from "@/lib/documents/processingJobs";

describe("library job poll timeout", () => {
  afterEach(() => {
    fetchEdgeJson.mockReset();
  });

  it("returns PARSER_TIMEOUT without rewriting in-flight status to failed", async () => {
    fetchEdgeJson.mockResolvedValue({
      success: true,
      job: { id: "job-1", status: "extracting", error_code: null },
    });
    const job = await pollDocumentJobUntilDone("job-1", { intervalMs: 5, timeoutMs: 18 });
    expect(job?.status).toBe("extracting");
    expect(job?.error_code).toBe("PARSER_TIMEOUT");
    expect(job?.retryable).toBe(true);
  });

  it("does not treat poll timeout as a reason to create a second parse charge", () => {
    const timeout = new Error("Document parsing timed out. You can retry.");
    expect(shouldFallbackToSyncParse(timeout, { jobId: "job-1" })).toBe(false);
    expect(
      shouldFallbackToSyncParse(
        new ApiClientError({ message: "unavailable", status: 503, code: "PYTHON_UNAVAILABLE" }),
        { jobId: "job-1" },
      ),
    ).toBe(true);
  });
});
