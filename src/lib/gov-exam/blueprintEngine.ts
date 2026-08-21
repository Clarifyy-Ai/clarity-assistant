/**
 * Blueprint construction from approved pattern + soft historical quotas.
 */

export interface PatternSection {
  code: string;
  name: string;
  question_count: number;
  marks: number;
}

export interface PatternVersion {
  id: string;
  version: string;
  total_questions: number;
  total_marks: number;
  duration_minutes: number;
  negative_mark: number;
  marks_per_question: number;
  languages: string[];
  sections: PatternSection[];
}

export interface BlueprintSlot {
  section_code: string;
  topic?: string;
  difficulty: "easy" | "medium" | "hard" | "exam_balanced";
  question_type: "single_mcq";
}

export interface PaperBlueprint {
  exam_id: string;
  exam_code: string;
  stage_id: string;
  pattern_version_id: string;
  pattern_version: string;
  syllabus_version_id: string | null;
  syllabus_version: string | null;
  language: string;
  total_questions: number;
  total_marks: number;
  duration_minutes: number;
  negative_mark: number;
  marks_per_question: number;
  sections: PatternSection[];
  slots: BlueprintSlot[];
  source_years: number[];
  mode: "official_previous" | "generated_mock" | "custom_mock" | "adaptive";
  paper_class: "official_previous" | "ai_generated" | "custom_practice";
  generation_policy_version: string;
  random_seed: string;
  algorithm_version: string;
  hard_constraints_ok: true;
  label: string;
}

export function buildBlueprint(input: {
  examId: string;
  examCode: string;
  stageId: string;
  pattern: PatternVersion;
  syllabusVersionId?: string | null;
  syllabusVersion?: string | null;
  language: string;
  sourceYears: number[];
  mode: PaperBlueprint["mode"];
  randomSeed: string;
  customQuestionCount?: number | null;
  customDuration?: number | null;
}): PaperBlueprint {
  const pattern = input.pattern;
  const customizing =
    (input.customQuestionCount != null &&
      input.customQuestionCount !== pattern.total_questions) ||
    (input.customDuration != null &&
      input.customDuration !== pattern.duration_minutes);

  const totalQuestions = customizing
    ? Math.min(
        pattern.total_questions,
        Math.max(10, input.customQuestionCount ?? pattern.total_questions),
      )
    : pattern.total_questions;

  // Scale section quotas proportionally when customizing count.
  const scale = totalQuestions / pattern.total_questions;
  const sections = pattern.sections.map((s) => ({
    ...s,
    question_count: Math.max(1, Math.round(s.question_count * scale)),
  }));

  // Fix rounding drift on last section
  const sum = sections.reduce((a, s) => a + s.question_count, 0);
  if (sections.length && sum !== totalQuestions) {
    sections[sections.length - 1].question_count += totalQuestions - sum;
  }

  const slots: BlueprintSlot[] = [];
  for (const section of sections) {
    for (let i = 0; i < section.question_count; i++) {
      slots.push({
        section_code: section.code,
        difficulty: "exam_balanced",
        question_type: "single_mcq",
      });
    }
  }

  const paper_class: PaperBlueprint["paper_class"] =
    input.mode === "official_previous"
      ? "official_previous"
      : customizing
        ? "custom_practice"
        : "ai_generated";

  return {
    exam_id: input.examId,
    exam_code: input.examCode,
    stage_id: input.stageId,
    pattern_version_id: pattern.id,
    pattern_version: pattern.version,
    syllabus_version_id: input.syllabusVersionId ?? null,
    syllabus_version: input.syllabusVersion ?? null,
    language: input.language,
    total_questions: totalQuestions,
    total_marks: customizing
      ? totalQuestions * pattern.marks_per_question
      : pattern.total_marks,
    duration_minutes: input.customDuration ?? pattern.duration_minutes,
    negative_mark: pattern.negative_mark,
    marks_per_question: pattern.marks_per_question,
    sections,
    slots,
    source_years: input.sourceYears,
    mode: input.mode,
    paper_class,
    generation_policy_version: "gov_paper_v1",
    random_seed: input.randomSeed,
    algorithm_version: "recency_v1",
    hard_constraints_ok: true,
    label:
      paper_class === "ai_generated"
        ? "AI-generated practice paper based on the selected syllabus, pattern, and historical topic distribution. This is not an official or leaked examination paper."
        : paper_class === "custom_practice"
          ? "Custom Practice Set — not a full official exam simulation."
          : "Previous-year style practice assembled from approved bank items with provenance.",
  };
}

export function validateBlueprintHardConstraints(
  blueprint: PaperBlueprint,
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const sectionSum = blueprint.sections.reduce((a, s) => a + s.question_count, 0);
  if (sectionSum !== blueprint.total_questions) {
    errors.push(`Section question sum ${sectionSum} != total ${blueprint.total_questions}`);
  }
  if (blueprint.slots.length !== blueprint.total_questions) {
    errors.push(`Slots ${blueprint.slots.length} != total ${blueprint.total_questions}`);
  }
  if (blueprint.total_questions < 1) errors.push("total_questions must be >= 1");
  if (blueprint.duration_minutes < 1) errors.push("duration_minutes must be >= 1");
  if (blueprint.negative_mark < 0) errors.push("negative_mark cannot be negative");
  return errors.length ? { ok: false, errors } : { ok: true };
}

export interface AssembledQuestionItem {
  id: string;
  question_text: string;
  options: unknown;
  correct_answer?: unknown;
  section_code?: string | null;
  subject?: string | null;
  topic?: string | null;
}

/**
 * Validates hard constraints on the assembled question list before publication or freezing.
 * Any failure must strictly block publication.
 */
export function validateAssembledPaperHardConstraints(input: {
  blueprint: PaperBlueprint;
  questions: AssembledQuestionItem[];
  aiQuestionIds?: Set<string>;
}): { ok: true } | { ok: false; errors: string[] } {
  const { blueprint, questions } = input;
  const errors: string[] = [];

  // 1. Exact question count
  if (questions.length !== blueprint.total_questions) {
    errors.push(`Exact question count failed: got ${questions.length}, expected ${blueprint.total_questions}`);
  }

  // 2. Exact maximum marks
  const expectedTotalMarks = blueprint.total_questions * blueprint.marks_per_question;
  if (blueprint.total_marks !== expectedTotalMarks) {
    errors.push(`Exact maximum marks failed: blueprint total_marks ${blueprint.total_marks} != calculated ${expectedTotalMarks}`);
  }

  // 3. Supported language
  if (!blueprint.language || blueprint.language.trim().length === 0) {
    errors.push("Paper language must be specified and supported");
  }

  // 4. Positive and negative marks sanity
  if (blueprint.marks_per_question <= 0) {
    errors.push("Marks per question must be greater than zero");
  }
  if (blueprint.negative_mark < 0) {
    errors.push("Negative marking cannot be negative");
  }
  if (blueprint.negative_mark > blueprint.marks_per_question) {
    errors.push("Negative penalty cannot exceed positive marks per question");
  }

  // 5. Duration sanity
  if (blueprint.duration_minutes <= 0) {
    errors.push("Duration minutes must be greater than zero");
  }

  // 6. No duplicate questions
  const seenIds = new Set<string>();
  const seenTexts = new Set<string>();
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const qid = String(q.id || `idx-${i}`);
    if (seenIds.has(qid)) {
      errors.push(`Duplicate question ID detected: ${qid}`);
    }
    seenIds.add(qid);

    const normText = String(q.question_text || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (normText.length > 10) {
      if (seenTexts.has(normText)) {
        errors.push(`Duplicate question stem detected at position ${i + 1}`);
      }
      seenTexts.add(normText);
    }

    // 7. Valid answer for every question
    if (q.correct_answer == null || String(q.correct_answer).trim() === "") {
      errors.push(`Question at position ${i + 1} (${qid}) has missing or invalid correct_answer`);
    }

    // 8. Options validity
    if (!Array.isArray(q.options) || q.options.length < 2) {
      errors.push(`Question at position ${i + 1} (${qid}) has fewer than 2 options`);
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}
