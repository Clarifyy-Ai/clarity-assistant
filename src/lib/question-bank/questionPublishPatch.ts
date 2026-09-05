/**
 * Question Bank publish/unpublish PATCH contract.
 * Aligns client payloads with validate_question_publication (DB trigger).
 * Only admins may set approve/verify/valid on publish — no self-approve.
 */

import { canPublishLicense } from "@/lib/content/license";

export type PublishTargetStatus = "draft" | "published" | "archived";

export type PublishableQuestionRow = {
  question_text?: string | null;
  question_type?: string | null;
  options?: unknown;
  correct_answer?: string | null;
  explanation?: string | null;
  difficulty?: string | null;
  subject?: string | null;
  topic?: string | null;
  category?: string | null;
  license_type?: string | null;
  metadata?: unknown;
};

export type QuestionPublishPatch = {
  publish_status: PublishTargetStatus;
  is_public: boolean;
  review_status?: "approved";
  is_verified?: boolean;
  validation_status?: "valid";
};

export type BuildPublishPatchResult =
  | { ok: true; patch: QuestionPublishPatch }
  | { ok: false; reason: string };

type LabeledOption = { label: string; text: string };

function asLabeledOptions(options: unknown): LabeledOption[] {
  if (!Array.isArray(options)) return [];
  return options
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as { label?: unknown; text?: unknown };
      const label = String(row.label ?? "").trim().toUpperCase();
      const text = String(row.text ?? "").trim();
      if (!label || !text) return null;
      return { label, text };
    })
    .filter((item): item is LabeledOption => Boolean(item));
}

/**
 * Client gate matching validate_question_publication content rules.
 * Returns null when publishable; otherwise a user-facing reason.
 */
export function assertPublishableForTrigger(
  row: PublishableQuestionRow | null | undefined,
): string | null {
  if (!row) return "Question not found.";

  if (!canPublishLicense(row.license_type)) {
    return "UNKNOWN license content cannot be published.";
  }

  if (!String(row.question_text ?? "").trim()) {
    return "Question text is required before publication.";
  }
  if (!String(row.explanation ?? "").trim()) {
    return "Explanation is required before publication.";
  }

  const subject = String(row.subject ?? row.category ?? "").trim();
  const topic = String(row.topic ?? "").trim();
  const difficulty = String(row.difficulty ?? "").trim().toUpperCase();
  if (!subject || !topic || !["EASY", "MEDIUM", "HARD"].includes(difficulty)) {
    return "Subject, topic, and valid difficulty (EASY/MEDIUM/HARD) are required before publication.";
  }

  const type = String(row.question_type ?? "MCQ").trim().toUpperCase();
  if (type === "MCQ") {
    const options = asLabeledOptions(row.options);
    if (options.length !== 4) {
      return "MCQ questions require exactly four options (A–D).";
    }
    const labels = options.map((o) => o.label);
    if (labels.join(",") !== "A,B,C,D") {
      return "MCQ option labels must be A, B, C, and D.";
    }
    const uniqueText = new Set(options.map((o) => o.text.toLowerCase()));
    if (uniqueText.size !== 4) {
      return "MCQ option text must be unique.";
    }
    const answer = String(row.correct_answer ?? "").trim().toUpperCase();
    if (!answer || !labels.includes(answer)) {
      return "Correct answer must reference an existing option (A–D).";
    }
  }

  if (type === "TRUE_FALSE") {
    const options = asLabeledOptions(row.options);
    if (options.length < 2) {
      return "True/False questions need True and False options.";
    }
    const answer = String(row.correct_answer ?? "").trim().toUpperCase();
    const normalized =
      ["TRUE", "T", "YES", "A"].includes(answer) ? "A"
      : ["FALSE", "F", "NO", "B"].includes(answer) ? "B"
      : answer;
    if (!["A", "B"].includes(normalized)) {
      return "True/False correct answer must be True or False (stored as A or B).";
    }
  }

  if (type === "CODING") {
    const meta = row.metadata && typeof row.metadata === "object"
      ? (row.metadata as { coding?: unknown }).coding
      : row.metadata;
    const coding = meta && typeof meta === "object" ? meta : null;
    const starter = coding && "starter_code" in coding ? String((coding as { starter_code?: unknown }).starter_code ?? "") : "";
    const cases = coding && "test_cases" in coding && Array.isArray((coding as { test_cases?: unknown }).test_cases)
      ? (coding as { test_cases: unknown[] }).test_cases
      : [];
    if (!starter.trim()) {
      return "Coding questions require starter code in metadata.";
    }
    if (cases.length < 1) {
      return "Coding questions require at least one test case.";
    }
  }

  return null;
}

/**
 * Build the PostgREST PATCH body for publish / unpublish / archive.
 * Non-admins cannot publish (would omit approve/verify → DB 400).
 */
export function buildQuestionPublishPatch(input: {
  targetStatus: PublishTargetStatus;
  isAdmin: boolean;
}): BuildPublishPatchResult {
  const { targetStatus, isAdmin } = input;

  if (targetStatus === "published") {
    if (!isAdmin) {
      return {
        ok: false,
        reason:
          "Only an admin can approve, verify, and publish a question. Submit for review instead.",
      };
    }
    return {
      ok: true,
      patch: {
        publish_status: "published",
        is_public: true,
        review_status: "approved",
        is_verified: true,
        validation_status: "valid",
      },
    };
  }

  return {
    ok: true,
    patch: {
      publish_status: targetStatus,
      is_public: false,
    },
  };
}
