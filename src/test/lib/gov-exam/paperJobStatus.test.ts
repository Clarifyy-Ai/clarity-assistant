import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  mapProgressToUiState,
  mapProgressToUserStage,
  PAPER_JOB_PUBLIC_STAGES,
  PAPER_JOB_UI_LABEL,
  PAPER_JOB_POLL_TIMEOUT_KEY,
  markPaperJobPollTimedOut,
  clearPaperJobPollTimedOut,
  isPaperJobPollTimedOut,
  isPaperJobPollTimeoutError,
  saveActivePaperJob,
  loadActivePaperJob,
  clearActivePaperJob,
} from "@/lib/gov-exam/paperJobStatus";

describe("mapProgressToUiState", () => {
  it("maps idle when there is no job", () => {
    expect(mapProgressToUiState(undefined, undefined)).toBe("IDLE");
  });

  it("maps checking / queued / generating / validating / ready", () => {
    expect(mapProgressToUiState("checking_availability", "checking_availability")).toBe("CHECKING");
    expect(mapProgressToUiState("queued", "queued")).toBe("QUEUED");
    expect(mapProgressToUiState("selecting_questions", "selecting_questions")).toBe("GENERATING");
    expect(mapProgressToUiState("building_blueprint", "building_blueprint")).toBe("GENERATING");
    expect(mapProgressToUiState("validating", "validating")).toBe("VALIDATING");
    expect(mapProgressToUiState(undefined, "validating")).toBe("VALIDATING");
    expect(mapProgressToUiState("validating_questions", "validating_questions")).toBe("VALIDATING");
    expect(mapProgressToUiState("validating_paper", "validating_paper")).toBe("VALIDATING");
    expect(mapProgressToUiState("checking_similarity", "checking_similarity")).toBe("VALIDATING");
    expect(mapProgressToUiState("assembling", "assembling")).toBe("VALIDATING");
    expect(mapProgressToUiState("completed", "completed")).toBe("READY");
  });

  it("maps terminal failures without staying in GENERATING", () => {
    expect(mapProgressToUiState("generating_missing_slots", "failed_retryable")).toBe(
      "FAILED_RETRYABLE",
    );
    expect(mapProgressToUiState("generating_paper", "failed_permanent")).toBe("FAILED_PERMANENT");
    expect(mapProgressToUiState("queued", "cancelled")).toBe("CANCELLED");
  });

  it("keeps user-facing labels for the public UI states", () => {
    expect(PAPER_JOB_UI_LABEL.CHECKING).toMatch(/Checking/i);
    expect(PAPER_JOB_UI_LABEL.QUEUED).toMatch(/Queued/i);
    expect(PAPER_JOB_UI_LABEL.GENERATING).toMatch(/Generating/i);
    expect(PAPER_JOB_UI_LABEL.VALIDATING).toMatch(/Validating/i);
    expect(PAPER_JOB_UI_LABEL.READY).toMatch(/Ready/i);
  });

  it("still collapses to the legacy user stages", () => {
    expect(mapProgressToUserStage("completed", "completed")).toBe("completed");
    expect(mapProgressToUserStage("validating", "validating")).toBe("validating_paper");
    expect(mapProgressToUserStage("validating_questions", "validating_questions")).toBe(
      "validating_paper",
    );
    expect(mapProgressToUserStage("failed_retryable", "failed_retryable")).toBe("failed");
  });

  it("maps the public job FSM aliases", () => {
    expect(PAPER_JOB_PUBLIC_STAGES).toEqual([
      "queued",
      "validating",
      "blueprint",
      "select",
      "optional_ai_fill",
      "assemble",
      "completed",
    ]);
    expect(mapProgressToUiState("blueprint", "blueprint")).toBe("GENERATING");
    expect(mapProgressToUiState("select", "select")).toBe("GENERATING");
    expect(mapProgressToUiState("optional_ai_fill", "optional_ai_fill")).toBe("GENERATING");
    expect(mapProgressToUiState("assemble", "assemble")).toBe("VALIDATING");
    expect(mapProgressToUserStage("select", "select")).toBe("selecting_questions");
  });
});

describe("active paper job storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("isolates paper jobs from topic-practice jobs", () => {
    saveActivePaperJob({
      jobId: "topic-job",
      examId: "exam-1",
      userId: "user-1",
      kind: "topic_practice",
    });
    expect(loadActivePaperJob("user-1", "paper")).toBeNull();
    expect(loadActivePaperJob("user-1", "topic_practice")?.jobId).toBe("topic-job");

    saveActivePaperJob({
      jobId: "paper-job",
      examId: "exam-1",
      userId: "user-1",
      kind: "paper",
    });
    expect(
      loadActivePaperJob("user-1", "paper")?.jobId,
    ).toBe("paper-job");
  });

  it("persists generation config so refresh can resume the same request", () => {
    saveActivePaperJob({
      jobId: "cfg-job",
      examId: "exam-1",
      userId: "user-1",
      kind: "paper",
      config: {
        examId: "exam-1",
        stageId: "stage-9",
        basis: "quick",
        language: "hi",
        durationMinutes: 40,
        questionCount: 25,
      },
    });
    const stored = loadActivePaperJob("user-1", "paper");
    expect(stored?.config?.stageId).toBe("stage-9");
    expect(stored?.config?.language).toBe("hi");
    expect(stored?.config?.questionCount).toBe(25);
    expect(stored?.config?.durationMinutes).toBe(40);
  });

  it("does not clear a different stored job id", () => {
    saveActivePaperJob({
      jobId: "keep-me",
      examId: "exam-1",
      userId: "user-1",
      kind: "paper",
    });
    clearActivePaperJob("other-job");
    expect(loadActivePaperJob("user-1", "paper")?.jobId).toBe("keep-me");
    clearActivePaperJob("keep-me");
    expect(loadActivePaperJob("user-1", "paper")).toBeNull();
  });
});

describe("paper job poll timeout helpers", () => {
  const jobId = "11111111-1111-1111-1111-111111111111";

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("tracks and clears client poll timeouts per job", () => {
    expect(isPaperJobPollTimedOut(jobId)).toBe(false);
    markPaperJobPollTimedOut(jobId);
    expect(isPaperJobPollTimedOut(jobId)).toBe(true);
    expect(isPaperJobPollTimedOut("22222222-2222-2222-2222-222222222222")).toBe(false);
    clearPaperJobPollTimedOut();
    expect(localStorage.getItem(PAPER_JOB_POLL_TIMEOUT_KEY)).toBeNull();
  });

  it("detects server timeout error codes", () => {
    expect(isPaperJobPollTimeoutError({ errorCode: "WORKER_UNAVAILABLE" })).toBe(true);
    expect(isPaperJobPollTimeoutError({ errorCode: "GENERATION_POLL_TIMEOUT" })).toBe(true);
    expect(isPaperJobPollTimeoutError({ errorCode: "CONTENT_INSUFFICIENT" })).toBe(false);
  });
});
