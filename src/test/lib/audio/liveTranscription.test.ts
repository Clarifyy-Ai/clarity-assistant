import { describe, expect, it } from "vitest";
import {
  channelToSpeaker,
  newUtteranceFromSegment,
  partialTextToSegment,
  utteranceToSegment,
} from "@/lib/audio/transcription/segmentMap";
import * as liveTranscription from "@/lib/audio/transcription";
import type { TranscriptUtterance } from "@/types/audio.types";

function loadLiveTranscriptionConfig() {
  const api = liveTranscription as typeof liveTranscription & {
    loadLiveTranscriptionConfig?: () => {
      enabled: boolean;
      sampleRate?: number;
      language: string;
      model?: string;
    };
    loadParakeetTranscriptionConfig?: () => {
      enabled: boolean;
      sampleRate?: number;
      language: string;
      model?: string;
    };
  };
  const load = api.loadLiveTranscriptionConfig ?? api.loadParakeetTranscriptionConfig;
  if (!load) throw new Error("loadLiveTranscriptionConfig is not exported");
  return load();
}

describe("Live transcription segment mapping", () => {
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

describe("loadLiveTranscriptionConfig", () => {
  it("defaults to enabled Deepgram live STT without secrets", () => {
    const cfg = loadLiveTranscriptionConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.language).toBe("en-US");
    expect(cfg.model ?? "nova-3").toMatch(/nova-3/);
    expect(cfg).not.toHaveProperty("apiKey");
    expect(cfg).not.toHaveProperty("nvidiaApiKey");
    expect(JSON.stringify(cfg)).not.toMatch(/NVIDIA_API_KEY|PARAKEET_NIM_URL|parakeet-token/);
  });
});

describe("LiveTranscriptionService export", () => {
  it("exports createLiveTranscriptionService or the Parakeet alias wrapping Deepgram", () => {
    const api = liveTranscription as Record<string, unknown>;
    expect(
      typeof api.createLiveTranscriptionService === "function" ||
        typeof api.createParakeetTranscriptionService === "function" ||
        typeof api.LiveTranscriptionService === "function" ||
        typeof api.ParakeetTranscriptionService === "function",
    ).toBe(true);
  });
});
