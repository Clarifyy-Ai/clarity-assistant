import { describe, expect, it } from "vitest";
import {
  buildBlueprint,
  validateBlueprintHardConstraints,
  validateAssembledPaperHardConstraints,
  type PatternVersion,
} from "@/lib/gov-exam/blueprintEngine";
import { questionFingerprint, conflictsWithSelected } from "@/lib/gov-exam/mcqValidator";

const PLAN_RANK: Record<string, number> = {
  free: 0,
  starter: 0,
  pro: 2,
  elite: 2,
  enterprise: 4,
};

const CAPABILITY_MIN_RANK: Record<string, number> = {
  mock_test: 0,
  gov_exam_ai_fill: 2,
};

function hasCapability(planId: string, capability: string): boolean {
  const rank = PLAN_RANK[planId] ?? -1;
  const need = CAPABILITY_MIN_RANK[capability] ?? 999;
  return rank >= need;
}

const samplePattern: PatternVersion = {
  id: "pattern-upsc-prelims-1",
  version: "2024.1",
  total_questions: 100,
  total_marks: 200,
  duration_minutes: 120,
  negative_mark: 0.66,
  marks_per_question: 2,
  languages: ["en", "hi"],
  sections: [
    { code: "gs1", name: "General Studies Paper 1", question_count: 100, marks: 200 },
  ],
};

const multiSectionPattern: PatternVersion = {
  id: "pattern-ssc-cgl-tier1",
  version: "2024.1",
  total_questions: 100,
  total_marks: 200,
  duration_minutes: 60,
  negative_mark: 0.5,
  marks_per_question: 2,
  languages: ["en", "hi"],
  sections: [
    { code: "gi_reasoning", name: "General Intelligence and Reasoning", question_count: 25, marks: 50 },
    { code: "gen_awareness", name: "General Awareness", question_count: 25, marks: 50 },
    { code: "quant_aptitude", name: "Quantitative Aptitude", question_count: 25, marks: 50 },
    { code: "eng_comprehension", name: "English Comprehension", question_count: 25, marks: 50 },
  ],
};

describe("Government Exam Mock-Paper Generation Engine", () => {
  describe("1. Exact Counts & Blueprint Construction", () => {
    it("builds exact questions, marks, and section allocations for full mock", () => {
      const bp = buildBlueprint({
        examId: "exam-ssc-cgl",
        examCode: "SSC_CGL",
        stageId: "tier-1",
        pattern: multiSectionPattern,
        language: "en",
        sourceYears: [2024, 2023, 2022],
        mode: "generated_mock",
        randomSeed: "test-seed-1",
      });

      expect(bp.total_questions).toBe(100);
      expect(bp.total_marks).toBe(200);
      expect(bp.duration_minutes).toBe(60);
      expect(bp.sections).toHaveLength(4);
      expect(bp.slots).toHaveLength(100);

      const hardCheck = validateBlueprintHardConstraints(bp);
      expect(hardCheck.ok).toBe(true);
    });

    it("scales sections accurately for custom practice sets", () => {
      const bp = buildBlueprint({
        examId: "exam-ssc-cgl",
        examCode: "SSC_CGL",
        stageId: "tier-1",
        pattern: multiSectionPattern,
        language: "en",
        sourceYears: [2024],
        mode: "custom_mock",
        randomSeed: "test-seed-2",
        customQuestionCount: 20,
        customDuration: 15,
      });

      expect(bp.total_questions).toBe(20);
      expect(bp.total_marks).toBe(40);
      expect(bp.duration_minutes).toBe(15);
      expect(bp.paper_class).toBe("custom_practice");
      expect(bp.label).toContain("Custom Practice Set");

      const sectionSum = bp.sections.reduce((acc, s) => acc + s.question_count, 0);
      expect(sectionSum).toBe(20);
      expect(bp.slots).toHaveLength(20);
    });
  });

  describe("2. Hard-Constraint Validation (Pre-Publication Gate)", () => {
    it("passes validation when assembled questions satisfy all constraints", () => {
      const bp = buildBlueprint({
        examId: "exam-upsc",
        examCode: "UPSC_CSE",
        stageId: "prelims",
        pattern: samplePattern,
        language: "en",
        sourceYears: [2024],
        mode: "custom_mock",
        randomSeed: "seed-hard-1",
        customQuestionCount: 10,
      });

      const assembledQuestions = Array.from({ length: 10 }, (_, i) => ({
        id: `q-${i + 1}`,
        question_text: `Question stem content for item number ${i + 1}`,
        options: ["A", "B", "C", "D"],
        correct_answer: "B",
        section_code: "gs1",
      }));

      const check = validateAssembledPaperHardConstraints({
        blueprint: bp,
        questions: assembledQuestions,
      });

      expect(check.ok).toBe(true);
    });

    it("blocks publication when question count does not match blueprint", () => {
      const bp = buildBlueprint({
        examId: "exam-upsc",
        examCode: "UPSC_CSE",
        stageId: "prelims",
        pattern: samplePattern,
        language: "en",
        sourceYears: [2024],
        mode: "custom_mock",
        randomSeed: "seed-hard-2",
        customQuestionCount: 10,
      });

      // Only 8 provided instead of 10
      const assembledQuestions = Array.from({ length: 8 }, (_, i) => ({
        id: `q-${i + 1}`,
        question_text: `Question stem content for item number ${i + 1}`,
        options: ["A", "B", "C", "D"],
        correct_answer: "B",
        section_code: "gs1",
      }));

      const check = validateAssembledPaperHardConstraints({
        blueprint: bp,
        questions: assembledQuestions,
      });

      expect(check.ok).toBe(false);
      if (!check.ok) {
        expect(check.errors.some((e) => e.includes("Exact question count failed"))).toBe(true);
      }
    });

    it("blocks publication when duplicate questions or IDs exist", () => {
      const bp = buildBlueprint({
        examId: "exam-upsc",
        examCode: "UPSC_CSE",
        stageId: "prelims",
        pattern: samplePattern,
        language: "en",
        sourceYears: [2024],
        mode: "custom_mock",
        randomSeed: "seed-hard-3",
        customQuestionCount: 10,
      });

      const assembledQuestions = Array.from({ length: 10 }, (_, i) => ({
        id: i === 5 ? "q-1" : `q-${i + 1}`, // Duplicate ID q-1
        question_text: i === 5 ? "Question stem content for item number 1" : `Question stem content for item number ${i + 1}`,
        options: ["A", "B", "C", "D"],
        correct_answer: "B",
        section_code: "gs1",
      }));

      const check = validateAssembledPaperHardConstraints({
        blueprint: bp,
        questions: assembledQuestions,
      });

      expect(check.ok).toBe(false);
      if (!check.ok) {
        expect(check.errors.some((e) => e.includes("Duplicate question ID"))).toBe(true);
      }
    });

    it("blocks publication when questions have missing correct answers or invalid options", () => {
      const bp = buildBlueprint({
        examId: "exam-upsc",
        examCode: "UPSC_CSE",
        stageId: "prelims",
        pattern: samplePattern,
        language: "en",
        sourceYears: [2024],
        mode: "custom_mock",
        randomSeed: "seed-hard-4",
        customQuestionCount: 10,
      });

      const assembledQuestions = Array.from({ length: 10 }, (_, i) => ({
        id: `q-${i + 1}`,
        question_text: `Question stem content for item number ${i + 1}`,
        options: i === 2 ? ["Only One Option"] : ["A", "B", "C", "D"], // Invalid option count at 2
        correct_answer: i === 3 ? null : "B", // Missing correct answer at 3
        section_code: "gs1",
      }));

      const check = validateAssembledPaperHardConstraints({
        blueprint: bp,
        questions: assembledQuestions,
      });

      expect(check.ok).toBe(false);
      if (!check.ok) {
        expect(check.errors.some((e) => e.includes("missing or invalid correct_answer"))).toBe(true);
        expect(check.errors.some((e) => e.includes("fewer than 2 options"))).toBe(true);
      }
    });
  });

  describe("3. Deduplication and Fingerprint Matching", () => {
    it("detects fingerprint collision and peer conflict", () => {
      const q1 = "In which year was the Reserve Bank of India established?";
      const opts1 = ["1935", "1947", "1950", "1969"];

      const fp1 = questionFingerprint(q1, opts1);
      const fp2 = questionFingerprint(q1.toUpperCase(), opts1);
      expect(fp1).toBe(fp2);

      const peers = [q1];
      const conflict = conflictsWithSelected(
        "In which year was the Reserve Bank of India (RBI) established?",
        peers,
      );
      expect(conflict).toBe(true);
    });
  });

  describe("4. Capability Authorization (gov_exam_ai_fill)", () => {
    it("authorizes Pro/Enterprise plans and rejects Free plans for AI gap-fill", () => {
      expect(hasCapability("free", "gov_exam_ai_fill")).toBe(false);
      expect(hasCapability("starter", "gov_exam_ai_fill")).toBe(false);
      expect(hasCapability("pro", "gov_exam_ai_fill")).toBe(true);
      expect(hasCapability("elite", "gov_exam_ai_fill")).toBe(true);
      expect(hasCapability("enterprise", "gov_exam_ai_fill")).toBe(true);
    });
  });

  describe("5. Reproducibility", () => {
    it("generates identical blueprint structure with the same random seed", () => {
      const input = {
        examId: "exam-ssc-cgl",
        examCode: "SSC_CGL",
        stageId: "tier-1",
        pattern: multiSectionPattern,
        language: "en",
        sourceYears: [2024, 2023],
        mode: "generated_mock" as const,
        randomSeed: "reproducible-deterministic-seed-12345",
      };

      const bp1 = buildBlueprint(input);
      const bp2 = buildBlueprint(input);

      expect(bp1).toEqual(bp2);
      expect(bp1.slots).toEqual(bp2.slots);
    });
  });
});
