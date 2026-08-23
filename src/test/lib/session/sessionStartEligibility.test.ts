import { describe, expect, it } from "vitest";
import {
  eligibilityCodeFromLegacy,
  formatDailyLimitMessage,
  httpStatusForEligibilityReason,
  isAuthExpiryReason,
  isCreditsExhaustedReason,
  isDailyLimitReason,
  isPracticeSessionExpired,
  sessionDurationSeconds,
  terminalExplanation,
  terminalTitle,
} from "@/lib/session/sessionStartEligibility";

describe("session_start_eligibility contract", () => {
  it("maps reasons to distinct HTTP statuses", () => {
    expect(httpStatusForEligibilityReason("ALLOWED")).toBe(200);
    expect(httpStatusForEligibilityReason("AUTHENTICATION_REQUIRED")).toBe(401);
    expect(httpStatusForEligibilityReason("ACCOUNT_RESTRICTED")).toBe(403);
    expect(httpStatusForEligibilityReason("CAPABILITY_REQUIRED")).toBe(403);
    expect(httpStatusForEligibilityReason("DAILY_LIMIT_REACHED")).toBe(429);
    expect(httpStatusForEligibilityReason("CREDITS_EXHAUSTED")).toBe(422);
    expect(httpStatusForEligibilityReason("PROVIDER_UNAVAILABLE")).toBe(503);
  });

  it("does not map daily limit or credits to 502", () => {
    expect(httpStatusForEligibilityReason("DAILY_LIMIT_REACHED")).not.toBe(502);
    expect(httpStatusForEligibilityReason("CREDITS_EXHAUSTED")).not.toBe(502);
    expect(httpStatusForEligibilityReason("PROVIDER_UNAVAILABLE")).not.toBe(502);
  });

  it("keeps daily limit and credit exhaustion distinct", () => {
    expect(isDailyLimitReason("FREE_TIER_SESSION_LIMIT")).toBe(true);
    expect(isDailyLimitReason("NO_CREDITS")).toBe(false);
    expect(isCreditsExhaustedReason("NO_CREDITS")).toBe(true);
    expect(eligibilityCodeFromLegacy("daily_session_limit")).toBe("DAILY_LIMIT_REACHED");
  });

  it("formats usage and reset without raw HTTP codes", () => {
    const message = formatDailyLimitMessage({
      used: 3,
      limit: 3,
      reset_at: "2026-08-24T00:00:00.000Z",
    });
    expect(message).toContain("today's session limit");
    expect(message).toContain("3 of 3");
    expect(message).not.toMatch(/502|Bad Gateway|Payment Required/i);
  });
});

describe("session duration and expiry", () => {
  it("uses stored duration and never returns negative", () => {
    expect(sessionDurationSeconds({ duration_seconds: 42 })).toBe(42);
    expect(sessionDurationSeconds({ duration_seconds: -9 })).toBe(0);
    expect(
      sessionDurationSeconds({
        started_at: "2026-08-23T10:00:00.000Z",
        ended_at: "2026-08-23T09:59:00.000Z",
      }),
    ).toBe(0);
    expect(
      sessionDurationSeconds({
        started_at: "2026-08-23T10:00:00.000Z",
        ended_at: "2026-08-23T10:05:00.000Z",
      }),
    ).toBe(300);
  });

  it("treats expires_at as server authority", () => {
    expect(
      isPracticeSessionExpired({
        expires_at: "2026-08-23T10:00:00.000Z",
        nowMs: Date.parse("2026-08-23T10:00:00.000Z"),
      }),
    ).toBe(true);
    expect(
      isPracticeSessionExpired({
        expires_at: "2026-08-23T11:00:00.000Z",
        nowMs: Date.parse("2026-08-23T10:00:00.000Z"),
      }),
    ).toBe(false);
  });

  it("separates auth expiry from practice-session expiry", () => {
    expect(isAuthExpiryReason("AUTH_EXPIRED")).toBe(true);
    expect(isAuthExpiryReason("SESSION_TIMEOUT")).toBe(false);
    expect(terminalTitle("SESSION_TIMEOUT")).toBe("Session expired");
    expect(terminalTitle("AUTH_EXPIRED")).toBe("Signed out");
    expect(terminalExplanation("SESSION_TIMEOUT")).toMatch(/expired/);
    expect(terminalExplanation("AUTH_EXPIRED")).toMatch(/sign-in expired/i);
  });
});
