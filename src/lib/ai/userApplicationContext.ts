/**
 * Complete user application context for AI personalization:
 * profile + documents + answer bank + session history.
 */
import { withTimeout } from "@/lib/auth/accountBootstrap";
import { buildResumeContextForAI } from "@/lib/documents/interviewContext";
import {
  formatAnswerBankBlock,
  selectRelevantAnswerBankEntries,
  type AnswerBankEntryForContext,
} from "@/lib/ai/answerBankRelevance";
import { fetchSessionHistory } from "@/lib/session/sessionHistoryApi";
import {
  sessionHistoryScoreDisplay,
  sessionHistoryTypeLabel,
  type SessionHistoryItem,
} from "@/lib/session/sessionHistoryTypes";
import { answerBankDB } from "@/lib/supabase/database";
import { useAuthStore } from "@/store/authStore";
import { useDocumentStore } from "@/store/documentStore";

const PRACTICE_SESSION_TYPES = new Set([
  "mock_interview",
  "practice_coach",
  "live_copilot",
  "practice_workspace",
]);

export type UserApplicationProfile = {
  role?: string | null;
  experienceLevel?: string | null;
  experienceYears?: number | null;
  industry?: string | null;
  domain?: string | null;
  company?: string | null;
  coachTone?: string | null;
};

export type UserApplicationContext = {
  profile: UserApplicationProfile;
  resumeBlock: string;
  jdBlock: string;
  answerBankSummary: string;
  sessionHistoryBlock: string;
  sessionHistorySnippets: string[];
  recentAnswerSummaries: Array<{ question: string; score: number; key_weakness: string | null }>;
};

export function formatSessionHistoryForAI(items: SessionHistoryItem[]): {
  block: string;
  snippets: string[];
  recentAnswerSummaries: Array<{ question: string; score: number; key_weakness: string | null }>;
} {
  const relevant = items
    .filter((item) => PRACTICE_SESSION_TYPES.has(String(item.sessionType)))
    .slice(0, 6);

  if (relevant.length === 0) {
    return { block: "", snippets: [], recentAnswerSummaries: [] };
  }

  const snippets = relevant.map((item) => {
    const type = sessionHistoryTypeLabel(item);
    const role = item.role ?? item.title ?? "Session";
    const company = item.company ? ` @ ${item.company}` : "";
    const score = sessionHistoryScoreDisplay(item);
    const when = item.lastActivityAt?.slice(0, 10) ?? "";
    return `${when} · ${type} · ${role}${company} · ${score}`;
  });

  const block = [
    "Recent practice history (personalize questions and coaching — avoid repeating the same scenarios verbatim):",
    ...snippets.map((line) => `- ${line}`),
  ].join("\n");

  const recentAnswerSummaries = relevant.slice(0, 3).map((item) => ({
    question: `${sessionHistoryTypeLabel(item)} — ${item.role ?? item.title ?? "session"}`,
    score: typeof item.score === "number" ? item.score : 0,
    key_weakness:
      typeof item.score === "number" && item.score < 60
        ? `Prior score ${sessionHistoryScoreDisplay(item)} — probe gaps in this area`
        : null,
  }));

  return { block, snippets, recentAnswerSummaries };
}

export async function loadSessionHistoryContext(userId: string): Promise<{
  block: string;
  snippets: string[];
  recentAnswerSummaries: Array<{ question: string; score: number; key_weakness: string | null }>;
}> {
  if (!userId) {
    return { block: "", snippets: [], recentAnswerSummaries: [] };
  }
  try {
    const history = await withTimeout(
      fetchSessionHistory({ pageSize: 8, sort: "newest" }),
      12_000,
      "Session history for AI context",
    );
    return formatSessionHistoryForAI(history.items);
  } catch (err) {
    console.warn("[userApplicationContext] session history unavailable:", err);
    return { block: "", snippets: [], recentAnswerSummaries: [] };
  }
}

function mapAnswerBankRows(
  rows: Awaited<ReturnType<typeof answerBankDB.listByUserId>>,
): AnswerBankEntryForContext[] {
  return rows.map((e) => ({
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
}

export async function loadUserApplicationContext(
  userId: string,
  opts?: {
    question?: string;
    resumeContent?: string | null;
    jdText?: string | null;
    includeHistory?: boolean;
    profileOverride?: Partial<UserApplicationProfile>;
  },
): Promise<UserApplicationContext> {
  const profile = useAuthStore.getState().profile;
  const docStore = useDocumentStore.getState();
  const activeResume = docStore.active_context?.resume as
    | { content?: string | null; title?: string | null }
    | null
    | undefined;
  const activeJd = docStore.active_context?.job_description as
    | { content?: string | null; description?: string | null; title?: string | null }
    | null
    | undefined;

  const resumeContent =
    opts?.resumeContent ?? (typeof activeResume?.content === "string" ? activeResume.content : null);
  const jdText =
    opts?.jdText ??
    (activeJd?.content ?? activeJd?.description ?? "").trim().slice(0, 4_000);

  const appProfile: UserApplicationProfile = {
    role: opts?.profileOverride?.role ?? profile?.target_role,
    experienceLevel: opts?.profileOverride?.experienceLevel ?? profile?.experience_level,
    experienceYears: opts?.profileOverride?.experienceYears ?? profile?.experience_years,
    industry: opts?.profileOverride?.industry ?? profile?.industry,
    domain: opts?.profileOverride?.domain ?? profile?.domain,
    company:
      opts?.profileOverride?.company ??
      (profile as { target_company?: string | null } | null)?.target_company,
    coachTone: opts?.profileOverride?.coachTone ?? profile?.coach_tone,
  };

  let resumeBlock = "";
  try {
    resumeBlock = await buildResumeContextForAI(userId, {
      resumeContent,
      jdSnippet: jdText || null,
      role: appProfile.role,
      company: appProfile.company,
    });
  } catch {
    resumeBlock = resumeContent?.trim().slice(0, 4_000) ?? "";
  }

  let answerBankSummary = "";
  try {
    const rows = mapAnswerBankRows(await answerBankDB.listByUserId(userId));
    const selected = opts?.question?.trim()
      ? selectRelevantAnswerBankEntries(rows, opts.question, { max: 5 })
      : rows.slice(0, 5);
    answerBankSummary = formatAnswerBankBlock(selected);
  } catch {
    answerBankSummary = "";
  }

  const history =
    opts?.includeHistory === false
      ? { block: "", snippets: [], recentAnswerSummaries: [] }
      : await loadSessionHistoryContext(userId);

  return {
    profile: appProfile,
    resumeBlock,
    jdBlock: jdText,
    answerBankSummary,
    sessionHistoryBlock: history.block,
    sessionHistorySnippets: history.snippets,
    recentAnswerSummaries: history.recentAnswerSummaries,
  };
}

export function mergeApplicationContextIntoResumeBlock(
  resumeBlock: string,
  extras: Pick<UserApplicationContext, "answerBankSummary" | "sessionHistoryBlock">,
): string {
  const parts = [resumeBlock];
  if (
    extras.answerBankSummary &&
    !resumeBlock.includes("Relevant saved STAR stories") &&
    !resumeBlock.includes("Saved answer examples")
  ) {
    parts.push(extras.answerBankSummary);
  }
  if (extras.sessionHistoryBlock && !resumeBlock.includes("Recent practice history")) {
    parts.push(extras.sessionHistoryBlock);
  }
  return parts.filter(Boolean).join("\n\n");
}

export function userApplicationContextForPrep(
  ctx: UserApplicationContext,
): Record<string, unknown> {
  return {
    role: ctx.profile.role ?? undefined,
    experience_level: ctx.profile.experienceLevel ?? undefined,
    experience_years: ctx.profile.experienceYears ?? undefined,
    industry: ctx.profile.industry ?? undefined,
    domain: ctx.profile.domain ?? undefined,
    company: ctx.profile.company ?? undefined,
    coach_tone: ctx.profile.coachTone ?? undefined,
    resume_summary: ctx.resumeBlock.slice(0, 4_000) || undefined,
    job_description: ctx.jdBlock.slice(0, 4_000) || undefined,
    answer_bank_summary: ctx.answerBankSummary.slice(0, 2_000) || undefined,
    session_history: ctx.sessionHistoryBlock.slice(0, 2_000) || undefined,
    session_history_snippets: ctx.sessionHistorySnippets.slice(0, 6),
  };
}
