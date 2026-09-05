import { describe, expect, it } from "vitest";
import {
  buildPersonalizedCatalog,
  dedupeCodingQuestions,
  displayQuestionTitle,
  summarizeSubmissionProgress,
} from "@/lib/coding/catalog";

describe("coding catalog", () => {
  it("falls back for blank titles", () => {
    expect(displayQuestionTitle("")).toMatch(/Untitled problem/);
    expect(displayQuestionTitle("  Sum the numbers  ")).toBe("Sum the numbers");
  });

  it("dedupes questions with the same normalized title", () => {
    const deduped = dedupeCodingQuestions([
      {
        id: "a",
        title: "Two number sum",
        description: "",
        difficulty: "EASY",
        language: "javascript",
        evaluation_mode: "javascript_solve",
      },
      {
        id: "b",
        title: "  two   number sum ",
        description: "Return the sum of a two-element array via solve(input).",
        difficulty: "EASY",
        language: "javascript",
        evaluation_mode: "javascript_solve",
      },
    ]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.id).toBe("b");
  });

  it("tracks submission progress states", () => {
    expect(summarizeSubmissionProgress([])).toMatchObject({ status: "not_started" });
    expect(
      summarizeSubmissionProgress([{ question_id: "q1", score: 40, status: "scored", execution_status: "failed" }]),
    ).toMatchObject({ status: "in_progress", bestScore: 40 });
    expect(
      summarizeSubmissionProgress([{ question_id: "q1", score: 100, status: "scored", execution_status: "passed" }]),
    ).toMatchObject({ status: "passed", passed: true });
  });

  it("ranks incomplete problems ahead of passed ones for profile context", () => {
    const questions = [
      {
        id: "passed",
        title: "Sum the numbers",
        description: "sum array",
        difficulty: "EASY",
        language: "javascript",
        evaluation_mode: "javascript_solve",
      },
      {
        id: "todo",
        title: "Reverse a string",
        description: "reverse input",
        difficulty: "EASY",
        language: "javascript",
        evaluation_mode: "javascript_solve",
      },
    ];
    const submissions = new Map([
      [
        "passed",
        [{ question_id: "passed", score: 100, status: "scored", execution_status: "passed" }],
      ],
    ]);
    const catalog = buildPersonalizedCatalog(questions, submissions, {
      target_role: "Software Engineer",
      notification_prefs: { experience_level: "mid" },
      interview_weaknesses: ["string manipulation"],
    });
    expect(catalog.all[0]?.id).toBe("todo");
    expect(catalog.recommended.some((q) => q.id === "todo")).toBe(true);
    expect(catalog.context.personalized).toBe(true);
  });
});
