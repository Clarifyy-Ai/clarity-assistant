import { describe, expect, it } from "vitest";
import { ApiClientError } from "@/lib/api/apiClient";
import { normalizeSessionLifecycleError } from "@/lib/session/sessionLifecycle";

describe("normalizeSessionLifecycleError", () => {
  it("preserves ApiClientError instances", () => {
    const err = new ApiClientError({
      message: "Daily limit",
      status: 429,
      code: "DAILY_LIMIT_REACHED",
    });
    expect(normalizeSessionLifecycleError(err)).toBe(err);
  });

  it("maps expired session messages to SESSION_EXPIRED", () => {
    const err = normalizeSessionLifecycleError(
      new Error("This session expired after 24 hours; please start a new one."),
    );
    expect(err).toBeInstanceOf(ApiClientError);
    expect((err as ApiClientError).code).toBe("SESSION_EXPIRED");
    expect((err as ApiClientError).status).toBe(409);
  });

  it("maps inactive session messages to SESSION_NOT_AVAILABLE", () => {
    const err = normalizeSessionLifecycleError(
      new Error("This practice session is no longer active."),
    );
    expect((err as ApiClientError).code).toBe("SESSION_NOT_AVAILABLE");
  });

  it("maps timeout messages to DEPENDENCY_UNAVAILABLE", () => {
    const err = normalizeSessionLifecycleError(
      new Error("Session lookup timed out. Check your connection and retry."),
    );
    expect((err as ApiClientError).code).toBe("DEPENDENCY_UNAVAILABLE");
    expect((err as ApiClientError).status).toBe(503);
  });
});
