import { describe, expect, it } from "vitest";
import {
  httpStatusForEligibilityReason,
  eligibilityUserMessage,
} from "../../../../supabase/functions/_shared/sessionStartEligibility";

describe("start-session eligibility envelopes", () => {
  const cases = [
    ["ALLOWED", 200],
    ["AUTHENTICATION_REQUIRED", 401],
    ["ACCOUNT_RESTRICTED", 403],
    ["CAPABILITY_REQUIRED", 403],
    ["DAILY_LIMIT_REACHED", 429],
    ["CREDITS_EXHAUSTED", 422],
    ["PROVIDER_UNAVAILABLE", 503],
  ] as const;

  it.each(cases)("%s uses HTTP %s and never 502", (reason, status) => {
    expect(httpStatusForEligibilityReason(reason)).toBe(status);
    expect(httpStatusForEligibilityReason(reason)).not.toBe(502);
  });

  it("daily limit copy includes usage without Payment Required", () => {
    const message = eligibilityUserMessage("DAILY_LIMIT_REACHED", { used: 3, limit: 3 });
    expect(message).toContain("today's session limit");
    expect(message).not.toMatch(/502|Payment Required/i);
  });

  it("credits copy is distinct from daily limit", () => {
    expect(eligibilityUserMessage("CREDITS_EXHAUSTED")).toMatch(/credits/i);
    expect(eligibilityUserMessage("CREDITS_EXHAUSTED")).not.toMatch(/today's session limit/i);
  });
});
