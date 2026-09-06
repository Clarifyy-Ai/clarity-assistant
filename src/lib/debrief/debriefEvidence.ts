/**
 * Evidence-linked Debrief validation — no invented quotes or fake grades.
 * Kept in sync with supabase/functions/_shared/debriefEvidence.ts
 */

import { isAuthoritativeSessionComplete } from "@/lib/session/sessionShareability";

export const DEBRIEF_EVIDENCE_MIN_QUOTE = 12;
export const DEBRIEF_RUBRIC_VERSION = "debrief-rubric-v1";
export const DEBRIEF_POLICY_VERSION = "genuine-debrief-v1";

export function normalizeEvidenceCorpus(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function buildDebriefEvidenceCorpus(parts: {
  answers: Array<{
    id?: string | null;
    question_index?: number | null;
    question_text?: string | null;
    question?: string | null;
    transcript?: string | null;
    answer?: string | null;
  }>;
  transcripts: Array<{ content?: string | null }>;
}): string {
  const chunks: string[] = [];
  for (const a of parts.answers) {
    const q = String(a.question_text ?? a.question ?? "").trim();
    const ans = String(a.transcript ?? a.answer ?? "").trim();
    if (q) chunks.push(q);
    if (ans) chunks.push(ans);
  }
  for (const t of parts.transcripts) {
    const c = String(t.content ?? "").trim();
    if (c) chunks.push(c);
  }
  return chunks.join("\n");
}

export function excerptInCorpus(excerpt: string, corpus: string): boolean {
  const needle = normalizeEvidenceCorpus(excerpt);
  if (needle.length < DEBRIEF_EVIDENCE_MIN_QUOTE) return false;
  return normalizeEvidenceCorpus(corpus).includes(needle);
}

export type DebriefEvidenceValidationIssue = {
  code: string;
  message: string;
};

export function validateDebriefEvidence(input: {
  corpus: string;
  answerIds: Set<string>;
  questionIndices: Set<number>;
  transcriptEvidenceQuotes: string[];
  referencedAnswerIds?: Array<string | null | undefined>;
  referencedQuestionIndices?: Array<number | null | undefined>;
  hasVerifiedFillers: boolean;
  hasVerifiedWpm: boolean;
  aiClaimsFillers?: boolean;
  aiClaimsWpm?: boolean;
}): DebriefEvidenceValidationIssue[] {
  const issues: DebriefEvidenceValidationIssue[] = [];

  for (const quote of input.transcriptEvidenceQuotes) {
    const q = String(quote ?? "").trim();
    if (!q) continue;
    if (q.length < DEBRIEF_EVIDENCE_MIN_QUOTE) continue;
    if (!excerptInCorpus(q, input.corpus)) {
      issues.push({
        code: "EVIDENCE_QUOTE_MISMATCH",
        message: "A feedback quote was not found in the session transcript/answers.",
      });
    }
  }

  for (const id of input.referencedAnswerIds ?? []) {
    if (!id) continue;
    if (!input.answerIds.has(String(id))) {
      issues.push({
        code: "EVIDENCE_ANSWER_UNKNOWN",
        message: "A feedback item references an unknown answer id.",
      });
    }
  }

  for (const idx of input.referencedQuestionIndices ?? []) {
    if (idx == null || !Number.isFinite(idx)) continue;
    if (!input.questionIndices.has(Number(idx))) {
      issues.push({
        code: "EVIDENCE_QUESTION_UNKNOWN",
        message: "A feedback item references an unknown question index.",
      });
    }
  }

  if (input.aiClaimsFillers && !input.hasVerifiedFillers) {
    issues.push({
      code: "UNSUPPORTED_AUDIO_METRIC",
      message: "Filler-word claims require verified session audio metrics.",
    });
  }
  if (input.aiClaimsWpm && !input.hasVerifiedWpm) {
    issues.push({
      code: "UNSUPPORTED_AUDIO_METRIC",
      message: "Speaking-pace claims require verified session WPM.",
    });
  }

  return issues;
}

export function buildEvaluationInputSnapshot(input: {
  sessionId: string;
  userId: string;
  answerIds: string[];
  questionCount: number;
  answerCount: number;
  transcriptCount: number;
  transcriptChars: number;
  resumeId?: string | null;
  jdId?: string | null;
  hasVerifiedFillers: boolean;
  hasVerifiedWpm: boolean;
}): Record<string, unknown> {
  return {
    session_id: input.sessionId,
    user_id: input.userId,
    answer_ids: input.answerIds,
    question_count: input.questionCount,
    answer_count: input.answerCount,
    transcript_count: input.transcriptCount,
    transcript_chars: input.transcriptChars,
    resume_id: input.resumeId ?? null,
    jd_id: input.jdId ?? null,
    has_verified_fillers: input.hasVerifiedFillers,
    has_verified_wpm: input.hasVerifiedWpm,
    rubric_version: DEBRIEF_RUBRIC_VERSION,
    policy_version: DEBRIEF_POLICY_VERSION,
    created_at: new Date().toISOString(),
  };
}

export type DebriefEligibilityCode =
  | "SESSION_INCOMPLETE"
  | "NOT_ELIGIBLE_NO_QUESTIONS"
  | "NOT_ELIGIBLE_NO_ANSWERS"
  | "NOT_SCORED"
  | null;

export function classifyDebriefEligibility(input: {
  status?: string | null;
  lifecycle_status?: string | null;
  terminal_reason?: string | null;
  ended_at?: string | null;
  scorableAnswerCount?: number;
  hasQuestions: boolean;
  hasMeaningfulAnswers: boolean;
  hasTranscript: boolean;
}): DebriefEligibilityCode {
  const answerCount =
    typeof input.scorableAnswerCount === "number"
      ? input.scorableAnswerCount
      : input.hasMeaningfulAnswers
        ? 1
        : 0;
  const evidenceCount = Math.max(
    answerCount,
    input.hasMeaningfulAnswers || input.hasTranscript ? 1 : 0,
  );
  const statusCompleted =
    input.status != null && String(input.status).toLowerCase() === "completed";
  const complete =
    statusCompleted ||
    isAuthoritativeSessionComplete({
      status: input.status,
      lifecycle_status: input.lifecycle_status,
      terminal_reason: input.terminal_reason,
      ended_at: input.ended_at,
      scorableAnswerCount: evidenceCount,
    });

  // In-progress / non-complete sessions cannot get a debrief yet.
  if (!complete) {
    return "SESSION_INCOMPLETE";
  }
  if (!input.hasMeaningfulAnswers && !input.hasTranscript) {
    // NOT_SCORED kept for backward-compatible Edge 422 contracts;
    // NOT_ELIGIBLE_NO_ANSWERS remains an accepted client alias.
    return input.hasQuestions ? "NOT_SCORED" : "NOT_ELIGIBLE_NO_QUESTIONS";
  }
  return null;
}
