import { describe, it, expect, beforeEach } from "vitest";
import { useAudioStore } from "@/store/audioStore";
import {
  getLatestInterviewerQuestion,
  hasValidInterviewerQuestion,
} from "@/lib/audio/interviewerQuestions";
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
    confidence: overrides.confidence ?? 0.9,
  };
}

describe("getLatestInterviewerQuestion", () => {
  beforeEach(() => {
    useAudioStore.getState().clearTranscript();
  });

  it("returns the latest finalized marked interviewer question", () => {
    useAudioStore.getState().restoreTranscript({
      utterances: [
        utt({
          id: "1",
          speaker: "interviewer",
          text: "Tell me about yourself.",
          is_interviewer_question: true,
        }),
        utt({
          id: "2",
          speaker: "candidate",
          text: "I am a software engineer.",
        }),
        utt({
          id: "3",
          speaker: "interviewer",
          text: "What is your biggest strength?",
          is_interviewer_question: true,
        }),
      ],
    });

    const result = getLatestInterviewerQuestion();
    expect(result).toEqual({
      question: "What is your biggest strength?",
      isFinalizing: false,
      confidence: 0.9,
      utteranceId: "3",
    });
  });

  it("ignores candidate speech and non-final interviewer utterances", () => {
    useAudioStore.getState().restoreTranscript({
      utterances: [
        utt({
          speaker: "candidate",
          text: "What is your biggest strength?",
        }),
        utt({
          speaker: "interviewer",
          text: "How would you design a rate limiter?",
          is_final: false,
          is_interviewer_question: true,
        }),
      ],
    });

    expect(getLatestInterviewerQuestion()).toBeNull();
    expect(hasValidInterviewerQuestion()).toBe(false);
  });

  it("sets isFinalizing when interim transcript is open", () => {
    useAudioStore.getState().restoreTranscript({
      utterances: [
        utt({
          id: "q1",
          speaker: "interviewer",
          text: "Walk me through a recent project.",
          is_interviewer_question: true,
        }),
      ],
    });
    useAudioStore.getState().updateInterimText("and how you handled tradeoffs");

    const result = getLatestInterviewerQuestion();
    expect(result?.question).toBe("Walk me through a recent project.");
    expect(result?.isFinalizing).toBe(true);
  });
});
