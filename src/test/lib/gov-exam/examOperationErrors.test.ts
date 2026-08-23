import { describe, expect, it } from "vitest";
import { ApiClientError } from "@/lib/api/apiClient";
import { formatGovExamOperationError } from "@/lib/gov-exam/examOperationErrors";

describe("gov exam operation error mapping", () => {
  it("renders server-authoritative insufficient credit details", () => {
    const err = new ApiClientError({
      message: "Insufficient credits",
      status: 402,
      code: "INSUFFICIENT_CREDITS",
      details: { balance: 2, cost: 3, required: 3, shortfall: 1 },
    });
    expect(formatGovExamOperationError(err)).toBe("You need 3 credits, but only 2 are available.");
  });

  it("does not show Payment Required for a max-attempt error", () => {
    const err = new ApiClientError({
      message: "limit",
      status: 429,
      code: "MAX_ATTEMPTS_REACHED",
      details: { current: 3, limit: 3, resetAt: "2026-09-01T00:00:00.000Z" },
    });
    expect(formatGovExamOperationError(err)).toMatch(/attempt limit/i);
    expect(formatGovExamOperationError(err)).not.toMatch(/payment required|HTTP 429|402/i);
  });

  it("maps inventory shortage to the available count", () => {
    const err = new ApiClientError({
      message: "short",
      status: 409,
      code: "QUESTION_INVENTORY_INSUFFICIENT",
      details: { available: 23, requested: 100 },
    });
    expect(formatGovExamOperationError(err)).toBe(
      "Only 23 approved questions are available. Try Custom Practice Set.",
    );
  });

  it("hides raw HTTP status codes", () => {
    const err = new ApiClientError({
      message: "Request failed (HTTP 402). Please try again.",
      status: 402,
      code: "API_ERROR",
    });
    const msg = formatGovExamOperationError(err);
    expect(msg).not.toMatch(/HTTP 402|503|PostgREST|SQL/i);
  });
});
