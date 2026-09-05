import { describe, expect, it } from "vitest";
import { blueprintForRole } from "@/lib/assessments/blueprint";
import {
  previewRoleBank,
  templateForRolePreview,
  truncateQuestionPreview,
} from "@/lib/assessments/assessmentBankPreview";

const published = {
  publish_status: "published",
  review_status: "approved",
  license_type: "ORIGINAL",
  is_public: true,
  is_verified: true,
} as const;

function makeQuestion(
  id: string,
  category: string,
  roles: string[] = ["backend-developer"],
) {
  return {
    id,
    category,
    subject: category,
    question_text: `Sample ${category} question ${id}`,
    eligible_roles: roles,
    ...published,
  };
}

describe("assessmentBankPreview", () => {
  it("builds template from role weights", () => {
    const weights = blueprintForRole("backend-developer");
    const template = templateForRolePreview("backend-developer", weights);
    expect(template.slug).toBe("backend-developer");
    expect(template.role_slug).toBe("backend-developer");
    expect(template.category_distribution).toEqual(weights);
  });

  it("detects shortfall when bank cannot fill quotas", () => {
    const preview = previewRoleBank({
      roleSlug: "backend-developer",
      weights: blueprintForRole("backend-developer"),
      weakTopics: [],
      questionCount: 10,
      questions: [makeQuestion("1", "backend"), makeQuestion("2", "sql")],
    });
    expect(preview.canAssemble).toBe(false);
    expect(preview.assemblyGap).toBeGreaterThan(0);
    expect(preview.insufficientMessage).toMatch(/needs 10 eligible questions/i);
  });

  it("assembles when enough diversified questions exist", () => {
    const questions = [
      ...Array.from({ length: 4 }, (_, i) => makeQuestion(`b${i}`, "backend")),
      ...Array.from({ length: 3 }, (_, i) => makeQuestion(`s${i}`, "sql")),
      ...Array.from({ length: 2 }, (_, i) => makeQuestion(`j${i}`, "java")),
      makeQuestion("p0", "python"),
      makeQuestion("d0", "devops"),
    ];
    const preview = previewRoleBank({
      roleSlug: "backend-developer",
      weights: blueprintForRole("backend-developer"),
      weakTopics: ["sql"],
      questionCount: 10,
      questions,
    });
    expect(preview.canAssemble).toBe(true);
    expect(preview.selectedPreview.length).toBeGreaterThan(0);
  });

  it("truncates long question previews", () => {
    expect(truncateQuestionPreview("a".repeat(120), 20)).toMatch(/…$/);
    expect(truncateQuestionPreview("", 20)).toBe("Untitled question");
  });
});
