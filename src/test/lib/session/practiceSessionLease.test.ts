import { describe, expect, it } from "vitest";
import {
  practiceExpiresAtMs,
  practiceRemainingSeconds,
  practiceElapsedSeconds,
  isPracticeLeaseExpired,
  classifyPracticeLeaseResult,
  extendExpiresAtIso,
  currentPauseDurationMs,
} from "@/lib/session/practiceSessionLease";

describe("practiceSessionLease", () => {
  it("prefers expires_at for remaining wall-clock time", () => {
    const now = Date.parse("2026-09-04T12:00:00.000Z");
    const expiresAt = "2026-09-04T12:05:00.000Z";
    expect(practiceExpiresAtMs({ expiresAt })).toBe(Date.parse(expiresAt));
    expect(practiceRemainingSeconds({ expiresAt }, now)).toBe(300);
  });

  it("does not pause remaining time when computing across a hidden interval", () => {
    const startedAt = "2026-09-04T12:00:00.000Z";
    const expiresAt = "2026-09-04T12:05:00.000Z";
    const mid = Date.parse("2026-09-04T12:03:00.000Z");
    const afterWake = Date.parse("2026-09-04T12:04:30.000Z");
    expect(practiceRemainingSeconds({ expiresAt, startedAt }, mid)).toBe(120);
    expect(practiceRemainingSeconds({ expiresAt, startedAt }, afterWake)).toBe(30);
    expect(practiceElapsedSeconds(startedAt, afterWake)).toBe(270);
  });

  it("freezes elapsed and remaining while paused_at is set", () => {
    const startedAt = "2026-09-04T12:00:00.000Z";
    const expiresAt = "2026-09-04T12:10:00.000Z";
    const pausedAt = "2026-09-04T12:02:00.000Z";
    const later = Date.parse("2026-09-04T12:07:00.000Z");
    const pause = { pausedAt, totalPausedMs: 0 };

    expect(practiceElapsedSeconds(startedAt, later, 0, pause)).toBe(120);
    expect(practiceRemainingSeconds({ expiresAt, startedAt }, later, pause)).toBe(480);
    expect(isPracticeLeaseExpired({ expiresAt }, later, 1_000, pause)).toBe(false);
  });

  it("subtracts accrued pause and extends expires_at on resume", () => {
    const startedAt = "2026-09-04T12:00:00.000Z";
    const expiresAt = "2026-09-04T12:10:00.000Z";
    const afterResume = Date.parse("2026-09-04T12:05:00.000Z");
    const pause = { pausedAt: null, totalPausedMs: 120_000 };

    expect(practiceElapsedSeconds(startedAt, afterResume, 0, pause)).toBe(180);
    const extended = extendExpiresAtIso(expiresAt, 120_000);
    expect(extended).toBe("2026-09-04T12:12:00.000Z");
    expect(
      practiceRemainingSeconds({ expiresAt: extended, startedAt }, afterResume, pause),
    ).toBe(420);
  });

  it("does not double-count when pause windows are sequential", () => {
    const pausedAt = "2026-09-04T12:03:00.000Z";
    const resumeAt = Date.parse("2026-09-04T12:04:00.000Z");
    expect(currentPauseDurationMs(pausedAt, resumeAt)).toBe(60_000);
    const secondPauseStart = "2026-09-04T12:06:00.000Z";
    const secondResume = Date.parse("2026-09-04T12:06:30.000Z");
    expect(currentPauseDurationMs(secondPauseStart, secondResume)).toBe(30_000);
    expect(60_000 + 30_000).toBe(90_000);
  });

  it("marks lease expired after expires_at + grace", () => {
    const expiresAt = "2026-09-04T12:05:00.000Z";
    expect(
      isPracticeLeaseExpired({ expiresAt }, Date.parse("2026-09-04T12:05:00.500Z"), 1_000),
    ).toBe(false);
    expect(
      isPracticeLeaseExpired({ expiresAt }, Date.parse("2026-09-04T12:05:02.000Z"), 1_000),
    ).toBe(true);
  });

  it("classifies SESSION_EXPIRED as terminal and 503 as transient", () => {
    expect(
      classifyPracticeLeaseResult({
        reason: "SESSION_EXPIRED",
        lifecycle_status: "EXPIRED",
        terminal_reason: "SESSION_TIMEOUT",
      }),
    ).toEqual({ kind: "expired", terminalReason: "SESSION_TIMEOUT" });

    expect(
      classifyPracticeLeaseResult(null, {
        code: "AI_PROVIDER_UNAVAILABLE",
        status: 503,
        message: "down",
      }),
    ).toMatchObject({ kind: "transient", status: 503 });

    expect(
      classifyPracticeLeaseResult({
        reason: "ACTIVE",
        expires_at: "2026-09-04T12:10:00.000Z",
      }),
    ).toEqual({ kind: "ok", expiresAt: "2026-09-04T12:10:00.000Z" });
  });
});
