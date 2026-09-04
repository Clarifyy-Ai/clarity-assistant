import { describe, expect, it } from "vitest";
import {
  buildSessionTranscriptView,
  buildUtteranceTurns,
  parsePersistedUtterances,
} from "@/lib/session/sessionTranscriptTurns";
import type { TranscriptUtterance } from "@/types/audio.types";

function utt(
  overrides: Partial<TranscriptUtterance> &
    Pick<TranscriptUtterance, "speaker" | "text">,
): TranscriptUtterance {
  return {
    id: overrides.id ?? "u",
    speaker: overrides.speaker,
    text: overrides.text,
    words: [],
    start_ms: overrides.start_ms ?? 0,
    end_ms: overrides.end_ms ?? 0,
    is_final: overrides.is_final ?? true,
    is_interviewer_question: overrides.is_interviewer_question ?? false,
    confidence: overrides.confidence ?? 1,
  };
}

describe("parsePersistedUtterances", () => {
  it("normalizes speaker-attributed rows and skips empty text", () => {
    const parsed = parsePersistedUtterances([
      { id: "1", speaker: "interviewer", text: " Tell me about yourself? ", is_final: true },
      { id: "2", speaker: "candidate", text: "I build APIs.", is_final: true },
      { id: "3", speaker: "candidate", text: "   ", is_final: true },
      { speaker: "weird", text: "noise" },
    ]);
    expect(parsed).toHaveLength(3);
    expect(parsed[0].speaker).toBe("interviewer");
    expect(parsed[2].speaker).toBe("unknown");
  });
});

describe("buildUtteranceTurns", () => {
  it("collapses consecutive same-speaker finals into THEM/YOU turns", () => {
    const turns = buildUtteranceTurns([
      utt({ id: "a", speaker: "interviewer", text: "Tell me about yourself." }),
      utt({ id: "b", speaker: "interviewer", text: "Take your time." }),
      utt({ id: "c", speaker: "candidate", text: "I am an engineer." }),
      utt({ id: "d", speaker: "candidate", text: "I focus on APIs." }),
    ]);
    expect(turns).toEqual([
      expect.objectContaining({
        label: "THEM",
        text: "Tell me about yourself. Take your time.",
      }),
      expect.objectContaining({
        label: "YOU",
        text: "I am an engineer. I focus on APIs.",
      }),
    ]);
  });
});

describe("buildSessionTranscriptView", () => {
  it("prefers utterances over flat content and attaches AI suggestions", () => {
    const view = buildSessionTranscriptView({
      content: "flat fallback only",
      utterances: [
        utt({
          speaker: "interviewer",
          text: "Tell me about yourself.",
          is_interviewer_question: true,
        }),
        utt({ speaker: "candidate", text: "I ship reliable services." }),
      ],
      answers: [
        {
          question: "Tell me about yourself.",
          answer: "I ship reliable services.",
          ai_feedback: "Lead with impact metrics.",
          question_index: 0,
        },
      ],
    });

    expect(view.mode).toBe("turns");
    expect(view.turns.map((t) => t.label)).toEqual(["THEM", "YOU", "AI"]);
    expect(view.turns[2].text).toBe("Lead with impact metrics.");
    expect(view.groups[0]).toMatchObject({
      interviewer: "Tell me about yourself.",
      candidate: "I ship reliable services.",
      aiSuggestion: "Lead with impact metrics.",
    });
  });

  it("falls back to flat content when utterances are missing", () => {
    const view = buildSessionTranscriptView({
      content: "  Plain transcript text.  ",
      utterances: null,
      answers: [],
    });
    expect(view.mode).toBe("flat");
    expect(view.flatContent).toBe("Plain transcript text.");
    expect(view.turns).toEqual([]);
  });

  it("returns empty when neither utterances nor content exist", () => {
    expect(buildSessionTranscriptView({}).mode).toBe("empty");
  });
});
