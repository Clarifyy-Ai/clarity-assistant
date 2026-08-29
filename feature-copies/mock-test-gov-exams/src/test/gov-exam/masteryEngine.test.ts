import { describe, expect, it } from "vitest";
import {
  adaptiveSoftPriority,
  applyAttemptToMastery,
  applyBatchToMastery,
  buildAttemptInsightSentence,
  computeExamReadiness,
  DEFAULT_MASTERY_CONFIG,
  listWeakTopics,
  performanceSignal,
  recencyFactor,
  resolveMasteryState,
  updateMasteryScore,
} from "@/lib/gov-exam/masteryEngine";

describe("masteryEngine formula", () => {
  it("updates mastery with configurable learning rate factors", () => {
    const prior = 0.5;
    const next = updateMasteryScore(prior, {
      correct: true,
      attempted: true,
      difficulty: "hard",
      quality: 1,
      daysAgo: 0,
    });
    // prior + 0.18 * 1 * 1.25 * 1 * 1 = 0.725
    expect(next).toBeCloseTo(0.725, 5);
  });

  it("penalizes wrong answers and respects clamp", () => {
    const low = updateMasteryScore(0.05, {
      correct: false,
      attempted: true,
      difficulty: "easy",
      quality: 1,
    });
    expect(low).toBe(0);

    const high = updateMasteryScore(0.98, {
      correct: true,
      attempted: true,
      difficulty: "hard",
      quality: 1,
    });
    expect(high).toBe(1);
  });

  it("returns zero performance signal for unattempted", () => {
    expect(performanceSignal({ correct: false, attempted: false })).toBe(0);
    expect(performanceSignal({ correct: true, attempted: true })).toBe(1);
    expect(performanceSignal({ correct: false, attempted: true })).toBe(-1);
  });

  it("applies recency decay", () => {
    expect(recencyFactor(0)).toBe(1);
    expect(recencyFactor(10)).toBe(0.85);
    expect(recencyFactor(100)).toBe(0.55);
  });
});

describe("mastery states and evidence gates", () => {
  it("keeps not_assessed until minimum evidence", () => {
    expect(resolveMasteryState(0.95, 0)).toBe("not_assessed");
    expect(resolveMasteryState(0.2, 1)).toBe("foundation_needed");
  });

  it("requires both score and evidence for higher states", () => {
    expect(resolveMasteryState(0.9, 5)).toBe("developing"); // evidence < practicing min
    expect(resolveMasteryState(0.9, 10)).toBe("strong");
    expect(resolveMasteryState(0.9, 15)).toBe("exam_ready");
    expect(
      resolveMasteryState(0.9, 15, {
        ...DEFAULT_MASTERY_CONFIG,
        minEvidenceForState: {
          ...DEFAULT_MASTERY_CONFIG.minEvidenceForState,
          exam_ready: 20,
        },
      }),
    ).toBe("strong");
  });

  it("batches attempts and bumps evidence only when attempted", () => {
    const row = applyBatchToMastery(
      { topic: "Algebra", mastery_score: 0.5, state: "developing", evidence_count: 2 },
      [
        { correct: true, attempted: true, difficulty: "medium" },
        { correct: false, attempted: false },
        { correct: false, attempted: true, difficulty: "hard" },
      ],
    );
    expect(row.evidence_count).toBe(4);
    expect(row.topic).toBe("Algebra");
    expect(row.mastery_score).toBeGreaterThan(0);
    expect(row.mastery_score).toBeLessThan(1);
  });

  it("seeds first evidence from neutral prior", () => {
    const row = applyAttemptToMastery(null, {
      correct: true,
      attempted: true,
      difficulty: "medium",
    });
    expect(row.evidence_count).toBe(1);
    expect(row.mastery_score).toBeCloseTo(0.45 + 0.18, 5);
    expect(row.state).toBe("foundation_needed");
  });
});

describe("readiness and adaptive ranking", () => {
  it("returns honest empty readiness with no assessed topics", () => {
    const { score, breakdown } = computeExamReadiness([]);
    expect(score).toBe(0);
    expect(breakdown.mean_mastery).toBeNull();
    expect(breakdown.recommended_action).toMatch(/No readiness estimate yet/i);
  });

  it("lists weak topics weakest-first", () => {
    const weak = listWeakTopics([
      { topic: "A", mastery_score: 0.8, state: "strong", evidence_count: 12 },
      { topic: "B", mastery_score: 0.3, state: "foundation_needed", evidence_count: 4 },
      { topic: "C", mastery_score: 0.5, state: "developing", evidence_count: 5 },
    ]);
    expect(weak.map((w) => w.topic)).toEqual(["B", "C"]);
  });

  it("soft-ranks weak topics higher than strong ones", () => {
    const mastery = { Weak: 0.2, Strong: 0.9 };
    const weakPri = adaptiveSoftPriority("Weak", mastery, 0.5);
    const strongPri = adaptiveSoftPriority("Strong", mastery, 0.5);
    const unknownPri = adaptiveSoftPriority("Unknown", mastery, 0.5);
    expect(weakPri).toBeGreaterThan(strongPri);
    expect(unknownPri).toBeGreaterThan(strongPri);
    expect(unknownPri).toBeLessThan(weakPri);
  });

  it("builds action-oriented insight from section data", () => {
    const sentence = buildAttemptInsightSentence({
      subjectBreakdown: {
        Quant: { accuracy: 40, attempted: 10 },
        English: { accuracy: 80, attempted: 10 },
      },
      weakTopics: ["Algebra", "Geometry"],
    });
    expect(sentence).toMatch(/Quant lagged/);
    expect(sentence).toMatch(/Algebra/);
  });

  it("returns null insight when no section data", () => {
    expect(buildAttemptInsightSentence({})).toBeNull();
  });
});
