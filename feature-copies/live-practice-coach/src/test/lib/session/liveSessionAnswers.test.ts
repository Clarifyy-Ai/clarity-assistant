import { describe, it, expect } from "vitest";
import {
  countAnsweredPairs,
  pairLiveSessionAnswers,
} from "@/lib/session/liveSessionAnswers";
import type { TranscriptUtterance } from "@/types/audio.types";

function utt(
  overrides: Partial<TranscriptUtterance> &
    Pick<TranscriptUtterance, "speaker" | "text">,
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

describe("pairLiveSessionAnswers", () => {
  it("pairs an interviewer question with the candidate answer", () => {
    const rows = pairLiveSessionAnswers([
      utt({
        speaker: "interviewer",
        text: "Tell me about yourself.",
        is_interviewer_question: true,
        start_ms: 0,
        end_ms: 1000,
      }),
      utt({
        speaker: "candidate",
        text: "I am a software engineer.",
        start_ms: 1200,
        end_ms: 4000,
      }),
    ]);

    expect(rows).toEqual([
      {
        question: "Tell me about yourself.",
        answer: "I am a software engineer.",
        duration_ms: 2800,
      },
    ]);
    expect(countAnsweredPairs(rows)).toBe(1);
  });

  it("pairs two questions with answers", () => {
    const rows = pairLiveSessionAnswers([
      utt({
        id: "q1",
        speaker: "interviewer",
        text: "What is your biggest strength?",
        is_interviewer_question: true,
        start_ms: 0,
        end_ms: 800,
      }),
      utt({
        id: "a1",
        speaker: "candidate",
        text: "I communicate clearly.",
        start_ms: 900,
        end_ms: 2000,
      }),
      utt({
        id: "q2",
        speaker: "interviewer",
        text: "How do you handle conflict?",
        is_interviewer_question: true,
        start_ms: 2500,
        end_ms: 3400,
      }),
      utt({
        id: "a2",
        speaker: "candidate",
        text: "I listen first, then align on facts.",
        start_ms: 3500,
        end_ms: 5200,
      }),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      question: "What is your biggest strength?",
      answer: "I communicate clearly.",
    });
    expect(rows[1]).toMatchObject({
      question: "How do you handle conflict?",
      answer: "I listen first, then align on facts.",
    });
    expect(rows[1].duration_ms).toBe(1700);
  });

  it("skips a question with no answer", () => {
    const rows = pairLiveSessionAnswers([
      utt({
        speaker: "interviewer",
        text: "Walk me through a recent project.",
        is_interviewer_question: true,
      }),
      utt({
        speaker: "interviewer",
        text: "Why this role?",
        is_interviewer_question: true,
      }),
      utt({
        speaker: "candidate",
        text: "Because the work is high-impact.",
        start_ms: 100,
        end_ms: 400,
      }),
    ]);

    expect(rows).toEqual([
      {
        question: "Why this role?",
        answer: "Because the work is high-impact.",
        duration_ms: 300,
      },
    ]);
  });

  it("returns an empty list for no utterances", () => {
    expect(pairLiveSessionAnswers([])).toEqual([]);
    expect(countAnsweredPairs([])).toBe(0);
  });

  it("ignores non-final utterances", () => {
    const rows = pairLiveSessionAnswers([
      utt({
        speaker: "interviewer",
        text: "Describe a hard bug you fixed.",
        is_interviewer_question: true,
        is_final: false,
      }),
      utt({
        speaker: "candidate",
        text: "It was a race condition.",
        is_final: false,
        start_ms: 10,
        end_ms: 90,
      }),
      utt({
        speaker: "interviewer",
        text: "Explain your testing approach.",
        is_interviewer_question: true,
      }),
      utt({
        speaker: "candidate",
        text: "I start with regression coverage.",
        start_ms: 200,
        end_ms: 500,
      }),
    ]);

    expect(rows).toEqual([
      {
        question: "Explain your testing approach.",
        answer: "I start with regression coverage.",
        duration_ms: 300,
      },
    ]);
  });

  it("treats interviewer text that looks like a question as a start", () => {
    const rows = pairLiveSessionAnswers([
      utt({
        speaker: "interviewer",
        text: "What would you change about this system?",
      }),
      utt({
        speaker: "candidate",
        text: "I would split the write path.",
        start_ms: 50,
        end_ms: 80,
      }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].question).toBe("What would you change about this system?");
    expect(rows[0].answer).toBe("I would split the write path.");
  });
});
