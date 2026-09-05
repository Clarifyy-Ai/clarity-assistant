import { describe, expect, it } from "vitest";
import {
  answerNextStatusLabel,
  deriveFinalizationOutcome,
  deriveMockAnswerStatus,
  isAnswerNextBusy,
  reduceAnswerNext,
} from "@/lib/mock/answerNextFsm";
import {
  collectCandidateAnswerText,
  finalizeMockAnswer,
  looksLikeInterviewerEcho,
  streamListeningWatermarkMs,
} from "@/lib/mock/mockAnswerCapture";
import type { TranscriptUtterance } from "@/types/audio.types";

describe("answerNextFsm", () => {
  it("Q1 boot enters loading → question_generating → question_ready", () => {
    let s = reduceAnswerNext("ready", { type: "RESET" });
    expect(s).toBe("loading");
    s = reduceAnswerNext(s, { type: "START_GENERATING" });
    expect(s).toBe("question_generating");
    expect(isAnswerNextBusy(s)).toBe(true);
    s = reduceAnswerNext(s, { type: "QUESTION_READY" });
    expect(s).toBe("question_ready");
  });

  it("does not auto-complete on answer_detected", () => {
    let s = reduceAnswerNext("ready", { type: "START_LISTENING" });
    expect(s).toBe("listening");
    s = reduceAnswerNext(s, { type: "ANSWER_DETECTED" });
    expect(s).toBe("answer_detected");
    expect(isAnswerNextBusy(s)).toBe(false);
  });

  it("Next pipeline: finalize → saved → request next → ready", () => {
    let s = reduceAnswerNext("listening", { type: "FINALIZE" });
    expect(s).toBe("answer_finalizing");
    expect(answerNextStatusLabel(s)).toMatch(/Saving/i);
    expect(isAnswerNextBusy(s)).toBe(true);
    s = reduceAnswerNext(s, { type: "ANSWER_SAVED" });
    expect(s).toBe("answer_saved");
    s = reduceAnswerNext(s, { type: "REQUEST_NEXT" });
    expect(s).toBe("next_question_pending");
    expect(isAnswerNextBusy(s)).toBe(true);
    s = reduceAnswerNext(s, { type: "NEXT_READY" });
    expect(s).toBe("ready");
  });

  it("question speak → listen lifecycle", () => {
    let s = reduceAnswerNext("ready", { type: "QUESTION_READY" });
    expect(s).toBe("question_ready");
    s = reduceAnswerNext(s, { type: "START_SPEAKING" });
    expect(s).toBe("question_speaking");
    expect(isAnswerNextBusy(s)).toBe(false);
    s = reduceAnswerNext(s, { type: "SPEAKING_DONE" });
    expect(s).toBe("listening");
  });

  it("duplicate REQUEST_NEXT while pending stays pending", () => {
    const s = reduceAnswerNext("next_question_pending", { type: "REQUEST_NEXT" });
    expect(s).toBe("next_question_pending");
  });

  it("listening does not disable Next", () => {
    expect(isAnswerNextBusy("listening")).toBe(false);
    expect(isAnswerNextBusy("answer_detected")).toBe(false);
    expect(isAnswerNextBusy("question_speaking")).toBe(false);
  });

  it("derive answer statuses", () => {
    expect(deriveMockAnswerStatus({ skipped: true })).toBe("skipped");
    expect(deriveMockAnswerStatus({ text: "" })).toBe("unanswered");
    expect(deriveMockAnswerStatus({ text: "ab" })).toBe("invalid");
    expect(deriveMockAnswerStatus({ text: "I led a team of five engineers." })).toBe("answered");
    expect(deriveFinalizationOutcome({ status: "unanswered" })).toBe("UNANSWERED");
    expect(deriveFinalizationOutcome({ status: "skipped", skipped: true })).toBe("SKIPPED");
  });
});

describe("mockAnswerCapture", () => {
  const question =
    "Tell me about a time you led a cross-functional team through a difficult project.";

  function utt(
    partial: Partial<TranscriptUtterance> & { text: string },
  ): TranscriptUtterance {
    return {
      id: partial.id ?? crypto.randomUUID(),
      text: partial.text,
      speaker: partial.speaker ?? "candidate",
      words: [],
      start_ms: partial.start_ms ?? 1000,
      end_ms: partial.end_ms ?? 2000,
      is_final: partial.is_final ?? true,
      is_interviewer_question: partial.is_interviewer_question ?? false,
      confidence: 1,
    };
  }

  it("detects TTS echo of the interviewer question", () => {
    expect(looksLikeInterviewerEcho(question, question)).toBe(true);
    expect(
      looksLikeInterviewerEcho(
        "I led a cross-functional team through a difficult project",
        question,
      ),
    ).toBe(true);
    expect(
      looksLikeInterviewerEcho(
        "At my last company I owned the migration and cut latency by 40 percent.",
        question,
      ),
    ).toBe(false);
  });

  it("ignores utterances before listening window and interviewer rows", () => {
    const text = collectCandidateAnswerText({
      utterances: [
        utt({
          text: question,
          speaker: "interviewer",
          is_interviewer_question: true,
          end_ms: 500,
        }),
        utt({
          text: "Echo of the question from speakers",
          end_ms: 800,
        }),
        utt({
          text: "I shipped the feature in two weeks with clear metrics.",
          end_ms: 2500,
        }),
      ],
      listeningStartedAtMs: 1000,
      questionText: question,
      interimText: "",
    });
    expect(text).toMatch(/shipped the feature/i);
  });

  it("silence produces unanswered, not answered", () => {
    const result = finalizeMockAnswer({
      utterances: [],
      listeningStartedAtMs: 1000,
      questionText: question,
      interimText: "",
    });
    expect(result.status).toBe("unanswered");
    expect(["UNANSWERED", "NO_SIGNAL"]).toContain(result.outcome);
    expect(result.answer_text).toBe("");
  });

  it("skip never stores AI/candidate answer text", () => {
    const result = finalizeMockAnswer({
      skipped: true,
      utterances: [
        utt({ text: "something I said", end_ms: 2000 }),
      ],
      listeningStartedAtMs: 1000,
      questionText: question,
    });
    expect(result.status).toBe("skipped");
    expect(result.outcome).toBe("SKIPPED");
    expect(result.answer_text).toBe("");
  });

  it("typed answer wins over STT and is valid", () => {
    const result = finalizeMockAnswer({
      utterances: [],
      listeningStartedAtMs: 1000,
      questionText: question,
      typedAnswer: "I prioritized the customer impact and shipped a fix in 48 hours.",
    });
    expect(result.status).toBe("answered");
    expect(result.outcome).toBe("VALID_ANSWER");
  });

  it("ignores all mic content while interviewer audio is active", () => {
    const text = collectCandidateAnswerText({
      utterances: [utt({ text: question, end_ms: 5000 })],
      listeningStartedAtMs: 0,
      questionText: question,
      interviewerAudioActive: true,
      interimText: question,
    });
    expect(text).toBe("");
  });

  it("streamListeningWatermarkMs uses max utterance end_ms (not wall clock)", () => {
    expect(streamListeningWatermarkMs([])).toBe(0);
    expect(
      streamListeningWatermarkMs([
        utt({ text: "a", start_ms: 100, end_ms: 400 }),
        utt({ text: "b", start_ms: 500, end_ms: 1200 }),
      ]),
    ).toBe(1200);
  });

  it("ignores wall-clock injected interviewer utterances when watermarking", () => {
    const epochMs = Date.now();
    expect(
      streamListeningWatermarkMs([
        utt({ text: "Q1", start_ms: epochMs, end_ms: epochMs }),
        utt({ text: "answer", start_ms: 1200, end_ms: 2400 }),
      ]),
    ).toBe(2400);
  });

  it("captures voice finals with stream-relative watermark (production path)", () => {
    const watermark = 3_000;
    const text = collectCandidateAnswerText({
      utterances: [
        utt({
          text: "Previous question answer must not leak",
          end_ms: 2_500,
        }),
        utt({
          text: "I mediated the conflict and documented the outcome clearly.",
          end_ms: 4_200,
        }),
      ],
      listeningStartedAtMs: watermark,
      questionText: question,
      interimText: "",
      preferTyped: false,
    });
    expect(text).toMatch(/mediated the conflict/i);
    expect(text).not.toMatch(/Previous question/i);
  });

  it("uses interim when no finals yet in the listening window", () => {
    const text = collectCandidateAnswerText({
      utterances: [],
      listeningStartedAtMs: 0,
      questionText: question,
      interimText: "I started by clarifying the requirements with the team",
      preferTyped: false,
    });
    expect(text).toMatch(/clarifying the requirements/i);
  });

  it("finals replace interim when both exist", () => {
    const text = collectCandidateAnswerText({
      utterances: [
        utt({
          text: "I owned the migration and cut latency by forty percent.",
          end_ms: 1500,
        }),
      ],
      listeningStartedAtMs: 0,
      questionText: question,
      interimText: "partial draft that should be ignored",
      preferTyped: false,
    });
    expect(text).toMatch(/owned the migration/i);
    expect(text).not.toMatch(/partial draft/i);
  });

  it("regression: epoch listening start must not be used with stream utterance times", () => {
    // Simulates the BUG 08 failure mode: Date.now() window vs Deepgram stream-ms.
    const epochWindow = Date.now();
    const streamFinal = utt({
      text: "I shipped the feature in two weeks with clear metrics.",
      start_ms: 1_200,
      end_ms: 2_400,
    });
    const broken = collectCandidateAnswerText({
      utterances: [streamFinal],
      listeningStartedAtMs: epochWindow,
      questionText: question,
      preferTyped: false,
    });
    expect(broken).toBe("");

    const fixed = collectCandidateAnswerText({
      utterances: [streamFinal],
      listeningStartedAtMs: streamListeningWatermarkMs([]),
      questionText: question,
      preferTyped: false,
    });
    expect(fixed).toMatch(/shipped the feature/i);
  });

  it("finalize uses snapshot interim even if live interim was cleared", () => {
    const result = finalizeMockAnswer({
      utterances: [],
      listeningStartedAtMs: 0,
      questionText: question,
      interimText: "I clarified scope before writing any code with the team.",
    });
    expect(result.status).toBe("answered");
    expect(result.answer_text).toMatch(/clarified scope/i);
  });
});
