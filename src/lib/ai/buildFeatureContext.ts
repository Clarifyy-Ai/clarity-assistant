/**
 * Unified feature context builder — single entry for AI Edge payloads.
 */

import { classifyCoachQuestion } from "./coachQuestionClassify";
import {
  formatAnswerBankBlock,
  selectRelevantAnswerBankEntries,
  type AnswerBankEntryForContext,
} from "./answerBankRelevance";
import {
  getOrBuildSessionAiContext,
  lastTranscriptSlice,
  type SessionAiContextInput,
} from "./sessionAiContext";
import { normalizeCoachPayload, type OperationKey } from "./aiRequestContract";
import { practiceCoachStylePayload } from "./practiceCoachContract";
import {
  frozenResumePromptFromSnapshot,
  type PracticeCoachContextSnapshot,
} from "@/lib/session/practiceCoachContext";
import type { InterviewContextSnapshot } from "@/lib/mock/interviewContext";
import { resolveFrozenDocuments } from "@/lib/mock/liveContextShare";
import { answerBankDB } from "@/lib/supabase/database";
import type { ParsedResume } from "@/types/ai.types";

export type FeatureContextInput = {
  operation: OperationKey;
  userId: string;
  sessionId?: string | null;
  question?: string;
  message?: string;
  transcript?: string;
  /** Live Copilot frozen snapshot. */
  practiceSnapshot?: PracticeCoachContextSnapshot | null;
  /** Mock interview frozen snapshot. */
  interviewSnapshot?: InterviewContextSnapshot | null;
  /** Live session config fields when no snapshot. */
  role?: string | null;
  company?: string | null;
  interviewType?: string | null;
  experienceLevel?: string | null;
  seniority?: string | null;
  industry?: string | null;
  resumeId?: string | null;
  jdId?: string | null;
  instructions?: string | null;
  parsedResume?: ParsedResume | null;
  resumeContent?: string | null;
  resumeSummary?: string | null;
  hintStyle?: unknown;
  coachTone?: unknown;
  answerMode?: unknown;
  skillsNotToClaim?: string[];
  preferenceContext?: string;
  model?: string;
  screenshotBase64?: string | null;
  /** Prep tool structured context. */
  prepContext?: Record<string, unknown>;
  prepInput?: string;
  toolId?: string;
};

export type FeatureContextOutput = {
  payload: Record<string, unknown>;
  question_class: ReturnType<typeof classifyCoachQuestion>;
  resumeBlock: string;
};

async function loadRelevantStarBlock(
  userId: string,
  question: string,
  preferIds: string[] = [],
): Promise<string> {
  try {
    const entries = await answerBankDB.listByUserId(userId);
    const mapped: AnswerBankEntryForContext[] = entries.map((e) => ({
      id: e.id,
      question_text: e.question_text,
      answer_text: e.answer_text,
      star_situation: (e as { star_situation?: string }).star_situation,
      star_task: (e as { star_task?: string }).star_task,
      star_action: (e as { star_action?: string }).star_action,
      star_result: (e as { star_result?: string }).star_result,
      summary: (e as { summary?: string }).summary,
      tags: (e as { tags?: string[] }).tags,
      category: (e as { category?: string }).category,
    }));
    const selected = selectRelevantAnswerBankEntries(mapped, question, {
      max: 5,
      preferIds,
    });
    return formatAnswerBankBlock(selected);
  } catch {
    return "";
  }
}

/**
 * Build a normalized Edge payload for the given AI operation.
 */
export async function buildFeatureContext(
  input: FeatureContextInput,
): Promise<FeatureContextOutput> {
  const question = (input.question ?? input.message ?? "").trim();
  const snapshot = input.practiceSnapshot ?? input.interviewSnapshot ?? null;
  const frozen = resolveFrozenDocuments({
    snapshot,
    liveResume: input.resumeContent ?? input.resumeSummary ?? "",
    liveJd: "",
  });

  const role = snapshot?.role ?? input.role ?? "";
  const company = snapshot?.company ?? input.company ?? "";
  const interviewType =
    (snapshot && "interview_type" in snapshot ? snapshot.interview_type : null) ??
    input.interviewType ??
    "behavioral";
  const experienceLevel =
    (snapshot && "experience_level" in snapshot
      ? snapshot.experience_level
      : snapshot && "seniority" in snapshot
        ? snapshot.seniority
        : null) ??
    input.experienceLevel ??
    input.seniority ??
    "";

  const contextChecksum =
    input.practiceSnapshot?.checksum ??
    (input.interviewSnapshot
      ? `${input.interviewSnapshot.resume_hash}|${input.interviewSnapshot.jd_hash}`
      : null);

  const frozenResumeText =
    input.practiceSnapshot
      ? frozenResumePromptFromSnapshot(input.practiceSnapshot)
      : input.interviewSnapshot?.resume_text
        ? [
            input.interviewSnapshot.resume_text,
            ...(input.interviewSnapshot.answer_bank_snippets ?? []),
          ]
            .filter(Boolean)
            .join("\n\n")
        : frozen.resume || undefined;

  const frozenJdText = frozen.jd || undefined;

  const preferBankIds =
    input.practiceSnapshot?.answer_bank_context_ids ??
    input.interviewSnapshot?.answer_bank_context_ids ??
    [];

  const sessionInput: SessionAiContextInput = {
    userId: input.userId,
    resumeId: snapshot?.resume_id ?? input.resumeId,
    jdId: snapshot?.jd_id ?? input.jdId,
    instructions: input.instructions,
    role,
    company,
    parsedResume: input.parsedResume,
    resumeContent: input.resumeContent,
    resumeSummary: input.resumeSummary,
    contextChecksum,
    frozenResumeText,
    frozenJdText,
    questionForAnswerBank: question || undefined,
    answerBankPreferIds: preferBankIds,
  };

  const cached = await getOrBuildSessionAiContext(sessionInput);
  let resumeBlock = cached.resumeBlock;

  if (question && !contextChecksum) {
    const starBlock = await loadRelevantStarBlock(input.userId, question, preferBankIds);
    if (starBlock && !resumeBlock.includes("Relevant saved STAR stories")) {
      resumeBlock += starBlock;
    }
  }

  const transcript = input.transcript ?? "";
  const question_class = question
    ? classifyCoachQuestion(question, interviewType)
    : "mixed";

  const styleFields = practiceCoachStylePayload({
    hintStyle: input.hintStyle,
    coachTone: input.coachTone,
    answerMode: input.answerMode,
  });

  const skillsNotToClaim =
    input.skillsNotToClaim ??
    (snapshot && "skills_not_to_claim" in snapshot ? snapshot.skills_not_to_claim : []) ??
    [];

  const preferenceContext =
    input.preferenceContext ??
    (input.practiceSnapshot?.preference_block ?? "");

  const rawPayload: Record<string, unknown> = {
    question,
    message: input.message ?? question,
    resume_context: resumeBlock,
    job_description: frozenJdText ?? "",
    transcript: lastTranscriptSlice(transcript),
    interview_type: interviewType,
    target_company: company,
    role,
    experience_level: experienceLevel,
    preference_context: preferenceContext,
    skills_not_to_claim: skillsNotToClaim,
    question_class,
    context_hash: contextChecksum ?? cached.fingerprint,
    session_id: input.sessionId ?? null,
    model: input.model,
    screenshot_base64: input.screenshotBase64 ?? null,
    ...styleFields,
    ...(input.prepInput ? { prompt: input.prepInput, input: input.prepInput } : {}),
    ...(input.toolId ? { tool_id: input.toolId } : {}),
    ...(input.prepContext ? { context: input.prepContext } : {}),
  };

  const payload = normalizeCoachPayload(input.operation, rawPayload);

  return { payload, question_class, resumeBlock };
}

/** Profile block for prep-tool structured context. */
export function buildPrepProfileContext(input: {
  role?: string | null;
  experienceLevel?: string | null;
  company?: string | null;
  industry?: string | null;
  resumeSummary?: string | null;
  jdText?: string | null;
}): Record<string, unknown> {
  return {
    role: input.role?.trim() || undefined,
    experience_level: input.experienceLevel?.trim() || undefined,
    company: input.company?.trim() || undefined,
    industry: input.industry?.trim() || undefined,
    resume_summary: input.resumeSummary?.trim() || undefined,
    job_description: input.jdText?.trim() || undefined,
  };
}
