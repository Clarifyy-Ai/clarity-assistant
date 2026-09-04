import { describe, expect, it } from "vitest";
import {
  decideSilenceAdvance,
  DEFAULT_SILENCE_POLICY,
  transcriptLooksComplete,
} from "@/lib/mock/silencePolicy";
import { isDuplicateQuestion, questionSimilarity } from "@/lib/mock/questionDuplicate";
import {
  buildInterviewBlueprint,
  validateInterviewBlueprint,
  getBlueprintSlot,
} from "@/lib/mock/interviewBlueprint";
import { buildInterviewContextSnapshot } from "@/lib/mock/interviewContext";
import {
  buildTtsPlaybackId,
  shouldAutoPlayQuestionTts,
  reduceTtsPlayback,
} from "@/lib/mock/ttsPlayback";
import { shouldRequestFollowUp, followUpCapForDepth } from "@/lib/mock/followUpPolicy";
import { reduceAnswerNext } from "@/lib/mock/answerNextFsm";
import {
  buildDurableTurnsFromProgress,
  countScorableMockAnswers,
  mockSessionHasScorecardEvidence,
  scorecardEligibleTurnCount,
} from "@/lib/mock/durableMockTurns";
import type { LiveSessionConfig } from "@/types/session.types";

const baseConfig = {
  company: "Acme",
  role: "Engineer",
  hint_style: "short_hints",
  model: "gemini-flash",
  smart_routing: true,
  stealth_mode: false,
  resume_id: null,
  jd_id: null,
  interview_type: "behavioural",
  instructions: "",
  enable_system_audio: false,
  follow_up_depth: "light",
  difficulty: "medium",
  duration_minutes: 5,
} as LiveSessionConfig;

describe("silencePolicy", () => {
  it("ignores brief pauses and finalizes after confirm window", () => {
    expect(
      decideSilenceAdvance({
        silenceMs: 500,
        hasSpoken: true,
        answerDurationMs: 3000,
        transcriptLooksComplete: true,
        interviewerSpeaking: false,
        paused: false,
      }),
    ).toBe("wait");

    expect(
      decideSilenceAdvance({
        silenceMs: DEFAULT_SILENCE_POLICY.silenceConfirmMs,
        hasSpoken: true,
        answerDurationMs: 3000,
        transcriptLooksComplete: true,
        interviewerSpeaking: false,
        paused: false,
      }),
    ).toBe("finalize");
  });

  it("prompts when no speech for noAnswerMs", () => {
    expect(
      decideSilenceAdvance({
        silenceMs: DEFAULT_SILENCE_POLICY.noAnswerMs,
        hasSpoken: false,
        answerDurationMs: 0,
        transcriptLooksComplete: false,
        interviewerSpeaking: false,
        paused: false,
      }),
    ).toBe("no_answer_prompt");
  });

  it("detects complete transcripts", () => {
    expect(transcriptLooksComplete("I led a migration for six months.")).toBe(true);
    expect(transcriptLooksComplete("um")).toBe(false);
  });
});

describe("questionDuplicate", () => {
  it("rejects exact and semantic duplicates", () => {
    const prev = ["Tell me about a time you led a team through conflict."];
    expect(isDuplicateQuestion(prev[0], prev).duplicate).toBe(true);
    expect(
      isDuplicateQuestion(
        "Can you tell me about a time you led a team through a conflict?",
        prev,
      ).reason,
    ).toBe("semantic");
    expect(questionSimilarity(prev[0], "What is your favorite color?")).toBeLessThan(0.3);
  });
});

describe("interviewBlueprint", () => {
  it("builds and validates a matching blueprint", () => {
    const ctx = buildInterviewContextSnapshot({
      config: baseConfig,
      plannedQuestionCount: 5,
      durationMinutes: 5,
      resumeText: "Built APIs",
      jdText: "Need APIs",
    });
    const bp = buildInterviewBlueprint(ctx);
    expect(validateInterviewBlueprint(bp, ctx)).toBeNull();
    expect(bp.slots).toHaveLength(5);
    expect(getBlueprintSlot(bp, 1)?.phase).toBe("introduction");
    expect(getBlueprintSlot(bp, 5)?.is_closing).toBe(true);
  });
});

describe("ttsPlayback", () => {
  it("builds stable playback ids and blocks auto-replay after complete", () => {
    const id = buildTtsPlaybackId({
      sessionId: "s1",
      questionId: "q1",
      voiceId: "classic_professional",
      textVersion: "Hello?",
    });
    expect(id).toMatch(/^tts_/);
    let rec = reduceTtsPlayback(null, {
      type: "REQUEST",
      playback_id: id,
      question_id: "q1",
      voice_id: "classic_professional",
    });
    rec = reduceTtsPlayback(rec, { type: "START" });
    rec = reduceTtsPlayback(rec, { type: "COMPLETE" });
    expect(shouldAutoPlayQuestionTts(rec, id)).toBe(false);
    expect(shouldAutoPlayQuestionTts(rec, id + "_other")).toBe(true);
  });
});

describe("followUpPolicy + FSM", () => {
  it("requests follow-ups for incomplete answers within cap", () => {
    expect(followUpCapForDepth("light")).toBe(1);
    expect(
      shouldRequestFollowUp({
        depth: "light",
        followUpsUsed: 0,
        maxFollowUps: 1,
        answerText: "I fixed a bug",
        skipped: false,
      }),
    ).toBe(true);
    expect(
      shouldRequestFollowUp({
        depth: "none",
        followUpsUsed: 0,
        maxFollowUps: 1,
        answerText: "short",
        skipped: false,
      }),
    ).toBe(false);
  });

  it("moves answer_saved → follow_up_pending → next", () => {
    let s = reduceAnswerNext("ready", { type: "FINALIZE" });
    s = reduceAnswerNext(s, { type: "ANSWER_SAVED" });
    s = reduceAnswerNext(s, { type: "FOLLOW_UP" });
    expect(s).toBe("follow_up_pending");
    s = reduceAnswerNext(s, { type: "REQUEST_NEXT" });
    expect(s).toBe("next_question_pending");
  });
});

describe("durableMockTurns", () => {
  it("counts scorecard-eligible turns", () => {
    const turns = buildDurableTurnsFromProgress({
      sessionId: "s1",
      questions: [{ id: "q1", question_text: "Q1" }],
      answers: [
        {
          question_id: "q1",
          question_text: "Q1",
          answer_text: "A solid answer.",
          skipped: false,
          question_index: 0,
          timestamp: new Date().toISOString(),
        },
        {
          question_id: "q2",
          question_text: "Q2",
          answer_text: "",
          skipped: true,
          question_index: 1,
          timestamp: new Date().toISOString(),
        },
      ],
    });
    expect(scorecardEligibleTurnCount(turns)).toBe(1);
  });

  it("aligns mock answer evidence with Edge hasAnswers (no fake 0/0)", () => {
    expect(
      countScorableMockAnswers([
        { skipped: false, status: "answered", answer_text: "Real answer" },
        { skipped: false, status: "invalid", answer_text: "Too short but present" },
        { skipped: true, answer_text: "(skipped)" },
      ]),
    ).toBe(2);
    expect(mockSessionHasScorecardEvidence([])).toBe(false);
  });
});
