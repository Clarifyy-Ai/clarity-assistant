// src/lib/ai/contextEnvelopeBuilder.ts
// Stage 3 — Context Load for the 6‑stage answer pipeline.
// Gathers resume, JD, answer bank, and company research into a single
// "context envelope" that can be fed into LLMs. [file:1][file:3]

import type { CoachingContext } from "@/types/ai.types";
import { useAuthStore } from "@/store/userStore";
import { EDGE_BASE } from "@/lib/env";
import { retry } from "@/lib/utils";
import { useNetworkStore } from "@/store/networkStore";

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
      ? loadCompanyResearch(context.target_company ?? null)
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

  // Use existing CoachingContext when available to avoid network calls.
  const ctx = useAuthStore.getState().profile as any;
  if (ctx?.resume_experience_summary) {
    return {
      raw_text: null,
      summary: ctx.resume_experience_summary,
    };
  }

  // Fallback – call prep-tool EF with tool_id="resume_summary" if it exists.
  try {
    const res = await retry(
      () =>
        fetch(`${EDGE_BASE}/prep-tool`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tool_id: "resume_context",
            input: { user_id: userId },
          }),
        }),
      2,
      300,
    );

    if (!res.ok) return emptyResume();
    const data = await res.json();
    return {
      raw_text: data.resume_raw ?? null,
      summary:  data.resume_summary ?? null,
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
  if (!userId) return emptyJD(null);

  try {
    const res = await retry(
      () =>
        fetch(`${EDGE_BASE}/prep-tool`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tool_id: "job_description_context",
            input: { user_id: userId, job_id: jobId },
          }),
        }),
      2,
      300,
    );

    if (!res.ok) return emptyJD(null);
    const data = await res.json();

    return {
      id:         data.job_id ?? jobId ?? null,
      title:      data.title ?? null,
      company:    data.company ?? null,
      raw_text:   data.text ?? null,
      highlights: data.highlights ?? [],
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
  sessionType: string | null,
): Promise<AnswerBankContext> {
  if (!userId) return emptyAnswerBank();

  try {
    const res = await retry(
      () =>
        fetch(`${EDGE_BASE}/prep-tool`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tool_id: "answer_bank_context",
            input: {
              user_id: userId,
              question,
              session_type: sessionType,
              limit: 5,
            },
          }),
        }),
      2,
      300,
    );

    if (!res.ok) return emptyAnswerBank();
    const data = await res.json();

    const entries: AnswerBankEntry[] = (data.entries ?? []).map(
      (e: any): AnswerBankEntry => ({
        id: e.id,
        question: e.question,
        star_summary: e.star_summary,
        category: e.category ?? null,
        tags: e.tags ?? [],
      }),
    );

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
  company: string | null,
): Promise<CompanyResearchContext> {
  if (!company) return emptyCompanyResearch(null);

  try {
    const res = await retry(
      () =>
        fetch(`${EDGE_BASE}/prep-tool`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tool_id: "company_research_context",
            input: { company },
          }),
        }),
      2,
      300,
    );

    if (!res.ok) return emptyCompanyResearch(company);
    const data = await res.json();

    return {
      company,
      summary:         data.summary ?? null,
      recent_news:     data.recent_news ?? [],
      culture_signals: data.culture ?? [],
      interview_format: data.interview_format ?? null,
      tech_stack:      data.tech_stack ?? null,
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
