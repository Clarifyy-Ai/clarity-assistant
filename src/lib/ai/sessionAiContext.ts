import { buildResumeContextForAI } from "@/lib/documents/interviewContext";
import { answerBankDB, jobDescriptionsDB } from "@/lib/supabase/database";
import type { ParsedResume } from "@/types/ai.types";
import {
  formatAnswerBankBlock,
  selectRelevantAnswerBankEntries,
  type AnswerBankEntryForContext,
} from "@/lib/ai/answerBankRelevance";

export type SessionAiContext = {
  fingerprint: string;
  resumeBlock: string;
  parsedSkills: string[];
  jdKeywords: string[];
  starStoriesBlock: string;
};

export type SessionAiContextInput = {
  userId: string;
  resumeId?: string | null;
  jdId?: string | null;
  instructions?: string | null;
  role?: string | null;
  company?: string | null;
  parsedResume?: ParsedResume | null;
  resumeContent?: string | null;
  resumeSummary?: string | null;
  jdSnippet?: string | null;
  /**
   * When set (Practice Coach freeze), fingerprint includes checksum so mid-session
   * live doc edits cannot reuse a stale cache entry built from different material.
   */
  contextChecksum?: string | null;
  /** Prefer frozen resume text over live document loaders when provided. */
  frozenResumeText?: string | null;
  /** Prefer frozen JD text / keywords snippet when provided. */
  frozenJdText?: string | null;
  /** When set, score Answer Bank entries by relevance to this question. */
  questionForAnswerBank?: string | null;
  /** Selected Answer Bank IDs to boost in relevance scoring. */
  answerBankPreferIds?: string[];
  /** Operation name for cache key differentiation. */
  operation?: string | null;
};

export type SessionAiContextLoaders = {
  buildResumeBlock: typeof buildResumeContextForAI;
  loadJdKeywords: (jdId: string) => Promise<string[]>;
  loadStarStories: (
    userId: string,
    question?: string | null,
    preferIds?: string[],
  ) => Promise<string>;
};

const cache = new Map<string, SessionAiContext>();

export function sessionAiContextFingerprint(input: {
  userId: string;
  resumeId?: string | null;
  jdId?: string | null;
  instructions?: string | null;
  contextChecksum?: string | null;
  operation?: string | null;
  questionForAnswerBank?: string | null;
}): string {
  const instructionsKey = (input.instructions ?? "").trim().slice(0, 120);
  const questionKey = (input.questionForAnswerBank ?? "").trim().slice(0, 80);
  return [
    input.userId,
    input.resumeId ?? "",
    input.jdId ?? "",
    instructionsKey,
    input.contextChecksum ?? "",
    input.operation ?? "",
    questionKey,
  ].join("|");
}

export function peekSessionAiContext(fingerprint: string): SessionAiContext | null {
  return cache.get(fingerprint) ?? null;
}

export function clearSessionAiContext(fingerprint?: string): void {
  if (fingerprint) {
    cache.delete(fingerprint);
    return;
  }
  cache.clear();
}

async function defaultJdKeywords(jdId: string): Promise<string[]> {
  const jd = await jobDescriptionsDB.getByIdMaybe(jdId);
  const raw = jd as Record<string, unknown> | null;
  const kw = raw?.keywords ?? raw?.required_skills ?? raw?.skills;
  if (!Array.isArray(kw)) return [];
  return kw.filter((s): s is string => typeof s === "string");
}

async function defaultStarStories(
  userId: string,
  question?: string | null,
  preferIds: string[] = [],
): Promise<string> {
  const entries = await answerBankDB.listByUserId(userId);
  const mapped: AnswerBankEntryForContext[] = entries.map((entry) => ({
    id: entry.id,
    question_text: entry.question_text,
    answer_text: entry.answer_text,
    star_situation: (entry as { star_situation?: string }).star_situation,
    star_task: (entry as { star_task?: string }).star_task,
    star_action: (entry as { star_action?: string }).star_action,
    star_result: (entry as { star_result?: string }).star_result,
    summary: (entry as { summary?: string }).summary,
    tags: (entry as { tags?: string[] }).tags,
    category: (entry as { category?: string }).category,
  }));

  const selected = question?.trim()
    ? selectRelevantAnswerBankEntries(mapped, question, { max: 5, preferIds })
    : mapped.slice(0, 5);

  return formatAnswerBankBlock(selected);
}

export const defaultSessionAiContextLoaders: SessionAiContextLoaders = {
  buildResumeBlock: buildResumeContextForAI,
  loadJdKeywords: defaultJdKeywords,
  loadStarStories: defaultStarStories,
};

export async function getOrBuildSessionAiContext(
  input: SessionAiContextInput,
  loaders: SessionAiContextLoaders = defaultSessionAiContextLoaders,
): Promise<SessionAiContext> {
  const fingerprint = sessionAiContextFingerprint(input);
  const hit = cache.get(fingerprint);
  if (hit) return hit;

  const frozenResume = (input.frozenResumeText ?? "").trim();
  const frozenJd = (input.frozenJdText ?? "").trim();

  const resumeBlock = frozenResume
    ? frozenResume
    : await loaders.buildResumeBlock(input.userId, {
        parsedResume: input.parsedResume,
        resumeContent: input.resumeContent,
        resumeSummary: input.resumeSummary,
        jdSnippet: input.jdSnippet,
        instructions: input.instructions ?? "",
        role: input.role ?? null,
        company: input.company ?? null,
      });

  let jdKeywords: string[] = [];
  if (!frozenJd && input.jdId) {
    try {
      jdKeywords = await loaders.loadJdKeywords(input.jdId);
    } catch {
      jdKeywords = [];
    }
  }

  let starStoriesBlock = "";
  // Frozen snapshots already embed selected Answer Bank snippets in preference_block.
  if (!input.contextChecksum) {
    try {
      starStoriesBlock = await loaders.loadStarStories(
        input.userId,
        input.questionForAnswerBank,
        input.answerBankPreferIds ?? [],
      );
    } catch {
      starStoriesBlock = "";
    }
  }

  const jdBlock = frozenJd
    ? `\n\nJob description (frozen):\n${frozenJd}`
    : jdKeywords.length > 0
      ? `\n\nJD keywords to weave in: ${jdKeywords.join(", ")}`
      : "";

  const built: SessionAiContext = {
    fingerprint,
    resumeBlock: resumeBlock + jdBlock + starStoriesBlock,
    parsedSkills: input.parsedResume?.skills ?? [],
    jdKeywords,
    starStoriesBlock,
  };
  cache.set(fingerprint, built);
  return built;
}

export function lastTranscriptSlice(fullTranscript: string, maxChars = 2500): string {
  if (fullTranscript.length <= maxChars) return fullTranscript;
  return fullTranscript.slice(-maxChars);
}
