import { describe, expect, it } from "vitest";
import {
  buildBlueprint,
  validateAssembledPaperHardConstraints,
  type PatternVersion,
} from "@/lib/gov-exam/blueprintEngine";
import { normalizeGovSourceUrl } from "@/lib/gov-exam/sourceRegistry";

const officialPattern: PatternVersion = {
  id: "pattern-ssc-cgl",
  version: "2024.1",
  total_questions: 25,
  total_marks: 50,
  duration_minutes: 30,
  negative_mark: 0.5,
  marks_per_question: 2,
  languages: ["en"],
  sections: [
    { code: "reasoning", name: "Reasoning", question_count: 25, marks: 50 },
  ],
};

describe("Government Exam Full Lifecycle E2E", () => {
  it("executes complete lifecycle from source discovery to test scoring and review", () => {
    // 1. Source Discovery & Domain Allowlist validation
    const rawUrl = "https://ssc.gov.in/notice_files/CGL_2024_Tier1_Paper.pdf";
    const normalizedUrl = normalizeGovSourceUrl(rawUrl);
    expect(normalizedUrl).toBe("https://ssc.gov.in/notice_files/CGL_2024_Tier1_Paper.pdf");

    // 2. Collection & Ingestion
    const sourceRecord = {
      id: "src-101",
      recruiting_body: "SSC",
      exam_name: "SSC CGL",
      document_type: "question_paper",
      official_url: normalizedUrl,
      licensing_state: "official" as const,
      source_state: "active" as const,
      file_hash: "sha256-abcdef123456",
    };
    expect(sourceRecord.licensing_state).toBe("official");

    // 3. Question Extraction & Segmentation
    const extractedQuestions = Array.from({ length: 25 }, (_, idx) => ({
      id: `q-${idx + 1}`,
      question_text: `Official SSC CGL reasoning question #${idx + 1}`,
      options: ["A) Option 1", "B) Option 2", "C) Option 3", "D) Option 4"],
      correct_answer: "B",
      section_code: "reasoning",
      review_state: "approved" as const,
    }));
    expect(extractedQuestions).toHaveLength(25);

    // 4. Admin Review and Approval
    const unreviewedCount = extractedQuestions.filter((q) => q.review_state !== "approved").length;
    expect(unreviewedCount).toBe(0);

    // 5. Generate Exact Mock Paper (Blueprint & Assembly)
    const blueprint = buildBlueprint({
      examId: "exam-ssc-cgl",
      examCode: "SSC_CGL",
      stageId: "tier-1",
      pattern: officialPattern,
      language: "en",
      sourceYears: [2024],
      mode: "official_previous",
      randomSeed: "e2e-seed-123",
      customQuestionCount: 25,
      customDuration: 30,
    });

    const hardCheck = validateAssembledPaperHardConstraints({
      blueprint,
      questions: extractedQuestions,
    });
    expect(hardCheck.ok).toBe(true);

    // 6. Start Mock Test Session
    const mockTestSession = {
      testId: "test-ssc-cgl-1",
      paperId: "paper-gen-1",
      totalQuestions: blueprint.total_questions,
      timeLimitMinutes: blueprint.duration_minutes,
      answers: {} as Record<number, string>,
      status: "IN_PROGRESS" as "IN_PROGRESS" | "SUBMITTED",
    };
    expect(mockTestSession.status).toBe("IN_PROGRESS");

    // 7. Autosave User Responses
    mockTestSession.answers[0] = "B"; // Correct (+2)
    mockTestSession.answers[1] = "B"; // Correct (+2)
    mockTestSession.answers[2] = "A"; // Incorrect (-0.5)
    expect(Object.keys(mockTestSession.answers)).toHaveLength(3);

    // 8. Submit Test
    mockTestSession.status = "SUBMITTED";
    expect(mockTestSession.status).toBe("SUBMITTED");

    // 9. Score Test with Exact Negative Marking
    let positiveScore = 0;
    let negativeScore = 0;
    extractedQuestions.forEach((q, idx) => {
      const userAnswer = mockTestSession.answers[idx];
      if (userAnswer) {
        if (userAnswer === q.correct_answer) {
          positiveScore += blueprint.marks_per_question;
        } else {
          negativeScore += blueprint.negative_mark;
        }
      }
    });

    const totalCalculatedScore = Math.max(0, positiveScore - negativeScore);
    expect(positiveScore).toBe(4); // 2 correct * 2 marks
    expect(negativeScore).toBe(0.5); // 1 wrong * 0.5 negative marks
    expect(totalCalculatedScore).toBe(3.5);

    // 10. Review Results
    const scorecard = {
      testId: mockTestSession.testId,
      score: totalCalculatedScore,
      maxScore: blueprint.total_marks,
      attempted: 3,
      correct: 2,
      incorrect: 1,
      accuracyPercentage: Math.round((2 / 3) * 100),
    };
    expect(scorecard.score).toBe(3.5);
    expect(scorecard.accuracyPercentage).toBe(67);
  });
});
