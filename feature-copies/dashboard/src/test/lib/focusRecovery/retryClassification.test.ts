import { describe, it, expect } from "vitest";
import {
  classifyRequestError,
  shouldRetryRequest,
  isAbortLikeError,
} from "@/lib/focusRecovery/retryClassification";

describe("classifyRequestError", () => {
  it("does not retry aborted requests", () => {
    const err = Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
    expect(isAbortLikeError(err)).toBe(true);
    expect(classifyRequestError(err)).toMatchObject({
      kind: "cancelled",
      retryable: false,
    });
    expect(shouldRetryRequest(err, 0)).toBe(false);
  });

  it("does not retry authentication or authorization failures", () => {
    expect(classifyRequestError(new Error("JWT expired")).kind).toBe("authentication");
    expect(classifyRequestError(new Error("permission denied by row-level security")).kind).toBe(
      "authorization",
    );
    expect(shouldRetryRequest(new Error("JWT expired"), 0)).toBe(false);
  });

  it("does not retry validation or not-found errors", () => {
    expect(classifyRequestError(new Error("invalid input syntax")).kind).toBe("validation");
    expect(classifyRequestError({ status: 404, message: "not found" }).kind).toBe("not_found");
  });

  it("retries a bounded number of network and 503 failures", () => {
    expect(classifyRequestError(new Error("Failed to fetch"))).toMatchObject({
      kind: "network",
      retryable: true,
      maxRetries: 1,
    });
    expect(shouldRetryRequest(new Error("Failed to fetch"), 0)).toBe(true);
    expect(shouldRetryRequest(new Error("Failed to fetch"), 1)).toBe(false);
    expect(classifyRequestError({ status: 503, message: "service unavailable" }).kind).toBe(
      "infrastructure",
    );
  });

  it("retries rate limits once", () => {
    expect(classifyRequestError({ status: 429, message: "too many requests" })).toMatchObject({
      kind: "rate_limited",
      retryable: true,
      maxRetries: 1,
    });
  });
});
