import type { LiveSessionConfig } from "@/types/session.types";
import {
  formatParsedResumeForAI,
  parseResumeContentString,
} from "@/lib/documents/resumeParse";

export const INTERVIEW_CONTEXT_VERSION = "interview_context_v1";
export const RUBRIC_VERSION = "mock_rubric_v1";
export const QUESTION_POLICY_VERSION = "mock_question_policy_v1";

export type InterviewInputMode = "text" | "voice" | "mixed";

export type InterviewContextSnapshot = {
  version: typeof INTERVIEW_CONTEXT_VERSION;
  created_at: string;
  role: string;
  company: string | null;
  interview_type: string;
  experience_level: string | null;
  seniority: string | null;
  industry: string | null;
  difficulty: "easy" | "medium" | "hard" | "mixed";
  planned_question_count: number;
  duration_minutes: number;
  language: string;
  voice_id: string | null;
  input_mode: InterviewInputMode;
  follow_up_depth: "none" | "light" | "deep";
  resume_id: string | null;
  jd_id: string | null;
  /** Frozen resume text at start (may be truncated). */
  resume_text: string;
  /** Frozen JD text at start (may be truncated). */
  jd_text: string;
  resume_hash: string;
  jd_hash: string;
  focus_competencies: string[];
  skills_to_emphasize: string[];
  skills_not_to_claim: string[];
  topics_to_avoid: string[];
  answer_bank_context_ids: string[];
  /** Frozen Answer Bank snippets selected at start. */
  answer_bank_snippets: string[];
  rubric_version: string;
  question_policy_version: string;
};

function simpleHash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function truncate(text: string, max = 40_000): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max)}\n…[truncated]`;
}

/** Prefer normalized/parsed resume text for generation; fall back to raw content. */
export function freezeResumeTextForInterview(
  content: string | null | undefined,
  extras?: { role?: string | null; company?: string | null },
): string {
  const raw = (content ?? "").trim();
  if (!raw) return "";
  const parsed = parseResumeContentString(raw);
  const formatted = formatParsedResumeForAI(parsed, {
    role: extras?.role,
    company: extras?.company,
  });
  if (formatted && formatted !== "None provided.") return formatted;
  return raw;
}

export function buildInterviewContextSnapshot(input: {
  config: LiveSessionConfig;
  plannedQuestionCount: number;
  durationMinutes?: number;
  resumeText?: string;
  jdText?: string;
  answerBankSnippets?: string[];
  now?: Date;
}): InterviewContextSnapshot {
  const { config } = input;
  const resume = truncate(input.resumeText ?? "");
  const jd = truncate(input.jdText ?? "");
  const inputMode: InterviewInputMode =
    config.text_voice_mode === "text"
      ? "text"
      : config.text_voice_mode === "voice"
        ? "voice"
        : "mixed";

  return {
    version: INTERVIEW_CONTEXT_VERSION,
    created_at: (input.now ?? new Date()).toISOString(),
    role: (config.role ?? "").trim(),
    company: config.company?.trim() || null,
    interview_type: config.interview_type || "mixed",
    experience_level: config.seniority?.trim() || null,
    seniority: config.seniority?.trim() || null,
    industry: config.industry?.trim() || null,
    difficulty: config.difficulty ?? "medium",
    planned_question_count: Math.max(1, input.plannedQuestionCount),
    duration_minutes: Math.max(1, input.durationMinutes ?? config.duration_minutes ?? 5),
    language: (config.language ?? "en").trim() || "en",
    voice_id: config.tts_voice ?? null,
    input_mode: inputMode,
    follow_up_depth: config.follow_up_depth ?? "light",
    resume_id: config.resume_id ?? null,
    jd_id: config.jd_id ?? null,
    resume_text: resume,
    jd_text: jd,
    resume_hash: simpleHash(resume),
    jd_hash: simpleHash(jd),
    focus_competencies: [...(config.focus_competencies ?? [])],
    skills_to_emphasize: [...(config.skills_to_emphasize ?? [])],
    skills_not_to_claim: [...(config.skills_not_to_claim ?? [])],
    topics_to_avoid: [...(config.topics_to_avoid ?? [])],
    answer_bank_context_ids: [...(config.answer_bank_context_ids ?? [])],
    answer_bank_snippets: (input.answerBankSnippets ?? [])
      .map((s) => String(s ?? "").trim())
      .filter(Boolean)
      .slice(0, 8),
    rubric_version: RUBRIC_VERSION,
    question_policy_version: QUESTION_POLICY_VERSION,
  };
}

export function isInterviewContextSnapshot(
  value: unknown,
): value is InterviewContextSnapshot {
  if (!value || typeof value !== "object") return false;
  const v = value as InterviewContextSnapshot;
  return (
    v.version === INTERVIEW_CONTEXT_VERSION &&
    typeof v.role === "string" &&
    typeof v.planned_question_count === "number" &&
    typeof v.resume_text === "string" &&
    typeof v.jd_text === "string"
  );
}

export function validateInterviewContextForStart(
  snapshot: InterviewContextSnapshot,
  opts?: { requireResume?: boolean; requireMicForVoice?: boolean; micGranted?: boolean },
): string | null {
  if (!snapshot.role.trim()) return "Choose or type a target role.";
  if (!snapshot.interview_type.trim()) return "Select an interview type.";
  if (snapshot.planned_question_count < 1) return "Select how many questions to practice.";
  if (opts?.requireResume && !snapshot.resume_id && !snapshot.resume_text.trim()) {
    return "Select a Resume when personalization is enabled.";
  }
  if (
    opts?.requireMicForVoice &&
    snapshot.input_mode !== "text" &&
    opts.micGranted === false
  ) {
    return "Microphone permission is required for spoken answers.";
  }
  return null;
}
