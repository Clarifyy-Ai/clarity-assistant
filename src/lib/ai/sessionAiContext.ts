import { buildResumeContextForAI } from "@/lib/documents/interviewContext";
import { answerBankDB, jobDescriptionsDB } from "@/lib/supabase/database";
import type { ParsedResume } from "@/types/ai.types";

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
};

export type SessionAiContextLoaders = {
  buildResumeBlock: typeof buildResumeContextForAI;
  loadJdKeywords: (jdId: string) => Promise<string[]>;
  loadStarStories: (userId: string) => Promise<string>;
};

const cache = new Map<string, SessionAiContext>();

export function sessionAiContextFingerprint(input: {
  userId: string;
  resumeId?: string | null;
  jdId?: string | null;
  instructions?: string | null;
  contextChecksum?: string | null;
}): string {
  const instructionsKey = (input.instructions ?? "").trim().slice(0, 120);
  return [
    input.userId,
    input.resumeId ?? "",
    input.jdId ?? "",
    instructionsKey,
    input.contextChecksum ?? "",
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

async function defaultStarStories(userId: string): Promise<string> {
  const entries = await answerBankDB.listByUserId(userId);
  const lines = entries.slice(0, 5).map((entry) => {
    const enriched = entry as typeof entry & {
      star_situation?: string | null;
      star_task?: string | null;
      star_action?: string | null;
      star_result?: string | null;
      summary?: string | null;
    };
    const starParts = [
      enriched.star_situation,
      enriched.star_task,
      enriched.star_action,
      enriched.star_result,
    ].filter(Boolean);
    const starText =
      starParts.length > 0
        ? starParts.join(" → ")
        : (enriched.summary ?? enriched.answer_text?.slice(0, 240) ?? "");
    return `Q: ${entry.question_text}\nSTAR: ${starText}`;
  });
  if (!lines.length) return "";
  return `\n\nRelevant saved STAR stories:\n${lines.join("\n\n")}`;
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
      starStoriesBlock = await loaders.loadStarStories(input.userId);
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
