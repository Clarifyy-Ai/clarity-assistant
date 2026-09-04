import { describe, expect, it } from "vitest";
import {
  assessAiHelpQuestion,
  joinRecentInterviewerText,
  tierFromConfidenceScore,
} from "@/lib/session/aiHelpConfirm";
import type { TranscriptUtterance } from "@/types/audio.types";

function utt(
  partial: Partial<TranscriptUtterance> & { text: string },
): TranscriptUtterance {
  return {
    id: partial.id ?? `u-${partial.text.slice(0, 8)}`,
    speaker: partial.speaker ?? "interviewer",
    text: partial.text,
    words: [],
    start_ms: partial.start_ms ?? 0,
    end_ms: partial.end_ms ?? 1000,
    is_final: partial.is_final ?? true,
    is_interviewer_question: partial.is_interviewer_question ?? false,
    confidence: partial.confidence ?? 0.5,
  };
}

describe("aiHelpConfirm", () => {
  it("maps confidence scores to High/Medium/Low tiers", () => {
    expect(tierFromConfidenceScore(0.85)).toBe("high");
    expect(tierFromConfidenceScore(0.55)).toBe("medium");
    expect(tierFromConfidenceScore(0.2)).toBe("low");
    expect(tierFromConfidenceScore(null)).toBe("low");
  });

  it("assesses a marked interviewer question as high/medium without auto-gen side effects", () => {
    const assessment = assessAiHelpQuestion({
      utterances: [
        utt({
          text: "Tell me about a time you led a project.",
          is_interviewer_question: true,
          confidence: 0.9,
        }),
      ],
    });
    expect(assessment.question).toMatch(/led a project/i);
    expect(assessment.confidence).toBe("high");
    expect(assessment.usedRecovery).toBe(false);
  });

  it("flags recovery / weak paths as low confidence", () => {
    const assessment = assessAiHelpQuestion({
      utterances: [
        utt({
          speaker: "candidate",
          text: "What is your biggest strength?",
          confidence: 0.3,
        }),
      ],
      allowMicOnlyFallback: false,
    });
    // Without mic-only and without interviewer mark, recovery may still find question-shaped text
    expect(assessment.question.length).toBeGreaterThan(0);
    expect(assessment.confidence).toBe("low");
    expect(assessment.usedRecovery).toBe(true);
  });

  it("joins recent interviewer text for freeze windows", () => {
    const text = joinRecentInterviewerText(
      [
        utt({ text: "First part.", start_ms: 1 }),
        utt({ speaker: "candidate", text: "My answer.", start_ms: 2 }),
        utt({ text: "Second part?", start_ms: 3 }),
      ],
      { maxUtterances: 4 },
    );
    expect(text).toContain("First part");
    expect(text).toContain("Second part");
    expect(text).not.toContain("My answer");
  });
});
