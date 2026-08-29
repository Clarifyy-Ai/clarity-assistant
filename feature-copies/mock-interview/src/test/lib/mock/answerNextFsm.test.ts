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
} from "@/lib/mock/mockAnswerCapture";
import type { TranscriptUtterance } from "@/types/audio.types";

describe("answerNextFsm", () => {
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
});
