import { describe, expect, it } from "vitest";
import {
  classifyAnswerQuality,
  hasSubstantialInterviewContent,
  relevanceOverlap,
} from "@/lib/scoring/answerQualityGate";
import { resolveSpeechMetrics } from "@/lib/analytics/sessionComparison";

describe("answerQualityGate — paraphrased behavioral answers", () => {
  const conflictQuestion =
    "Tell me about a time you had a conflict with a team member. How did you handle it?";

  const paraphrasedStarAnswer = `
    When I was at my previous company, two colleagues disagreed about the delivery
    timeline for a shared feature. I spoke with each person separately, clarified the
    constraints, and then facilitated a short alignment meeting where we agreed on a
    phased rollout. I took ownership of the coordination work and we shipped on the
    revised date without further friction. The outcome was a stronger working
    relationship and an on-time release.
  `.trim();

  it("does not mark a paraphrased STAR conflict story as IRRELEVANT", () => {
    expect(classifyAnswerQuality(conflictQuestion, paraphrasedStarAnswer)).toBe("VALID");
  });

  it("detects substantial interview content without question keywords", () => {
    expect(hasSubstantialInterviewContent(paraphrasedStarAnswer)).toBe(true);
  });

  it("credits synonym overlap for conflict/team themes", () => {
    const { hits } = relevanceOverlap(conflictQuestion, paraphrasedStarAnswer);
    expect(hits).toBeGreaterThan(0);
  });

  it("still flags clearly off-topic short answers as IRRELEVANT", () => {
    expect(
      classifyAnswerQuality(
        conflictQuestion,
        "I really enjoy hiking on weekends and cooking pasta with friends.",
      ),
    ).toBe("IRRELEVANT");
  });

  it("still flags empty and IDK answers", () => {
    expect(classifyAnswerQuality(conflictQuestion, "")).toBe("EMPTY");
    expect(classifyAnswerQuality(conflictQuestion, "I don't know")).toBe("NON_RESPONSIVE");
  });
});

describe("resolveSpeechMetrics — unavailable vs zero", () => {
  const session = {
    id: "s1",
    user_id: "u1",
    title: "Mock",
    type: "mock",
    status: "completed",
    lifecycle_status: "COMPLETED",
    deleted_at: null,
    started_at: "2026-09-01T10:00:00.000Z",
    ended_at: "2026-09-01T10:02:00.000Z",
    created_at: "2026-09-01T10:00:00.000Z",
    questions_asked: 3,
    answers_generated: 2,
    avg_wpm: 0,
    filler_words: null,
  };

  it("treats WPM 0 as unavailable", () => {
    const speech = resolveSpeechMetrics(session, {
      session_id: "s1",
      user_id: "u1",
      overall_score: 5,
      communication: 0,
      technical: 0,
      problem_solving: 0,
      confidence: 0,
      details: { filler_rate: 0, wpm_avg: null },
    });
    expect(speech.wpm_avg).toBeNull();
    expect(speech.filler_rate).toBe(0);
  });
});
