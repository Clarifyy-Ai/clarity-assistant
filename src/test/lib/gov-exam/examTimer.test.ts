import { describe, expect, it } from "vitest";
import {
  computeRemainingSeconds,
  examExpiresAtMs,
  isExamExpired,
  shouldAutoSubmitAttempt,
  examTimerOriginFromAttempt,
  remainingFromTimerOrigin,
  sameExamTimerOrigin,
  canRenderExamTimer,
  isTimerPaused,
} from "@/lib/gov-exam/examTimer";

describe("examTimer", () => {
  const start = "2026-08-14T00:00:00.000Z";
  const startMs = Date.parse(start);

  it("derives remaining time from started_at + time_limit", () => {
    expect(examExpiresAtMs(start, 10)).toBe(startMs + 10 * 60_000);
    expect(computeRemainingSeconds(start, 10, startMs + 60_000)).toBe(9 * 60);
  });

  it("freezes remaining time while paused_at is set", () => {
    const expires = new Date(startMs + 10 * 60_000).toISOString();
    const pausedAt = new Date(startMs + 5 * 60_000).toISOString();
    const frozen = computeRemainingSeconds(start, 10, startMs + 8 * 60_000, expires, pausedAt);
    expect(frozen).toBe(5 * 60);
    expect(
      computeRemainingSeconds(start, 10, startMs + 9 * 60_000, expires, pausedAt),
    ).toBe(5 * 60);
  });

  it("does not treat a paused attempt as expired or auto-submit", () => {
    const expires = new Date(startMs + 10 * 60_000).toISOString();
    const pausedAt = new Date(startMs + 5 * 60_000).toISOString();
    expect(isExamExpired(start, 10, startMs + 12 * 60_000, 2_000, expires, pausedAt)).toBe(false);
    expect(
      shouldAutoSubmitAttempt(
        "IN_PROGRESS",
        start,
        10,
        startMs + 12 * 60_000,
        expires,
        pausedAt,
        "PAUSED",
      ),
    ).toBe(false);
  });

  it("marks expired after the official window plus grace when active", () => {
    expect(isExamExpired(start, 10, startMs + 10 * 60_000)).toBe(false);
    expect(isExamExpired(start, 10, startMs + 10 * 60_000 + 3_000)).toBe(true);
  });

  it("auto-submits in-progress attempts at remaining 0 even if grace has not elapsed", () => {
    expect(isExamExpired(start, 10, startMs + 10 * 60_000)).toBe(false);
    expect(shouldAutoSubmitAttempt("IN_PROGRESS", start, 10, startMs + 10 * 60_000)).toBe(true);
    expect(shouldAutoSubmitAttempt("IN_PROGRESS", start, 10, startMs + 5 * 60_000)).toBe(false);
    expect(shouldAutoSubmitAttempt("DRAFT", start, 10, startMs + 10 * 60_000)).toBe(false);
    expect(shouldAutoSubmitAttempt("COMPLETED", start, 10, startMs + 11 * 60_000)).toBe(false);
    expect(shouldAutoSubmitAttempt("IN_PROGRESS", start, 0, startMs + 60_000)).toBe(false);
    expect(shouldAutoSubmitAttempt("IN_PROGRESS", null, 10, startMs)).toBe(false);
  });

  it("isolates remaining time to a frozen origin so bootstrap cannot extend the clock", () => {
    const origin = examTimerOriginFromAttempt({
      started_at: start,
      expires_at: new Date(startMs + 10 * 60_000).toISOString(),
      time_limit_minutes: 10,
    });
    expect(canRenderExamTimer(origin)).toBe(true);
    expect(remainingFromTimerOrigin(origin, startMs + 60_000)).toBe(9 * 60);
    const refreshed = examTimerOriginFromAttempt({
      started_at: start,
      expires_at: origin?.expiresAt,
      time_limit_minutes: 10,
    });
    expect(sameExamTimerOrigin(origin, refreshed)).toBe(true);
    expect(canRenderExamTimer(null)).toBe(false);
  });

  it("tracks pause on the timer origin", () => {
    const origin = examTimerOriginFromAttempt({
      started_at: start,
      expires_at: new Date(startMs + 10 * 60_000).toISOString(),
      time_limit_minutes: 10,
      paused_at: new Date(startMs + 4 * 60_000).toISOString(),
      attempt_phase: "PAUSED",
    });
    expect(isTimerPaused(origin)).toBe(true);
    expect(remainingFromTimerOrigin(origin, startMs + 9 * 60_000)).toBe(6 * 60);
  });
});
