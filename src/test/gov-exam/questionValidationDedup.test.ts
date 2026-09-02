import { describe, expect, it } from "vitest";
import {
  DeterministicValidators,
  validateQuestionIntegrity,
  type QuestionIntegrityInput,
} from "@/lib/gov-exam/validators/deterministicValidators";
import {
  computeOptionSetFingerprint,
  computeTemplateFingerprint,
  evaluateCurrentAffairsStaleness,
  evaluateQuestionSimilarity,
  filterIntraPaperDuplicates,
  persistSimilarityMatch,
} from "@/lib/gov-exam/validators/questionDeduplication";

describe("Deterministic Question Validation and Deduplication", () => {
  describe("1. Question Integrity & Anomaly Rules", () => {
    it("validates a complete, sound question payload", () => {
      const validQ: QuestionIntegrityInput = {
        question_text: "What is the capital of India?",
        options: ["Mumbai", "New Delhi", "Kolkata", "Chennai"],
        correct_answer: "B",
        marks_positive: 2,
        marks_negative: 0.5,
        language: "en",
        source: "OFFICIAL_UPSC_2024",
      };

      const result = validateQuestionIntegrity(validQ);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects short stems, missing options, and duplicate options", () => {
      const invalidQ: QuestionIntegrityInput = {
        question_text: "Why?",
        options: ["Option A", "Option A", "Option B"],
        correct_answer: "A",
        source: "TEST",
      };

      const result = validateQuestionIntegrity(invalidQ);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("too short"))).toBe(true);
      expect(result.errors.some((e) => e.includes("duplicate options"))).toBe(true);
    });

    it("detects answer leakage in question stem", () => {
      const leakedQ: QuestionIntegrityInput = {
        question_text: "Calculate the speed of the train. The correct answer is (B).",
        options: ["50 km/h", "60 km/h", "70 km/h", "80 km/h"],
        correct_answer: "B",
        source: "SSC_CGL_2024",
      };

      const result = validateQuestionIntegrity(leakedQ);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("leaked correct answer"))).toBe(true);
    });

    it("detects missing passage, table, or diagram references", () => {
      const missingMediaQ: QuestionIntegrityInput = {
        question_text: "Refer to the given figure below and find the value of angle theta.",
        options: ["30°", "45°", "60°", "90°"],
        correct_answer: "C",
        source: "JEE_MAIN",
      };

      const result = validateQuestionIntegrity(missingMediaQ);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("figure/diagram"))).toBe(true);
    });

    it("rejects invalid marks and negative penalty exceeding positive marks", () => {
      const badMarksQ: QuestionIntegrityInput = {
        question_text: "What is Newton's third law of motion?",
        options: ["Action equals reaction", "F=ma", "Inertia", "Gravity"],
        correct_answer: "A",
        marks_positive: 1,
        marks_negative: 2, // Penalty exceeds reward
        source: "NDA_2024",
      };

      const result = validateQuestionIntegrity(badMarksQ);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("penalty cannot exceed"))).toBe(true);
    });
  });

  describe("2. Deterministic Domain-Specific Validators", () => {
    it("validates arithmetic division and rejects division by zero", () => {
      expect(DeterministicValidators.validateDivision(100, 4, 25)).toBe(true);
      expect(() => DeterministicValidators.validateDivision(100, 0, 0)).toThrow(
        "DIV_BY_ZERO",
      );
    });

    it("validates algebra quadratic roots and detects complex roots", () => {
      // x^2 - 5x + 6 = 0  => roots are 2 and 3
      const roots = DeterministicValidators.solveQuadratic(1, -5, 6);
      expect(roots).toEqual([2, 3]);

      // x^2 + 1 = 0  => complex roots
      expect(() => DeterministicValidators.solveQuadratic(1, 0, 1)).toThrow(
        "COMPLEX_ROOTS",
      );
    });

    it("validates unit conversions (km/h <-> m/s)", () => {
      expect(DeterministicValidators.kmhToMs(72)).toBe(20);
      expect(DeterministicValidators.msToKmh(20)).toBe(72);
    });

    it("enforces domain restrictions for probabilities and integer counts", () => {
      expect(DeterministicValidators.validateProbability(0.75)).toBe(true);
      expect(() => DeterministicValidators.validateProbability(1.25)).toThrow(
        "INVALID_PROBABILITY",
      );
      expect(DeterministicValidators.validateCountOrAge(25, "Age")).toBe(true);
      expect(() => DeterministicValidators.validateCountOrAge(-5, "Age")).toThrow(
        "INVALID_DOMAIN",
      );
    });

    it("calculates direction displacement and net distance accurately", () => {
      // 3m North, 4m East => net distance 5m
      const disp = DeterministicValidators.calculateDirectionsDisplacement([
        ["N", 3],
        ["E", 4],
      ]);
      expect(disp.dx).toBe(4);
      expect(disp.dy).toBe(3);
      expect(disp.netDistance).toBe(5);
    });

    it("verifies coding-decoding Caesar cipher shifts", () => {
      expect(DeterministicValidators.verifyCaesarShift("HELLO", "KHOOR", 3)).toBe(
        true,
      );
      expect(DeterministicValidators.verifyCaesarShift("HELLO", "WORLD", 3)).toBe(
        false,
      );
    });

    it("validates formula-based science problems (Physics)", () => {
      // F = ma (10kg * 2m/s^2 = 20N)
      expect(DeterministicValidators.newtonsSecondLaw(10, 2)).toBe(20);
      // V = IR (2A * 5 ohms = 10V)
      expect(DeterministicValidators.ohmsLawVoltage(2, 5)).toBe(10);
      // E_k = 0.5 * m * v^2 (2kg, 3m/s => 9J)
      expect(DeterministicValidators.kineticEnergy(2, 3)).toBe(9);
    });
  });

  describe("3. Multi-Signal Similarity & Deduplication", () => {
    it("identifies exact duplicate questions with fingerprint match", () => {
      const q1 = "What is the speed of light in vacuum?";
      const opts = ["3x10^8 m/s", "2x10^8 m/s", "1.5x10^8 m/s", "4x10^8 m/s"];

      const evalResult = evaluateQuestionSimilarity(q1, opts, q1, opts, "q-match-1");
      expect(evalResult.decision).toBe("exact_duplicate");
      expect(evalResult.similarityScore).toBe(1.0);
      expect(evalResult.fingerprintMatch).toBe(true);
    });

    it("detects near duplicates with minor grammatical variations", () => {
      const q1 = "A train 150 meters long passes a telegraph pole in 12 seconds. Find the speed of the train.";
      const opts1 = ["45 km/h", "50 km/h", "54 km/h", "60 km/h"];

      const q2 = "A train of length 150m crosses a telegraph pole in 12 seconds. What is the speed of the train?";
      const opts2 = ["45 km/h", "50 km/h", "54 km/h", "60 km/h"];

      const evalResult = evaluateQuestionSimilarity(q1, opts1, q2, opts2, "q-match-2");
      expect(evalResult.decision).toBe("near_duplicate");
      expect(evalResult.similarityScore).toBeGreaterThanOrEqual(0.60);
    });

    it("detects template clones with changed numbers", () => {
      const t1 = computeTemplateFingerprint("A train 200 meters long passes a pole in 15 seconds.");
      const t2 = computeTemplateFingerprint("A train 400 meters long passes a pole in 30 seconds.");
      expect(t1).toBe(t2);

      const q1 = "A can do a piece of work in 10 days and B in 15 days.";
      const opts1 = ["6 days", "8 days", "10 days", "12 days"];
      const q2 = "A can do a piece of work in 20 days and B in 30 days.";
      const opts2 = ["6 days", "8 days", "10 days", "12 days"];

      const evalResult = evaluateQuestionSimilarity(q1, opts1, q2, opts2, "q-match-3");
      expect(evalResult.decision).toBe("template_clone");
      expect(evalResult.templateSimilarity).toBeGreaterThanOrEqual(0.9);
    });

    it("marks distinct questions as unique", () => {
      const q1 = "Explain the process of photosynthesis in green plants.";
      const opts1 = ["Light dependent", "Dark reaction", "Both", "None"];

      const q2 = "Which battle was fought in the year 1526 AD?";
      const opts2 = ["First Battle of Panipat", "Battle of Khanwa", "Battle of Plassey", "Battle of Buxar"];

      const evalResult = evaluateQuestionSimilarity(q1, opts1, q2, opts2);
      expect(evalResult.decision).toBe("unique");
      expect(evalResult.similarityScore).toBeLessThan(0.3);
    });

    it("persists similarity matches with reviewer override options", async () => {
      let upsertedRow: any = null;
      const mockSupabase = {
        from: (table: string) => ({
          upsert: (row: any) => {
            upsertedRow = row;
            return Promise.resolve({ error: null });
          },
        }),
      } as any;

      const res = await persistSimilarityMatch(mockSupabase, {
        questionId: "q-orig-1",
        matchingQuestionId: "q-dup-2",
        similarityScore: 0.94,
        decision: "near_duplicate",
        reviewerOverride: "distinct",
        reviewerNotes: "Different exam shift context, keep distinct.",
      });

      expect(res.success).toBe(true);
      expect(upsertedRow.question_id).toBe("q-orig-1");
      expect(upsertedRow.matching_question_id).toBe("q-dup-2");
      expect(upsertedRow.similarity_score).toBe(0.94);
      expect(upsertedRow.reviewer_override).toBe("distinct");
    });
  });

  describe("4. Current Affairs Lifecycle & Staleness Detection", () => {
    it("flags expired current affairs content automatically", () => {
      const staleMeta = {
        applicableDate: "2023-01-01",
        cutoffDate: "2023-06-01",
        expiryDate: "2024-01-01", // Past date
      };

      const refDate = new Date("2026-08-21T00:00:00Z");
      const check = evaluateCurrentAffairsStaleness(staleMeta, refDate);
      expect(check.isStale).toBe(true);
      expect(check.reason).toContain("expired on 2024-01-01");
    });

    it("flags questions with cutoff older than 1 year", () => {
      const oldCutoffMeta = {
        applicableDate: "2024-01-01",
        cutoffDate: "2024-01-01", // More than 1 year ago relative to 2026
      };

      const refDate = new Date("2026-08-21T00:00:00Z");
      const check = evaluateCurrentAffairsStaleness(oldCutoffMeta, refDate);
      expect(check.isStale).toBe(true);
      expect(check.reason).toContain("exceeded 1-year cutoff");
    });

    it("marks active, unexpired current affairs as fresh", () => {
      const freshMeta = {
        applicableDate: "2026-08-01",
        cutoffDate: "2026-08-01",
        expiryDate: "2027-08-01",
      };

      const refDate = new Date("2026-08-21T00:00:00Z");
      const check = evaluateCurrentAffairsStaleness(freshMeta, refDate);
      expect(check.isStale).toBe(false);
    });
  });

  describe("5. Intra-paper duplicate collapse", () => {
    it("prevents colliding stems from occupying the same paper", () => {
      const result = filterIntraPaperDuplicates([
        {
          id: "q1",
          question_text: "What is the capital of India?",
          options: ["Mumbai", "New Delhi", "Kolkata", "Chennai"],
        },
        {
          id: "q2",
          question_text: "What is the capital of India?",
          options: ["Mumbai", "New Delhi", "Kolkata", "Chennai"],
        },
        {
          id: "q3",
          question_text: "Which river is the longest in India?",
          options: ["Ganga", "Yamuna", "Godavari", "Narmada"],
        },
      ]);
      expect(result.kept.map((q) => q.id)).toEqual(["q1", "q3"]);
      expect(result.dropped).toHaveLength(1);
      expect(result.dropped[0]?.decision).toBe("exact_duplicate");
    });
  });
});
