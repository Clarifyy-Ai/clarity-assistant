import { describe, expect, it } from "vitest";
import {
  buildBlueprint,
  validateBlueprintHardConstraints,
} from "@/lib/gov-exam/blueprintEngine";
import { weightedTopicFrequency, recencyWeight } from "@/lib/gov-exam/recencyWeights";
import {
  validateSingleCorrectMcq,
  isNearDuplicate,
  questionFingerprint,
} from "@/lib/gov-exam/mcqValidator";
import { detectPatternShift } from "@/lib/gov-exam/patternShift";

const pattern = {
  id: "p1",
  version: "2024.1",
  total_questions: 100,
  total_marks: 200,
  duration_minutes: 60,
  negative_mark: 0.5,
  marks_per_question: 2,
  languages: ["en", "hi"],
  sections: [
    { code: "reasoning", name: "Reasoning", question_count: 25, marks: 50 },
    { code: "awareness", name: "GA", question_count: 25, marks: 50 },
    { code: "quant", name: "Quant", question_count: 25, marks: 50 },
    { code: "english", name: "English", question_count: 25, marks: 50 },
  ],
};

describe("gov exam blueprint", () => {
  it("builds exact section totals for official pattern", () => {
    const bp = buildBlueprint({
      examId: "e1",
      examCode: "SSC_CGL",
      stageId: "s1",
      pattern,
      language: "en",
      sourceYears: [2024, 2023],
      mode: "generated_mock",
      randomSeed: "seed-a",
    });
    expect(bp.total_questions).toBe(100);
    expect(bp.slots.length).toBe(100);
    expect(validateBlueprintHardConstraints(bp)).toEqual({ ok: true });
    expect(bp.paper_class).toBe("ai_generated");
  });

  it("is reproducible for the same seed and inputs", () => {
    const input = {
      examId: "e1",
      examCode: "SSC_CGL",
      stageId: "s1",
      pattern,
      language: "en",
      sourceYears: [2024, 2023, 2022],
      mode: "generated_mock" as const,
      randomSeed: "repro-seed-42",
    };
    const a = buildBlueprint(input);
    const b = buildBlueprint(input);
    expect(a).toEqual(b);
    expect(a.random_seed).toBe("repro-seed-42");
    expect(a.slots.map((s) => s.section_code)).toEqual(
      b.slots.map((s) => s.section_code),
    );
  });

  it("labels custom counts as custom practice", () => {
    const bp = buildBlueprint({
      examId: "e1",
      examCode: "SSC_CGL",
      stageId: "s1",
      pattern,
      language: "en",
      sourceYears: [2024],
      mode: "custom_mock",
      randomSeed: "seed-b",
      customQuestionCount: 25,
      customDuration: 30,
    });
    expect(bp.total_questions).toBe(25);
    expect(bp.paper_class).toBe("custom_practice");
    expect(validateBlueprintHardConstraints(bp).ok).toBe(true);
  });
});

describe("recency weighting", () => {
  it("weights latest cycles higher", () => {
    expect(recencyWeight(0)).toBe(1);
    expect(recencyWeight(1)).toBe(0.85);
    expect(recencyWeight(4)).toBe(0.35);
    const freq = weightedTopicFrequency(
      [
        { year: 2024, count: 10 },
        { year: 2020, count: 10 },
      ],
      2024,
    );
    expect(freq).toBeGreaterThan(5);
  });
});

describe("mcq validator", () => {
  it("requires unique options and valid index", () => {
    expect(
      validateSingleCorrectMcq({
        question_text: "What is 2+2?",
        options: ["3", "4", "5", "6"],
        correct_index: 1,
      }).ok,
    ).toBe(true);
    expect(
      validateSingleCorrectMcq({
        question_text: "What is 2+2?",
        options: ["4", "4", "5", "6"],
        correct_index: 0,
      }).ok,
    ).toBe(false);
  });

  it("detects near duplicates", () => {
    expect(
      isNearDuplicate(
        "Capital of India is?",
        "Capital of India is?",
      ),
    ).toBe(true);
    expect(
      questionFingerprint("A?", ["1", "2"]),
    ).toBe(questionFingerprint("a?", ["2", "1"]));
  });
});

describe("pattern shift", () => {
  it("flags material changes and reduces historical weight", () => {
    const shift = detectPatternShift(
      {
        total_questions: 100,
        total_marks: 200,
        duration_minutes: 60,
        negative_mark: 0.5,
        section_codes: ["a", "b"],
      },
      {
        total_questions: 100,
        total_marks: 200,
        duration_minutes: 75,
        negative_mark: 0.5,
        section_codes: ["a", "b", "c"],
      },
    );
    expect(shift.material).toBe(true);
    expect(shift.changes).toContain("duration");
    expect(shift.historicalWeightFactor).toBe(0.35);
  });
});
