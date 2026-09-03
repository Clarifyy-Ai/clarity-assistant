import { describe, it, expect } from "vitest";
import { resolveQuestionFromTranscript } from "@/lib/session/liveQuestionFromTranscript";
import type { TranscriptUtterance } from "@/types/audio.types";

function utt(
  overrides: Partial<TranscriptUtterance> & Pick<TranscriptUtterance, "speaker" | "text">,
): TranscriptUtterance {
  return {
    id: overrides.id ?? "u",
    speaker: overrides.speaker,
    text: overrides.text,
    words: overrides.words ?? [],
    start_ms: overrides.start_ms ?? 0,
    end_ms: overrides.end_ms ?? 0,
    is_final: overrides.is_final ?? true,
    is_interviewer_question: overrides.is_interviewer_question ?? false,
    confidence: overrides.confidence ?? 1,
  };
}

describe("resolveQuestionFromTranscript", () => {
  it("prefers the stored current question", () => {
    expect(
      resolveQuestionFromTranscript(
        [utt({ speaker: "interviewer", text: "Tell me about yourself." })],
        "  What is your stack?  ",
      ),
    ).toBe("What is your stack?");
  });

  it("uses the last marked interviewer question", () => {
    expect(
      resolveQuestionFromTranscript([
        utt({
          speaker: "interviewer",
          text: "How do you handle conflict?",
          is_interviewer_question: true,
        }),
        utt({ speaker: "candidate", text: "I stay calm and listen." }),
      ]),
    ).toBe("How do you handle conflict?");
  });

  it("falls back to interviewer speech when nothing is marked", () => {
    expect(
      resolveQuestionFromTranscript([
        utt({ speaker: "candidate", text: "Hi, thanks for having me." }),
        utt({ speaker: "interviewer", text: "Walk me through a recent project." }),
      ]),
    ).toBe("Walk me through a recent project.");
  });

  it("uses question-shaped candidate-labelled speech only when mic-only fallback allowed", () => {
    expect(
      resolveQuestionFromTranscript(
        [
          utt({ speaker: "candidate", text: "yeah I worked on that last year" }),
          utt({ speaker: "candidate", text: "What is your biggest strength?" }),
        ],
        null,
        { allowMicOnlyFallback: true },
      ),
    ).toBe("What is your biggest strength?");
  });

  it("does not use candidate speech when live tab audio is expected", () => {
    expect(
      resolveQuestionFromTranscript(
        [
          utt({ speaker: "candidate", text: "What is your biggest strength?" }),
        ],
        null,
        { allowMicOnlyFallback: false },
      ),
    ).toBe("");
  });

  it("returns empty when there is no transcript", () => {
    expect(resolveQuestionFromTranscript([])).toBe("");
    expect(resolveQuestionFromTranscript(undefined)).toBe("");
  });

  it("AI Help recovery uses last final speech when gate never marked a question", () => {
    expect(
      resolveQuestionFromTranscript(
        [
          utt({
            speaker: "unknown",
            text: "Tell me about a time you led a team.",
            is_interviewer_question: false,
            confidence: 0.2,
          }),
        ],
        null,
        { aiHelpRecovery: true },
      ),
    ).toBe("Tell me about a time you led a team.");
  });
});
