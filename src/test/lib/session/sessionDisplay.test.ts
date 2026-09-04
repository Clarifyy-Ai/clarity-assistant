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

  it("returns em dash for null or undefined session (never throws)", () => {
    expect(formatSessionDuration(null)).toBe("—");
    expect(formatSessionDuration(undefined)).toBe("—");
  });

  it("returns em dash when duration_seconds is null", () => {
    expect(formatSessionDuration({ duration_seconds: null })).toBe("—");
  });

  it("formats zero duration", () => {
    expect(formatSessionDuration({ duration_seconds: 0 })).toBe("0s");
  });

  it("returns em dash for missing duration without timestamps", () => {
    expect(formatSessionDuration({})).toBe("—");
  });

  it("returns em dash for malformed non-finite duration", () => {
    expect(formatSessionDuration({ duration_seconds: Number.NaN })).toBe("—");
    expect(formatSessionDuration({ duration_seconds: Number.POSITIVE_INFINITY })).toBe(
      "—",
    );
  });

  it("shows In progress for active sessions without ended_at", () => {
    expect(
      formatSessionDuration({
        status: "active",
        started_at: "2026-08-30T10:00:00.000Z",
      }),
    ).toBe("In progress");
  });

  it("does not throw when a bare number is passed by mistake", () => {
    // @ts-expect-error intentional contract misuse regression
    expect(formatSessionDuration(42)).toBe("—");
  });
});

describe("resolveOverallScore", () => {
  it("uses a completed scorecard when the session overall_score is null", () => {
    expect(
      resolveOverallScore(
        { overall_score: null },
        { overall_score: 81, evaluation_status: "completed" },
      ),
    ).toBe(81);
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
