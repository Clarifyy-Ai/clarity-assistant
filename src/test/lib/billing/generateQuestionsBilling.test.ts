import { describe, expect, it } from "vitest";
import { resolveGenerateQuestionsCreditChargeFromContext } from "@/lib/billing/generateQuestionsBilling";

describe("generateQuestionsBilling", () => {
  const COST = 12;

  it("charges when no session context", () => {
    expect(
      resolveGenerateQuestionsCreditChargeFromContext(
        { sessionType: null, hasMockSessionPayment: false },
        COST,
      ),
    ).toEqual({ creditCharge: 12, reason: "no_session" });
  });

  it("allows free generation for warmup sessions", () => {
    expect(
      resolveGenerateQuestionsCreditChargeFromContext(
        { sessionType: "warmup", hasMockSessionPayment: false },
        COST,
      ),
    ).toEqual({ creditCharge: 0, reason: "warmup_session" });
  });

  it("allows free generation for prepaid mock sessions", () => {
    expect(
      resolveGenerateQuestionsCreditChargeFromContext(
        { sessionType: "mock", hasMockSessionPayment: true },
        COST,
      ),
    ).toEqual({ creditCharge: 0, reason: "mock_session_prepaid" });
  });

  it("charges unpaid mock sessions per question", () => {
    expect(
      resolveGenerateQuestionsCreditChargeFromContext(
        { sessionType: "mock", hasMockSessionPayment: false },
        COST,
      ),
    ).toEqual({ creditCharge: 12, reason: "mock_unpaid" });
  });

  it("charges live and rehearsal sessions per question", () => {
    expect(
      resolveGenerateQuestionsCreditChargeFromContext(
        { sessionType: "rehearsal", hasMockSessionPayment: false },
        COST,
      ),
    ).toEqual({ creditCharge: 12, reason: "default_paid" });
  });
});
