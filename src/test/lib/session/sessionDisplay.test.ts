import { describe, expect, it } from "vitest";
import {
  formatSessionDuration,
  resolveOverallScore,
  sessionStatusLabel,
} from "@/lib/session/sessionDisplay";
import {
  messageFromDeleteAccountResponse,
  shouldSkipDeleteReplayRateLimit,
} from "@/lib/account/deleteAccountErrors";

describe("formatSessionDuration", () => {
  it("prefers duration_seconds over wall-clock timestamps", () => {
    expect(
      formatSessionDuration({
        duration_seconds: 125,
        started_at: "2026-08-30T10:00:00.000Z",
        ended_at: "2026-08-30T12:00:00.000Z",
      }),
    ).toBe("2m 5s");
  });

  it("falls back to started/ended when duration_seconds is missing", () => {
    expect(
      formatSessionDuration({
        started_at: "2026-08-30T10:00:00.000Z",
        ended_at: "2026-08-30T10:07:00.000Z",
      }),
    ).toBe("7m");
  });
});

describe("resolveOverallScore", () => {
  it("uses the scorecard when the session row is null", () => {
    expect(resolveOverallScore({ overall_score: null }, { overall_score: 81 })).toBe(81);
  });
});

describe("sessionStatusLabel", () => {
  it("prefers lifecycle_status", () => {
    expect(sessionStatusLabel({ lifecycle_status: "completed", status: "active" })).toBe(
      "completed",
    );
  });
});

describe("delete account errors", () => {
  it("maps 429 and 503 distinctly", () => {
    expect(messageFromDeleteAccountResponse(429, "RATE_LIMITED")).toMatch(/one request per day/i);
    expect(messageFromDeleteAccountResponse(503, "RATE_LIMIT_BACKEND_UNAVAILABLE")).toMatch(
      /temporarily unavailable/i,
    );
  });

  it("skips rate limit on completed replay", () => {
    expect(shouldSkipDeleteReplayRateLimit("completed")).toBe(true);
    expect(shouldSkipDeleteReplayRateLimit("processing")).toBe(false);
  });

  it("maps reauth required distinctly from confirmation", () => {
    expect(messageFromDeleteAccountResponse(401, "REAUTH_REQUIRED")).toMatch(/password|sign in again/i);
  });
});
