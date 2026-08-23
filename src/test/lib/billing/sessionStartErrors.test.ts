import { describe, expect, it } from "vitest";
import { ApiClientError } from "@/lib/api/apiClient";
import {
  handleSessionStartError,
  isSessionLimitError,
  SESSION_LIMIT_ERROR_CODES,
} from "@/lib/billing/sessionStartErrors";
import { useUIStore } from "@/store/uiStore";

describe("session start errors", () => {
  it("recognizes server daily-limit codes and messages", () => {
    expect(isSessionLimitError(new ApiClientError({
      message: "Daily limit reached",
      status: 429,
      code: "FREE_TIER_SESSION_LIMIT",
    }))).toBe(true);
    expect(isSessionLimitError(new ApiClientError({
      message: "You've reached today's session limit.",
      status: 429,
      code: "DAILY_LIMIT_REACHED",
    }))).toBe(true);
    expect(isSessionLimitError(new Error("You have reached the sessions per day limit"))).toBe(true);
    expect(isSessionLimitError(new Error("Could not start session"))).toBe(false);
    expect(SESSION_LIMIT_ERROR_CODES.has("daily_session_limit")).toBe(true);
  });

  it("handles 502 start failures without showing Bad Gateway as the product state", () => {
    const err = new ApiClientError({
      message: "Bad Gateway",
      status: 502,
      code: "INTERNAL_ERROR",
    });
    expect(handleSessionStartError(err)).toBe(true);
  });

  it("opens upgrade for credits separately from daily limit", () => {
    useUIStore.setState({ upgradeModalOpen: false, upgradeModalReason: null } as never);
    const handled = handleSessionStartError(new ApiClientError({
      message: "You have no credits remaining.",
      status: 422,
      code: "CREDITS_EXHAUSTED",
    }));
    expect(handled).toBe(true);
    expect(isSessionLimitError(new ApiClientError({
      message: "You have no credits remaining.",
      status: 422,
      code: "CREDITS_EXHAUSTED",
    }))).toBe(false);
  });
});
