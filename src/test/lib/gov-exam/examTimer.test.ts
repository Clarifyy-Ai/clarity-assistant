import { describe, expect, it } from "vitest";
import {
  computeRemainingSeconds,
  examExpiresAtMs,
  isExamExpired,
  shouldAutoSubmitAttempt,
} from "@/lib/gov-exam/examTimer";

describe("examTimer", () => {
  const start = "2026-08-14T00:00:00.000Z";
  const startMs = Date.parse(start);

  it("derives remaining time from started_at + time_limit", () => {
    expect(examExpiresAtMs(start, 10)).toBe(startMs + 10 * 60_000);
    expect(computeRemainingSeconds(start, 10, startMs + 60_000)).toBe(9 * 60);
  });

  it("does not extend remaining time from a later client clock pause", () => {
    const remainingAtPause = computeRemainingSeconds(start, 10, startMs + 5 * 60_000);
    expect(remainingAtPause).toBe(5 * 60);
    const remainingAfterFakePause = computeRemainingSeconds(start, 10, startMs + 8 * 60_000);
    expect(remainingAfterFakePause).toBe(2 * 60);
  });

  it("marks expired after the official window plus grace", () => {
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
});
