import { describe, expect, it } from "vitest";
import { overlayPipelineForAnswerNext } from "@/lib/mock/answerNextFsm";

describe("overlayPipelineForAnswerNext", () => {
  it("maps finalize and next-question states to overlay pipeline", () => {
    expect(overlayPipelineForAnswerNext("answer_finalizing")).toBe("answer_finalizing");
    expect(overlayPipelineForAnswerNext("answer_saved")).toBe("answer_finalizing");
    expect(overlayPipelineForAnswerNext("next_question_pending")).toBe(
      "next_question_pending",
    );
    expect(overlayPipelineForAnswerNext("question_generating")).toBe(
      "next_question_pending",
    );
    expect(overlayPipelineForAnswerNext("listening")).toBeNull();
  });
});
