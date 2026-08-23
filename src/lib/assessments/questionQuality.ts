const DIFFICULTIES = new Set(["EASY", "MEDIUM", "HARD"]);
const REVIEW_STATUSES = new Set(["unreviewed", "approved", "rejected"]);

export type QualityQuestion = {
  question_text?: string | null;
  question_type?: string | null;
  options?: unknown;
  correct_answer?: string | null;
  explanation?: string | null;
  difficulty?: string | null;
  category?: string | null;
  subject?: string | null;
  topic?: string | null;
  publish_status?: string | null;
  review_status?: string | null;
  license_type?: string | null;
  eligible_roles?: string[] | null;
};

export type QualityIssue = {
  code: string;
  message: string;
};

type LabeledOption = { label: string; text: string };

function asLabeledOptions(options: unknown): LabeledOption[] {
  if (Array.isArray(options)) {
    return options
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as { label?: unknown; text?: unknown };
        const label = String(row.label ?? "").trim();
        const text = String(row.text ?? "").trim();
        if (!label || !text) return null;
        return { label, text };
      })
      .filter((item): item is LabeledOption => Boolean(item));
  }
  if (options && typeof options === "object") {
    return Object.entries(options as Record<string, unknown>)
      .map(([label, text]) => ({ label: String(label).trim(), text: String(text ?? "").trim() }))
      .filter((item) => item.label && item.text);
  }
  return [];
}

export function optionLabelsIncludeAnswer(options: unknown, correctAnswer: string | null | undefined): boolean {
  const answer = String(correctAnswer ?? "").trim();
  if (!answer) return false;
  const labeled = asLabeledOptions(options);
  return labeled.some((option) => option.label.toUpperCase() === answer.toUpperCase() || option.text === answer);
}

export function validateQuestionQuality(question: QualityQuestion): QualityIssue[] {
  const issues: QualityIssue[] = [];
  if (!String(question.question_text ?? "").trim()) {
    issues.push({ code: "missing_question_text", message: "Question text is required." });
  }
  const type = String(question.question_type ?? "MCQ").toUpperCase();
  const options = asLabeledOptions(question.options);
  if (type === "MCQ" || type === "TRUE_FALSE" || type === "MULTIPLE_SELECT") {
    if (options.length < 2) {
      issues.push({ code: "invalid_options", message: "At least two options are required." });
    }
    if (!optionLabelsIncludeAnswer(question.options, question.correct_answer)) {
      issues.push({ code: "invalid_correct_answer", message: "Correct answer must match an option." });
    }
  } else if (!String(question.correct_answer ?? "").trim()) {
    issues.push({ code: "missing_correct_answer", message: "Correct answer is required." });
  }
  if (!String(question.explanation ?? "").trim()) {
    issues.push({ code: "missing_explanation", message: "Explanation is required for published assessment items." });
  }
  const difficulty = String(question.difficulty ?? "").toUpperCase();
  if (!DIFFICULTIES.has(difficulty)) {
    issues.push({ code: "invalid_difficulty", message: "Difficulty must be EASY, MEDIUM, or HARD." });
  }
  if (!String(question.category ?? question.subject ?? "").trim()) {
    issues.push({ code: "invalid_taxonomy", message: "Category or subject is required." });
  }
  if (question.review_status && !REVIEW_STATUSES.has(question.review_status)) {
    issues.push({ code: "invalid_review_status", message: "Review status is invalid." });
  }
  if (question.publish_status === "published" && question.review_status === "rejected") {
    issues.push({ code: "rejected_published", message: "Rejected questions cannot stay in the published pool." });
  }
  return issues;
}

export function isAssessmentReadyQuestion(question: QualityQuestion): boolean {
  return validateQuestionQuality(question).length === 0;
}
