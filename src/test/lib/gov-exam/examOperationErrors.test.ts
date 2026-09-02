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

  it("maps LANGUAGE_UNAVAILABLE without leaking internals", () => {
    const err = new ApiClientError({
      message: "psycopg2 traceback",
      status: 409,
      code: "LANGUAGE_UNAVAILABLE",
    });
    expect(formatGovExamOperationError(err)).toMatch(/not available in the selected language/i);
    expect(formatGovExamOperationError(err)).not.toMatch(/psycopg2|traceback/i);
  });

  it("distinguishes PLAN_NOT_ALLOWED from INSUFFICIENT_CREDITS", () => {
    expect(
      formatGovExamOperationError(
        new ApiClientError({ message: "plan", status: 403, code: "PLAN_NOT_ALLOWED" }),
      ),
    ).toMatch(/supported plan/i);
    expect(
      formatGovExamOperationError(
        new ApiClientError({
          message: "credits",
          status: 402,
          code: "INSUFFICIENT_CREDITS",
          details: { balance: 0, cost: 3 },
        }),
      ),
    ).toMatch(/need 3 credits/i);
  });

  it("maps attempt and submission conflicts", () => {
    expect(
      formatGovExamOperationError(
        new ApiClientError({ message: "x", status: 409, code: "ATTEMPT_NOT_STARTED" }),
      ),
    ).toMatch(/start the exam/i);
    expect(
      formatGovExamOperationError(
        new ApiClientError({ message: "x", status: 409, code: "SUBMISSION_CONFLICT" }),
      ),
    ).toMatch(/already submitted/i);
  });

  it("maps remaining user-safe generation and runner codes", () => {
    expect(
      formatGovExamOperationError(
        new ApiClientError({ message: "x", status: 400, code: "INVALID_COUNT" }),
      ),
    ).toMatch(/between 5 and 100/i);
    expect(
      formatGovExamOperationError(
        new ApiClientError({ message: "x", status: 404, code: "NO_RESULTS" }),
      ),
    ).toMatch(/no exams matched/i);
    expect(
      formatGovExamOperationError(
        new ApiClientError({ message: "x", status: 404, code: "JOB_NOT_FOUND" }),
      ),
    ).toMatch(/generation job/i);
    expect(
      formatGovExamOperationError(
        new ApiClientError({ message: "x", status: 503, code: "PYTHON_UNAVAILABLE" }),
      ),
    ).toMatch(/temporarily unavailable/i);
    expect(
      formatGovExamOperationError(
        new ApiClientError({ message: "x", status: 503, code: "AI_UNAVAILABLE" }),
      ),
    ).toMatch(/ai generation is unavailable/i);
    expect(
      formatGovExamOperationError(
        new ApiClientError({ message: "x", status: 409, code: "PAPER_VALIDATION_FAILED" }),
      ),
    ).toMatch(/did not pass validation/i);
    expect(
      formatGovExamOperationError(
        new ApiClientError({ message: "x", status: 409, code: "ATTEMPT_EXPIRED" }),
      ),
    ).toMatch(/time is up/i);
    expect(
      formatGovExamOperationError(
        new ApiClientError({ message: "x", status: 403, code: "REGION_RESTRICTED" }),
      ),
    ).toMatch(/india accounts/i);
    expect(
      formatGovExamOperationError(
        new ApiClientError({ message: "x", status: 409, code: "JOB_TERMINAL_FAILURE" }),
      ),
    ).toMatch(/failed/i);
  });

  it("never renders [object Object] for a plain error payload", () => {
    expect(formatGovExamOperationError({ error: "Python worker failed" })).not.toMatch(
      /\[object Object\]/,
    );
    expect(formatGovExamOperationError({ foo: 1 })).not.toMatch(/\[object Object\]/);
    expect(formatGovExamOperationError({})).toMatch(/try again/i);
  });
});
