import { describe, expect, it } from "vitest";
import { ApiClientError } from "@/lib/api/apiClient";
import {
  isSessionLimitError,
  SESSION_LIMIT_ERROR_CODES,
} from "@/lib/billing/sessionStartErrors";

describe("session start errors", () => {
  it("recognizes server daily-limit codes and messages", () => {
    expect(isSessionLimitError(new ApiClientError({
      message: "Daily limit reached",
      status: 429,
      code: "FREE_TIER_SESSION_LIMIT",
    }))).toBe(true);
    expect(isSessionLimitError(new Error("You have reached the sessions per day limit"))).toBe(true);
    expect(isSessionLimitError(new Error("Could not start session"))).toBe(false);
    expect(SESSION_LIMIT_ERROR_CODES.has("daily_session_limit")).toBe(true);
  });
});
