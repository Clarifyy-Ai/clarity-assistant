/** Blueprint construction for create-exam-paper (mirrors src/lib/gov-exam/blueprintEngine.ts). */
import { isNearDuplicate } from "./govMcqValidator.ts";
import { PAPER_BLUEPRINT_VERSION } from "./algorithmCatalog.ts";

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

const AI_LABEL =
  "AI-generated practice paper based on the selected syllabus, pattern, and historical topic distribution. This is not an official or leaked examination paper.";

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
      input.customDuration !== pattern.duration_minutes) ||
    input.mode === "custom_mock" ||
    input.mode === "adaptive";

  const totalQuestions = customizing
    ? Math.min(
      pattern.total_questions,
      Math.max(5, input.customQuestionCount ?? pattern.total_questions),
    )
    : pattern.total_questions;

  const scale = totalQuestions / pattern.total_questions;
  const sections = pattern.sections.map((s) => ({
    ...s,
    question_count: Math.max(1, Math.round(s.question_count * scale)),
  }));

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
    generation_policy_version: PAPER_BLUEPRINT_VERSION,
    random_seed: input.randomSeed,
    algorithm_version: PAPER_BLUEPRINT_VERSION,
    hard_constraints_ok: true,
    label: paper_class === "ai_generated"
      ? AI_LABEL
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
  difficulty?: string | null;
  language?: string | null;
  source_type?: string | null;
  marks_positive?: number | null;
  marks_negative?: number | null;
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

  // 5b. Exact section quotas for full-paper modes only.
  // Custom/adaptive practice may undersample sections from the bank.
  const exactMode =
    blueprint.mode === "official_previous" || blueprint.mode === "generated_mock";
  if (exactMode && Array.isArray(blueprint.sections) && blueprint.sections.length > 0) {
    const bySection = new Map<string, number>();
    for (const q of questions) {
      const code = String(q.section_code ?? "").trim();
      if (!code) continue;
      bySection.set(code, (bySection.get(code) ?? 0) + 1);
    }
    const assigned = [...bySection.values()].reduce((a, b) => a + b, 0);
    // Only enforce when the assembled set is section-tagged (slots → section_code).
    if (assigned === questions.length) {
      for (const section of blueprint.sections) {
        const got = bySection.get(section.code) ?? 0;
        if (got !== section.question_count) {
          errors.push(
            `Section quota failed for ${section.code}: got ${got}, expected ${section.question_count}`,
          );
        }
      }
    }
  }

  // 6. No duplicate questions
  const seenIds = new Set<string>();
  const seenTexts = new Set<string>();
  const priorStems: string[] = [];
  const authenticSources = new Set([
    "official_verified",
    "verified_public_source",
    "approved_bank",
    "internal_question_bank",
    "admin_uploaded",
  ]);
  const rejectedGenerated = new Set([
    "generated_practice",
    "ai_generated_practice",
    "generated",
    "deterministic",
  ]);
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
    if (q.language && q.language.toLowerCase() !== blueprint.language.toLowerCase()) {
      errors.push(`Question at position ${i + 1} has a language mismatch`);
    }
    if (q.marks_positive != null && q.marks_positive !== blueprint.marks_per_question) {
      errors.push(`Question at position ${i + 1} has incorrect positive marks`);
    }
    if (q.marks_negative != null && q.marks_negative !== blueprint.negative_mark) {
      errors.push(`Question at position ${i + 1} has incorrect negative marks`);
    }
    if (q.difficulty && !["EASY", "MEDIUM", "HARD", "easy", "medium", "hard"].includes(q.difficulty)) {
      errors.push(`Question at position ${i + 1} has invalid difficulty`);
    }
    const sourceType = String(q.source_type ?? "").trim().toLowerCase();
    if (blueprint.mode === "official_previous") {
      if (!sourceType || !authenticSources.has(sourceType) || rejectedGenerated.has(sourceType)) {
        errors.push(`Question at position ${i + 1} has generated provenance in official mode`);
      }
      if (sourceType.includes("generated") || sourceType.includes("ai_")) {
        errors.push(`Question at position ${i + 1} cannot be generated in official mode`);
      }
    }
    for (const previous of priorStems) {
      if (isNearDuplicate(normText, previous, 0.8)) {
        errors.push(`Near-duplicate question detected at position ${i + 1}`);
        break;
      }
    }
    priorStems.push(normText);

    // 7. Valid answer for every question
    if (q.correct_answer == null || String(q.correct_answer).trim() === "") {
      errors.push(`Question at position ${i + 1} (${qid}) has missing or invalid correct_answer`);
    }

    // 8. Options validity
    if (!Array.isArray(q.options) || q.options.length !== 4) {
      errors.push(`Question at position ${i + 1} (${qid}) must have exactly 4 options`);
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

/** Deterministic seeded shuffle (mulberry32). */
export function seededShuffle<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let state = h >>> 0;
  const rand = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
