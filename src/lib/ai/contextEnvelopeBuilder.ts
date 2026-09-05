// src/lib/ai/contextEnvelopeBuilder.ts
// Stage 3 — Context Load for the 6‑stage answer pipeline.
// Gathers resume, JD, answer bank, and company research into a single
// "context envelope" that can be fed into LLMs. [file:1][file:3]

import type { CoachingContext } from "@/types/ai.types";
import { useAuthStore } from "@/store/userStore";
import {
  formatAnswerBankBlock,
  selectRelevantAnswerBankEntries,
  type AnswerBankEntryForContext,
} from "@/lib/ai/answerBankRelevance";
import { answerBankDB, jobDescriptionsDB } from "@/lib/supabase/database";
import { buildResumeContextForAI } from "@/lib/documents/interviewContext";
import { loadCompanyResearchBriefBlock } from "@/lib/company/loadCompanyResearchBrief";

/* ────────────────────────────────────────────────────────────── */
/* Types                                                         */
/* ────────────────────────────────────────────────────────────── */

export interface ResumeContext {
  raw_text: string | null;
  summary: string | null;
}

export interface JobDescriptionContext {
  id: string | null;
  title: string | null;
  company: string | null;
  raw_text: string | null;
  highlights: string[]; // top skills / responsibilities [file:3]
}

export interface AnswerBankEntry {
  id: string;
  question: string;
  star_summary: string;
  category: string | null;
  tags: string[];
}

export interface AnswerBankContext {
  entries: AnswerBankEntry[];
}

export interface CompanyResearchContext {
  company: string | null;
  summary: string | null;
  recent_news: string[];      // last 90 days [file:3]
  culture_signals: string[];  // values, interview style
  interview_format: string | null;
  tech_stack: string | null;
}

export interface SessionMetaContext {
  user_id: string | null;
  role: string | null;
  experience_level: string | null;
  session_type: string | null;
  target_company: string | null;
  language: string | null;
}

export interface ContextEnvelope {
  session: SessionMetaContext;
  resume: ResumeContext;
  job_description: JobDescriptionContext;
  answer_bank: AnswerBankContext;
  company_research: CompanyResearchContext;
  // Concise string representation suitable for LLM prompts
  prompt_block: string;
}

/* ────────────────────────────────────────────────────────────── */
/* Public API                                                    */
/* ────────────────────────────────────────────────────────────── */

export interface ContextEnvelopeOptions {
  context: CoachingContext;
  sessionId?: string;
  question?: string;
  // Fine‑grained switches if you ever want to skip heavy pieces
  includeResume?: boolean;
  includeJobDescription?: boolean;
  includeAnswerBank?: boolean;
  includeCompanyResearch?: boolean;
}

/**
 * Main entry point for Stage 3 — loads all relevant context in parallel
 * and returns a structured envelope plus a prompt‑ready text block. [file:1][file:3]
 */
/**
 * @deprecated Prefer `buildFeatureContext()` for new AI call sites.
 * Kept for coach store compatibility via `useSessionContext`.
 */
export async function buildContextEnvelope(
  opts: ContextEnvelopeOptions,
): Promise<ContextEnvelope> {
  const {
    context,
    sessionId,
    question,
    includeResume = true,
    includeJobDescription = true,
    includeAnswerBank = true,
    includeCompanyResearch = true,
  } = opts;

  const authStore = useAuthStore.getState();
  const userId = authStore.user?.id ?? context.user_id ?? null;

  const session: SessionMetaContext = {
    user_id:         userId,
    role:            context.role ?? null,
    experience_level: context.experience_level ?? null,
    session_type:    context.session_type ?? null,
    target_company:  context.target_company ?? null,
    language:        (context as any).language ?? null,
  };

  const [resume, jd, answerBank, company] = await Promise.all([
    includeResume ? loadResumeContext(userId) : emptyResume(),
    includeJobDescription
      ? loadJDContext(userId, (context as any).job_id ?? null)
      : emptyJD(context.target_company ?? null),
    includeAnswerBank
      ? loadAnswerBankContext(userId, question ?? null, context.session_type ?? null)
      : emptyAnswerBank(),
    includeCompanyResearch
      ? loadCompanyResearch(userId, context.target_company ?? null)
      : emptyCompanyResearch(context.target_company ?? null),
  ]);

  const prompt_block = buildPromptBlock({
    session,
    resume,
    jd,
    answerBank,
    company,
    question,
  });

  return {
    session,
    resume,
    job_description: jd,
    answer_bank: answerBank,
    company_research: company,
    prompt_block,
  };
}

/* ────────────────────────────────────────────────────────────── */
/* Resume context                                                */
/* ────────────────────────────────────────────────────────────── */

async function loadResumeContext(userId: string | null): Promise<ResumeContext> {
  if (!userId) return emptyResume();

  try {
    const block = await buildResumeContextForAI(userId, {});
    return {
      raw_text: null,
      summary: block?.trim() || null,
    };
  } catch {
    return emptyResume();
  }
}

function emptyResume(): ResumeContext {
  return { raw_text: null, summary: null };
}

/* ────────────────────────────────────────────────────────────── */
/* Job Description context                                       */
/* ────────────────────────────────────────────────────────────── */

async function loadJDContext(
  userId: string | null,
  jobId: string | null,
): Promise<JobDescriptionContext> {
  if (!userId || !jobId) return emptyJD(null);

  try {
    const row = await jobDescriptionsDB.getByIdMaybe(jobId);
    if (!row) return emptyJD(null);
    const r = row as Record<string, unknown>;
    const raw =
      String(r.description ?? r.content ?? r.raw_text ?? r.jd_text ?? "").trim();
    const kw = r.keywords ?? r.required_skills ?? r.skills;
    const highlights = Array.isArray(kw)
      ? kw.filter((s): s is string => typeof s === "string")
      : [];

    return {
      id: jobId,
      title: typeof r.title === "string" ? r.title : null,
      company: typeof r.company === "string" ? r.company : null,
      raw_text: raw || null,
      highlights,
    };
  } catch {
    return emptyJD(null);
  }
}

function emptyJD(company: string | null): JobDescriptionContext {
  return {
    id: null,
    title: null,
    company,
    raw_text: null,
    highlights: [],
  };
}

/* ────────────────────────────────────────────────────────────── */
/* Answer Bank context                                           */
/* ────────────────────────────────────────────────────────────── */

async function loadAnswerBankContext(
  userId: string | null,
  question: string | null,
  _sessionType: string | null,
): Promise<AnswerBankContext> {
  if (!userId) return emptyAnswerBank();

  try {
    const rows = await answerBankDB.listByUserId(userId);
    const mapped: AnswerBankEntryForContext[] = rows.map((entry) => ({
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
      ? selectRelevantAnswerBankEntries(mapped, question, { max: 5 })
      : mapped.slice(0, 5);

    const entries: AnswerBankEntry[] = selected.map((e) => {
      const starParts = [
        e.star_situation,
        e.star_task,
        e.star_action,
        e.star_result,
      ].filter(Boolean);
      return {
        id: e.id,
        question: e.question_text,
        star_summary:
          starParts.length > 0
            ? starParts.join(" → ")
            : (e.summary ?? e.answer_text?.slice(0, 240) ?? ""),
        category: e.category ?? null,
        tags: e.tags ?? [],
      };
    });

    return { entries };
  } catch {
    return emptyAnswerBank();
  }
}

function emptyAnswerBank(): AnswerBankContext {
  return { entries: [] };
}

/* ────────────────────────────────────────────────────────────── */
/* Company research context                                      */
/* ────────────────────────────────────────────────────────────── */

async function loadCompanyResearch(
  userId: string | null,
  company: string | null,
): Promise<CompanyResearchContext> {
  if (!company || !userId) return emptyCompanyResearch(company);

  try {
    const brief = await loadCompanyResearchBriefBlock(userId, company);
    if (!brief) return emptyCompanyResearch(company);

    return {
      company: brief.company,
      summary: brief.summary,
      recent_news: [],
      culture_signals: [],
      interview_format: null,
      tech_stack: null,
    };
  } catch {
    return emptyCompanyResearch(company);
  }
}

function emptyCompanyResearch(company: string | null): CompanyResearchContext {
  return {
    company,
    summary: null,
    recent_news: [],
    culture_signals: [],
    interview_format: null,
    tech_stack: null,
  };
}

/* ────────────────────────────────────────────────────────────── */
/* Prompt builder                                                */
/* ────────────────────────────────────────────────────────────── */

interface PromptBuilderInput {
  session: SessionMetaContext;
  resume: ResumeContext;
  jd: JobDescriptionContext;
  answerBank: AnswerBankContext;
  company: CompanyResearchContext;
  question?: string | null;
}

/**
 * Builds a concise, layered context block for the LLM, following the
 * manual’s guidance: resume + JD + answer bank + company research. [file:1][file:3]
 */
function buildPromptBlock(input: PromptBuilderInput): string {
  const { session, resume, jd, answerBank, company, question } = input;

  const parts: string[] = [];

  // Session metadata
  parts.push("SESSION CONTEXT");
  parts.push(
    [
      session.role && `Role: ${session.role}`,
      session.experience_level &&
        `Seniority: ${session.experience_level}`,
      session.session_type && `Interview type: ${session.session_type}`,
      session.target_company &&
        `Target company: ${session.target_company}`,
      session.language && `Language: ${session.language}`,
    ]
      .filter(Boolean)
      .join(" | "),
  );

  if (question) {
    parts.push("");
    parts.push(`CURRENT QUESTION: "${question}"`);
  }

  // Resume summary
  if (resume.summary) {
    parts.push("");
    parts.push("RESUME SUMMARY");
    parts.push(resume.summary);
  }

  // Job description
  if (jd.raw_text || jd.highlights.length) {
    parts.push("");
    parts.push(
      `JOB DESCRIPTION${
        jd.title || jd.company ? ` — ${jd.title ?? ""} @ ${jd.company ?? ""}` : ""
      }`.trim(),
    );
    if (jd.highlights.length) {
      parts.push(
        "Key requirements and priorities: " +
          jd.highlights.slice(0, 6).join("; "),
      );
    }
  }

  // Answer bank
  if (answerBank.entries.length) {
    parts.push("");
    parts.push("RELEVANT SAVED ANSWERS (STAR SUMMARIES)");
    answerBank.entries.slice(0, 4).forEach((entry, idx) => {
      parts.push(
        `${idx + 1}. Q: ${entry.question}\n   STAR summary: ${entry.star_summary}`,
      );
    });
  }

  // Company research
  if (company.summary || company.recent_news.length) {
    parts.push("");
    parts.push(
      `COMPANY RESEARCH${
        company.company ? ` — ${company.company}` : ""
      }`.trim(),
    );
    if (company.summary) {
      parts.push(company.summary);
    }
    if (company.recent_news.length) {
      parts.push(
        "Recent news (last 90 days): " +
          company.recent_news.slice(0, 3).join(" | "),
      );
    }
    if (company.culture_signals.length) {
      parts.push(
        "Culture and values signals: " +
          company.culture_signals.slice(0, 4).join("; "),
      );
    }
    if (company.interview_format) {
      parts.push(`Interview format intel: ${company.interview_format}`);
    }
    if (company.tech_stack) {
      parts.push(`Tech stack highlights: ${company.tech_stack}`);
    }
  }

  return parts.filter(Boolean).join("\n");
}

/**
 * Compatibility helpers used by useSessionContext.
 * Prefer buildContextEnvelope for new call sites; these keep the coach store API stable.
 */
export function buildCoachingContext(
  profile: {
    id: string;
    full_name?: string | null;
    role_type?: string | null;
    target_role?: string | null;
    experience_level?: CoachingContext["experience_level"];
    years_of_experience?: number | null;
    coach_tone?: CoachingContext["coach_tone"];
    hint_style?: CoachingContext["hint_style"];
  },
  sessionConfig: {
    company?: string | null;
    role?: string | null;
    experience_level?: CoachingContext["experience_level"];
    interview_type?: CoachingContext["session_type"];
    question_count?: number;
    hint_style?: CoachingContext["hint_style"];
  },
  _activeContext?: unknown,
  overrides?: Partial<CoachingContext>,
): CoachingContext {
  return {
    user_id: profile.id,
    full_name: profile.full_name ?? null,
    role: sessionConfig.role ?? profile.target_role ?? profile.role_type ?? null,
    domain: null,
    experience_level:
      sessionConfig.experience_level ?? profile.experience_level ?? null,
    years_of_experience: profile.years_of_experience ?? null,
    target_company: sessionConfig.company ?? null,
    coach_tone: profile.coach_tone ?? "encouraging",
    hint_style: sessionConfig.hint_style ?? profile.hint_style ?? "short_hints",
    resume_skills: [],
    resume_projects: [],
    resume_experience_summary: null,
    jd_required_skills: [],
    jd_seniority_signals: [],
    gap_skills: [],
    session_goals: [],
    filler_words_to_watch: [],
    current_filler_count: 0,
    current_wpm: 0,
    weak_areas: [],
    strong_areas: [],
    last_3_answer_summaries: [],
    avg_confidence_score: 0,
    session_type: sessionConfig.interview_type ?? "mixed",
    question_number: 1,
    total_questions: sessionConfig.question_count ?? 5,
    ...overrides,
  };
}

export function serialiseContextForPrompt(ctx: CoachingContext): string {
  const bits = [
    ctx.role ? `Role: ${ctx.role}` : null,
    ctx.target_company ? `Company: ${ctx.target_company}` : null,
    ctx.experience_level ? `Level: ${ctx.experience_level}` : null,
    ctx.hint_style ? `Hint style: ${ctx.hint_style}` : null,
    ctx.coach_tone ? `Tone: ${ctx.coach_tone}` : null,
  ].filter(Boolean);
  return bits.join(" | ");
}
