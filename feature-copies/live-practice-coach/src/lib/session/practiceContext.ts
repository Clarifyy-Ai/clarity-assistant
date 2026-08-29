export type PracticeContextSource = "answer_bank" | "manual" | "interview_day";

export interface PracticeContextDraft {
  source_type: PracticeContextSource;
  source_id: string | null;
  source_version: string | null;
  question_text: string;
  competency: string | null;
  role: string | null;
  company: string | null;
  resume_id: string | null;
  jd_id: string | null;
}

export function unspecifiedLabel(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : "Not specified";
}

/** Answer Bank launches a fresh context — never copy prior session role/company/docs. */
export function draftFromAnswerBankEntry(entry: {
  id: string;
  question_text?: string | null;
  category?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}): PracticeContextDraft {
  return {
    source_type: "answer_bank",
    source_id: entry.id,
    source_version: entry.updated_at ?? entry.created_at ?? null,
    question_text: (entry.question_text ?? "").trim(),
    competency: entry.category ?? null,
    role: null,
    company: null,
    resume_id: null,
    jd_id: null,
  };
}

export function shouldHydrateLastPracticeSetup(opts: {
  practiceContextId: string | null;
}): boolean {
  return !opts.practiceContextId;
}

export function practiceContextLaunchPath(contextId: string): string {
  return `/app/live?context=${encodeURIComponent(contextId)}`;
}
