/**
 * Single typed generation config used by Review availability and create/topic jobs.
 * Persist the same values on the job/session so refresh resumes without drift.
 */

import {
  clampGovQuestionCount,
  GOV_QUESTION_COUNT_ABS_MAX,
  GOV_QUESTION_COUNT_MIN,
  isGovExactPatternBasis,
  parseGovQuestionCount,
} from "@/lib/gov-exam/questionCount";

export const GOV_DURATION_MIN = 5;
export const GOV_DURATION_MAX = 360;

export const GOV_PAPER_BASIS_VALUES = [
  "latest_pattern",
  "topic",
  "quick",
  "full_sim",
  "official_previous",
  "hybrid",
] as const;

export type GovPaperBasis = (typeof GOV_PAPER_BASIS_VALUES)[number];

export type GovExamPaperMode = "official_previous" | "generated_mock" | "custom_mock";

export type GovExamGenerationConfig = {
  examId: string;
  stageId: string;
  basis: GovPaperBasis;
  language: string;
  durationMinutes: number;
  questionCount: number;
  topics: string[];
  difficulty: "" | "EASY" | "MEDIUM" | "HARD";
};

export function parsePaperBasis(raw: unknown): GovPaperBasis {
  const value = String(raw ?? "").trim();
  if ((GOV_PAPER_BASIS_VALUES as readonly string[]).includes(value)) {
    return value as GovPaperBasis;
  }
  return "quick";
}

export function modeFromPaperBasis(basis: GovPaperBasis): GovExamPaperMode {
  if (basis === "official_previous") return "official_previous";
  if (basis === "full_sim" || basis === "hybrid") return "generated_mock";
  return "custom_mock";
}

export function clampGovDurationMinutes(raw: unknown): number {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed || /[eE.+-]/.test(trimmed)) return GOV_DURATION_MIN;
    const n = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(n)) return GOV_DURATION_MIN;
    return Math.min(Math.max(GOV_DURATION_MIN, n), GOV_DURATION_MAX);
  }
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return GOV_DURATION_MIN;
  return Math.min(Math.max(GOV_DURATION_MIN, Math.floor(n)), GOV_DURATION_MAX);
}

export function normalizeGenerationConfig(
  input: Partial<GovExamGenerationConfig> & Pick<GovExamGenerationConfig, "examId" | "stageId">,
): GovExamGenerationConfig {
  const basis = parsePaperBasis(input.basis);
  const language = String(input.language ?? "en").trim().slice(0, 8) || "en";
  const topics = Array.isArray(input.topics)
    ? input.topics.map((t) => String(t).trim()).filter(Boolean).slice(0, 20)
    : [];
  const difficultyRaw = String(input.difficulty ?? "").toUpperCase();
  const difficulty =
    difficultyRaw === "EASY" || difficultyRaw === "MEDIUM" || difficultyRaw === "HARD"
      ? difficultyRaw
      : "";
  return {
    examId: String(input.examId ?? "").trim(),
    stageId: String(input.stageId ?? "").trim(),
    basis,
    language,
    durationMinutes: clampGovDurationMinutes(input.durationMinutes),
    questionCount: clampGovQuestionCount(
      input.questionCount,
      isGovExactPatternBasis(basis) ? GOV_QUESTION_COUNT_ABS_MAX : GOV_QUESTION_COUNT_ABS_MAX,
    ),
    topics,
    difficulty,
  };
}

export function isGenerationConfigComplete(config: GovExamGenerationConfig): boolean {
  if (!config.examId || !config.stageId) return false;
  const parsed = parseGovQuestionCount(config.questionCount, GOV_QUESTION_COUNT_ABS_MAX);
  if (!parsed.valid) return false;
  if (config.questionCount < GOV_QUESTION_COUNT_MIN) return false;
  if (config.basis === "topic" && config.topics.length === 0) return false;
  return true;
}

/** Payload shared by Review availability and generation preflight. */
export function availabilityParamsFromConfig(config: GovExamGenerationConfig): {
  examId: string;
  stageId: string;
  mode: GovExamPaperMode;
  language: string;
  questionCount: number;
  durationMinutes: number;
  topics: string[];
  difficulty: "EASY" | "MEDIUM" | "HARD" | null;
} {
  return {
    examId: config.examId,
    stageId: config.stageId,
    mode: modeFromPaperBasis(config.basis),
    language: config.language,
    questionCount: config.questionCount,
    durationMinutes: config.durationMinutes,
    topics: config.basis === "topic" ? config.topics : [],
    difficulty: config.difficulty || null,
  };
}

export function parseStoredGenerationConfig(raw: unknown): GovExamGenerationConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Partial<GovExamGenerationConfig>;
  if (!rec.examId || !rec.stageId) return null;
  return normalizeGenerationConfig(rec as GovExamGenerationConfig);
}
