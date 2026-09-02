import { describe, expect, it } from "vitest";
import type { ExamPaperAvailability } from "@/lib/gov-exam/api";
import {
  availabilityCheckingElapsedMs,
  availabilityRequestKey,
  availabilityResult,
  beginAvailabilityCheck,
  beginGenerationSession,
  completeAvailabilityCheck,
  completeGenerationSession,
  failAvailabilityCheck,
  failGenerationSession,
  formatGenerationElapsed,
  generationElapsedSeconds,
  initialAvailabilitySession,
  initialGenerationSession,
  isGenerationTimerActive,
  resetAvailabilitySession,
  resetGenerationSession,
} from "@/lib/gov-exam/govPaperReviewSession";

const sampleAvailability = (): ExamPaperAvailability => ({
  success: true,
  examId: "11111111-1111-4111-8111-111111111111",
  stageId: "22222222-2222-4222-8222-222222222222",
  language: "en",
  mode: "custom_mock",
  requested: 25,
  available: 10,
  missing: 15,
  fullMockAllowed: false,
  customPracticeMax: 10,
  aiFillAllowed: false,
  blocked: false,
  blockCode: null,
  message: "ok",
});

describe("govPaperReviewSession availability", () => {
  it("starts in idle with no availability result", () => {
    const session = initialAvailabilitySession();
    expect(session.phase).toBe("idle");
    expect(availabilityResult(session)).toBeNull();
    expect(availabilityCheckingElapsedMs(session, 5_000)).toBeNull();
  });

  it("records startTime only while checking", () => {
    const key = availabilityRequestKey({
      examId: "e1",
      stageId: "s1",
      mode: "custom_mock",
      language: "en",
      questionCount: 25,
      basis: "quick",
      topicsKey: "",
    });
    const checking = beginAvailabilityCheck(key, 1_000);
    expect(checking.phase).toBe("checking");
    if (checking.phase === "checking") {
      expect(checking.startTime).toBe(1_000);
    }
    expect(availabilityCheckingElapsedMs(checking, 4_500)).toBe(3_500);
  });

  it("settles to ready with server availability", () => {
    const key = "k1";
    const checking = beginAvailabilityCheck(key, 0);
    const ready = completeAvailabilityCheck(checking, key, sampleAvailability(), 100);
    expect(ready.phase).toBe("ready");
    expect(availabilityResult(ready)?.available).toBe(10);
    expect(availabilityCheckingElapsedMs(ready, 200)).toBeNull();
  });

  it("ignores stale completions for a superseded request key", () => {
    const checking = beginAvailabilityCheck("new-key", 0);
    const stale = completeAvailabilityCheck(checking, "old-key", sampleAvailability());
    expect(stale).toBe(checking);
  });

  it("enters terminal failed state for worker-unavailable style errors", () => {
    const key = "k-fail";
    const checking = beginAvailabilityCheck(key, 0);
    const failed = failAvailabilityCheck(
      checking,
      key,
      "WORKER_UNAVAILABLE",
      "Generator unavailable",
      true,
      50,
    );
    expect(failed.phase).toBe("failed");
    if (failed.phase === "failed") {
      expect(failed.retryable).toBe(true);
      expect(failed.code).toBe("WORKER_UNAVAILABLE");
    }
    expect(availabilityResult(failed)).toBeNull();
  });

  it("resets to idle for empty inventory re-checks", () => {
    expect(resetAvailabilitySession()).toEqual({ phase: "idle" });
  });
});

describe("govPaperReviewSession generation", () => {
  const jobId = "33333333-3333-4333-8333-333333333333";

  it("does not expose a timer before generation starts", () => {
    const session = initialGenerationSession();
    expect(isGenerationTimerActive(session)).toBe(false);
    expect(generationElapsedSeconds(session, 9_000)).toBeNull();
    expect(formatGenerationElapsed(null)).toBeNull();
  });

  it("starts timer metadata only when generation is active", () => {
    const active = beginGenerationSession(jobId, { nowMs: 1_000 });
    expect(isGenerationTimerActive(active)).toBe(true);
    expect(generationElapsedSeconds(active, 61_000)).toBe(60);
    expect(formatGenerationElapsed(60)).toBe("1:00");
  });

  it("completes without leaving a dangling timer", () => {
    const active = beginGenerationSession(jobId, { nowMs: 0 });
    const done = completeGenerationSession(active, jobId, "mock-1", 500);
    expect(done.phase).toBe("completed");
    expect(generationElapsedSeconds(done, 500)).toBeNull();
  });

  it("enters terminal failure on worker timeout", () => {
    const active = beginGenerationSession(jobId, { nowMs: 0 });
    const failed = failGenerationSession(active, jobId, {
      errorCode: "GENERATION_POLL_TIMEOUT",
      errorMessage: "Timed out",
      retryable: true,
    }, 100);
    expect(failed.phase).toBe("failed");
    expect(isGenerationTimerActive(failed)).toBe(false);
  });

  it("supports retry by resetting then re-beginning generation", () => {
    const failed = failGenerationSession(
      beginGenerationSession(jobId, { nowMs: 0 }),
      jobId,
      { errorCode: "WORKER_UNAVAILABLE", retryable: true },
    );
    expect(failed.phase).toBe("failed");
    const retry = beginGenerationSession(jobId, { nowMs: 200 });
    expect(retry.phase).toBe("active");
    if (retry.phase === "active") {
      expect(retry.startTime).toBe(200);
    }
    expect(resetGenerationSession().phase).toBe("idle");
  });

  it("never reads startTime when job id does not match active session", () => {
    const active = beginGenerationSession(jobId, { nowMs: 1_000 });
    const other = completeGenerationSession(active, "other-job", "x", 2_000);
    expect(other).toBe(active);
  });
});
