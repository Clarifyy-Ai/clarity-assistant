import { describe, expect, it } from "vitest";
import { ApiClientError } from "@/lib/api/apiClient";
import {
  getAiUserFacingError,
  isAiProviderUnavailableError,
  isInsufficientCreditsError,
} from "@/lib/network/aiErrorUx";
import { createIdempotencyKey } from "@/lib/api/functions";

describe("Practice Coach AI Help error separation [T-12]", () => {
  it("maps provider 502 to unavailable, not insufficient credits", () => {
    const err = new ApiClientError({
      message: "AI Help is temporarily unavailable. Please try again.",
      status: 502,
      code: "PROVIDER_UNAVAILABLE",
    });
    expect(isInsufficientCreditsError(err)).toBe(false);
    expect(isAiProviderUnavailableError(err)).toBe(true);
    expect(getAiUserFacingError(err)).toMatch(/temporarily unavailable/i);
  });

  it("keeps true 402 as insufficient credits", () => {
    const err = new ApiClientError({
      message: "Need credits",
      status: 402,
      code: "INSUFFICIENT_CREDITS",
    });
    expect(isInsufficientCreditsError(err)).toBe(true);
    expect(isAiProviderUnavailableError(err)).toBe(false);
  });

  it("does not treat CREDIT_SERVICE_UNAVAILABLE as out of credits", () => {
    const err = new ApiClientError({
      message: "Credit service down",
      status: 503,
      code: "CREDIT_SERVICE_UNAVAILABLE",
    });
    expect(isInsufficientCreditsError(err)).toBe(false);
  });

  it("creates stable-length idempotency keys for generate-answer", () => {
    const key = createIdempotencyKey("generate-answer");
    expect(key.startsWith("generate-answer:")).toBe(true);
    expect(key.length).toBeGreaterThanOrEqual(16);
  });
});
