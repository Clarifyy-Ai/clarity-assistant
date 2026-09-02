import { describe, expect, it } from "vitest";
import {
  channelToSpeaker,
  newUtteranceFromSegment,
  partialTextToSegment,
  utteranceToSegment,
} from "@/lib/audio/transcription/segmentMap";
import { loadParakeetTranscriptionConfig } from "@/lib/audio/transcription/config";
import type { TranscriptUtterance } from "@/types/audio.types";

describe("Parakeet transcription segment mapping", () => {
  it("maps final utterances to TranscriptSegment with ordering", () => {
    const utterance: TranscriptUtterance = {
      id: "utt-1",
      speaker: "interviewer",
      text: "Tell me about a challenge.",
      words: [],
      start_ms: 1200,
      end_ms: 4500,
      is_final: true,
      is_interviewer_question: true,
      confidence: 0.92,
    };

    const segment = utteranceToSegment(utterance, "session-abc", 7);
    expect(segment).toMatchObject({
      sessionId: "session-abc",
      segmentId: "utt-1",
      startMs: 1200,
      endMs: 4500,
      text: "Tell me about a challenge.",
      isFinal: true,
      confidence: 0.92,
      speaker: "interviewer",
      sequence: 7,
    });
  });

  it("maps partial text with channel speaker", () => {
    const segment = partialTextToSegment("session-1", "hello wor", "candidate", 2);
    expect(segment.isFinal).toBe(false);
    expect(segment.speaker).toBe("candidate");
    expect(segment.text).toBe("hello wor");
    expect(segment.sequence).toBe(2);
  });

  it("round-trips segment to utterance for pipeline", () => {
    const segment = partialTextToSegment("s", "final line", "interviewer", 1);
    const utterance = newUtteranceFromSegment(
      { ...segment, isFinal: true, segmentId: "seg-9" },
      "interviewer",
    );
    expect(utterance.speaker).toBe(channelToSpeaker("interviewer"));
    expect(utterance.text).toBe("final line");
    expect(utterance.is_final).toBe(true);
  });
});

describe("loadParakeetTranscriptionConfig", () => {
  it("defaults to enabled meeting model without secrets", () => {
    const cfg = loadParakeetTranscriptionConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.model).toBe("nova-2-meeting");
    expect(cfg.language).toBe("en-US");
    expect(cfg).not.toHaveProperty("apiKey");
  });
});
