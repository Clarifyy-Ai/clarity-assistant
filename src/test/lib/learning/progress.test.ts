import { describe, expect, it } from "vitest";
import {
  canIssueCertificate,
  coursePercentage,
  lessonCompletionRatio,
} from "@/lib/learning/progress";

describe("learning progress", () => {
  const modules = [
    {
      id: "m1",
      sortOrder: 0,
      lessons: [
        { id: "l1", moduleId: "m1", sortOrder: 0 },
        { id: "l2", moduleId: "m1", sortOrder: 1 },
      ],
    },
  ];
  const quizzes = [
    { id: "q1", isFinal: false },
    { id: "q-final", isFinal: true },
  ];

  it("weights lessons and quizzes in course percentage", () => {
    const pct = coursePercentage(
      modules,
      new Set(["l1", "l2"]),
      quizzes,
      new Set(["q1"]),
    );
    expect(pct).toBe(75);
    expect(lessonCompletionRatio(4, 3)).toBe(75);
  });

  it("blocks certificate until final quiz is passed", () => {
    expect(
      canIssueCertificate(100, quizzes, new Set(["q1", "q-final"])),
    ).toBe(true);
    expect(canIssueCertificate(100, quizzes, new Set(["q1"]))).toBe(false);
    expect(canIssueCertificate(80, quizzes, new Set(["q1", "q-final"]))).toBe(false);
  });

  it("allows certificate at 100% when no final quiz exists", () => {
    expect(canIssueCertificate(100, [{ id: "q1", isFinal: false }], new Set(["q1"]))).toBe(
      true,
    );
  });
});
