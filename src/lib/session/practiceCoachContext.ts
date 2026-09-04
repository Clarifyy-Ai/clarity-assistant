/**
 * Immutable Practice Coach (Live Copilot) context snapshot — frozen at session start.
 * Hint / answer / chat paths must read this snapshot, not live Resume/JD edits.
 */

import type { LiveSessionConfig } from "@/types/session.types";
import { buildLivePreferencePromptBlock } from "@/lib/session/liveSessionPreferences";

export const PRACTICE_COACH_CONTEXT_VERSION = "practice_coach_context_v1";

export type PracticeCoachContextSnapshot = {
  version: typeof PRACTICE_COACH_CONTEXT_VERSION;
  created_at: string;
  /** Stable id for this freeze (session-scoped). */
  snapshot_id: string;
  /** Checksum over frozen document + preference material. */
  checksum: string;
  role: string;
  company: string | null;
  interview_type: string;
  seniority: string | null;
  industry: string | null;
  interview_stage: string | null;
  instructions: string;
  language: string;
  duration_minutes: number;
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
  preference_block: string;
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

function cleanList(values: string[] | undefined, max = 12): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .slice(0, max);
}

function newSnapshotId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `pcs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function buildPracticeCoachContextSnapshot(input: {
  config: LiveSessionConfig;
  resumeText?: string;
  jdText?: string;
  answerBankSnippets?: string[];
  now?: Date;
  snapshotId?: string;
}): PracticeCoachContextSnapshot {
  const { config } = input;
  const resume = truncate(input.resumeText ?? "");
  const jd = truncate(input.jdText ?? "");
  const snippets = (input.answerBankSnippets ?? [])
    .map((s) => truncate(String(s ?? ""), 500))
    .filter(Boolean)
    .slice(0, 8);

  const focus = cleanList(config.focus_competencies);
  const emphasize = cleanList(config.skills_to_emphasize);
  const notClaim = cleanList(config.skills_not_to_claim);
  const avoid = cleanList(config.topics_to_avoid);
  const bankIds = cleanList(config.answer_bank_context_ids, 24);

  const preference_block = buildLivePreferencePromptBlock(
    {
      seniority: config.seniority,
      focus_competencies: focus,
      topics_to_avoid: avoid,
      skills_to_emphasize: emphasize,
      skills_not_to_claim: notClaim,
      answer_bank_context_ids: bankIds,
      interview_stage: config.interview_stage,
      industry: config.industry,
    },
    snippets,
  );

  const resume_hash = simpleHash(resume);
  const jd_hash = simpleHash(jd);
  const snapshot_id = input.snapshotId ?? newSnapshotId();
  const checksum = simpleHash(
    [
      snapshot_id,
      resume_hash,
      jd_hash,
      (config.role ?? "").trim(),
      (config.seniority ?? "").trim(),
      preference_block,
      bankIds.join(","),
    ].join("|"),
  );

  return {
    version: PRACTICE_COACH_CONTEXT_VERSION,
    created_at: (input.now ?? new Date()).toISOString(),
    snapshot_id,
    checksum,
    role: (config.role ?? "").trim(),
    company: config.company?.trim() || null,
    interview_type: config.interview_type || "behavioral",
    seniority: config.seniority?.trim() || null,
    industry: config.industry?.trim() || null,
    interview_stage: config.interview_stage?.trim() || null,
    instructions: (config.instructions ?? "").trim(),
    language: (config.language ?? "en").trim() || "en",
    duration_minutes: Math.max(1, config.duration_minutes ?? 30),
    resume_id: config.resume_id ?? null,
    jd_id: config.jd_id ?? null,
    resume_text: resume,
    jd_text: jd,
    resume_hash,
    jd_hash,
    focus_competencies: focus,
    skills_to_emphasize: emphasize,
    skills_not_to_claim: notClaim,
    topics_to_avoid: avoid,
    answer_bank_context_ids: bankIds,
    answer_bank_snippets: snippets,
    preference_block,
  };
}

export function isPracticeCoachContextSnapshot(
  value: unknown,
): value is PracticeCoachContextSnapshot {
  if (!value || typeof value !== "object") return false;
  const v = value as PracticeCoachContextSnapshot;
  return (
    v.version === PRACTICE_COACH_CONTEXT_VERSION &&
    typeof v.snapshot_id === "string" &&
    typeof v.checksum === "string" &&
    typeof v.role === "string" &&
    typeof v.resume_text === "string" &&
    typeof v.jd_text === "string"
  );
}

/** Compact persistence payload (id + checksum + hashes) for session notes / tags. */
export function practiceCoachSnapshotMeta(snapshot: PracticeCoachContextSnapshot): {
  snapshot_id: string;
  checksum: string;
  resume_hash: string;
  jd_hash: string;
  version: typeof PRACTICE_COACH_CONTEXT_VERSION;
} {
  return {
    snapshot_id: snapshot.snapshot_id,
    checksum: snapshot.checksum,
    resume_hash: snapshot.resume_hash,
    jd_hash: snapshot.jd_hash,
    version: PRACTICE_COACH_CONTEXT_VERSION,
  };
}

/** Resume/JD prompt material from frozen snapshot (no live doc drift). */
export function frozenResumePromptFromSnapshot(
  snapshot: PracticeCoachContextSnapshot,
): string {
  return [snapshot.resume_text, snapshot.preference_block].filter(Boolean).join("\n\n");
}
