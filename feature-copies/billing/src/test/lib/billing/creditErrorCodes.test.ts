import { describe, expect, it } from "vitest";
import {
  buildCreditDenialDetails,
  classifyCreditFailureMessage,
  creditShortfall,
  httpStatusForCreditCode,
} from "@/lib/billing/creditErrorCodes";

describe("canonical credit error classification", () => {
  it("maps insufficient funds text to INSUFFICIENT_CREDITS", () => {
    expect(classifyCreditFailureMessage("Insufficient credits")).toBe("INSUFFICIENT_CREDITS");
  });

  it("does not treat service outages as payment required", () => {
    expect(classifyCreditFailureMessage("Credit service unavailable.")).toBe(
      "CREDIT_SERVICE_UNAVAILABLE",
    );
    expect(classifyCreditFailureMessage("Could not find the function deduct_credits_service")).toBe(
      "CREDIT_SERVICE_UNAVAILABLE",
    );
    expect(httpStatusForCreditCode("CREDIT_SERVICE_UNAVAILABLE")).toBe(503);
    expect(httpStatusForCreditCode("PROVIDER_UNAVAILABLE")).toBe(503);
    expect(httpStatusForCreditCode("PROVIDER_UNAVAILABLE")).not.toBe(502);
  });

  it("does not treat forbidden RPC errors as insufficient credits", () => {
    expect(classifyCreditFailureMessage("Forbidden")).toBe("ACCOUNT_RESTRICTED");
    expect(httpStatusForCreditCode("ACCOUNT_RESTRICTED")).toBe(403);
  });

  it("honors explicit RPC codes over message text", () => {
    expect(classifyCreditFailureMessage("whatever", "MAX_ATTEMPTS_REACHED")).toBe(
      "MAX_ATTEMPTS_REACHED",
    );
    expect(classifyCreditFailureMessage("conflict", "INVALID_OPERATION")).toBe(
      "INVALID_OPERATION",
    );
    expect(httpStatusForCreditCode("MAX_ATTEMPTS_REACHED")).toBe(429);
    expect(httpStatusForCreditCode("PAYMENT_REQUIRED")).toBe(402);
    expect(httpStatusForCreditCode("INVALID_OPERATION")).toBe(400);
  });

  it("computes shortfall from server balance and cost", () => {
    expect(creditShortfall(3983, 3)).toBe(0);
    expect(creditShortfall(2, 3)).toBe(1);
    const denial = buildCreditDenialDetails({
      code: "INSUFFICIENT_CREDITS",
      balance: 2,
      cost: 3,
    });
    expect(denial.shortfall).toBe(1);
    expect(denial.required).toBe(3);
  });
});
