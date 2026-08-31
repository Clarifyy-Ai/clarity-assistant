import { describe, expect, it } from "vitest";
import {
  mapProgressToUiState,
  mapProgressToUserStage,
  PAPER_JOB_UI_LABEL,
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
});
