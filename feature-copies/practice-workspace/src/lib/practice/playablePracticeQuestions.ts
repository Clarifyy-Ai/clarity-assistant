import { supabase } from "@/lib/supabase/client";
import { getLocalMockQuestions, type LocalQuestion } from "@/lib/mock/localQuestionBank";
import { PLAYABLE_QUESTIONS_VIEW, type PlayableQuestion } from "@/lib/gov-exam/playableQuestions";
import type { InterviewType } from "@/lib/practice/workspaceScoring";

export type PracticeWorkspaceQuestion = {
  id: string;
  question: string;
  question_text: string;
  difficulty: string;
  type: string;
};

export type PracticeQuestionSource = "playable" | "local";

const INTERVIEWISH_TOPIC_RE =
  /interview|behavioral|behavioural|hr|technical|coding|system[\s_-]?design|managerial|resume|dsa|software|frontend|backend/i;

const TYPE_KEYWORDS: Record<InterviewType, string[]> = {
  Technical: ["technical", "coding", "dsa", "software", "backend", "frontend"],
  Behavioral: ["behavioral", "behavioural", "interview", "hr"],
  HR: ["hr", "behavioral", "behavioural"],
  Managerial: ["managerial", "leadership", "interview"],
  "System Design": ["system design", "system_design", "architecture"],
  Coding: ["coding", "dsa", "programming", "technical"],
  "Resume Based": ["resume", "behavioral", "interview"],
};

export function interviewTypeToLocalBankType(interviewType: InterviewType): string {
  if (interviewType === "Behavioral" || interviewType === "HR") return "behavioural";
  if (interviewType === "System Design") return "system_design";
  return "technical";
}

export function playableTopicBlob(row: {
  topic?: string | null;
  subject?: string | null;
  category?: string | null;
  tags?: string[] | null;
  exam_type?: string | null;
}): string {
  return [row.topic, row.subject, row.category, row.exam_type, ...(row.tags ?? [])]
    .filter((part): part is string => Boolean(part && String(part).trim()))
    .join(" ");
}

/** True when topic/subject/category look like interview practice, not a gov-exam paper. */
export function isInterviewishPlayableRow(
  row: {
    topic?: string | null;
    subject?: string | null;
    category?: string | null;
    tags?: string[] | null;
    exam_type?: string | null;
  },
  interviewType?: InterviewType,
): boolean {
  const blob = playableTopicBlob(row);
  if (!blob) return true;
  if (!INTERVIEWISH_TOPIC_RE.test(blob)) return false;
  if (!interviewType) return true;
  const keywords = TYPE_KEYWORDS[interviewType] ?? [];
  if (keywords.length === 0) return true;
  const lower = blob.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

export function mapPlayableToPracticeQuestion(
  row: Pick<PlayableQuestion, "id" | "question_text" | "difficulty"> & { topic?: string | null },
  interviewType: InterviewType,
): PracticeWorkspaceQuestion {
  const text = row.question_text?.trim() || "Practice question";
  return {
    id: row.id,
    question: text,
    question_text: text,
    difficulty: String(row.difficulty ?? "medium").toLowerCase(),
    type: interviewTypeToLocalBankType(interviewType),
  };
}

export function mapLocalToPracticeQuestion(row: LocalQuestion): PracticeWorkspaceQuestion {
  return {
    id: row.id,
    question: row.question,
    question_text: row.question_text,
    difficulty: row.difficulty,
    type: row.type,
  };
}

export function resolvePracticeQuestions(input: {
  playable: Array<PlayableQuestion & { category?: string | null; tags?: string[] | null }>;
  interviewType: InterviewType;
  localFallback: LocalQuestion[];
  count?: number;
}): { questions: PracticeWorkspaceQuestion[]; source: PracticeQuestionSource } {
  const count = input.count ?? 4;
  const filtered = input.playable.filter((row) => isInterviewishPlayableRow(row, input.interviewType));
  const fromBank = (filtered.length > 0 ? filtered : input.playable)
    .filter((row) => Boolean(row.question_text?.trim()))
    .slice(0, count)
    .map((row) => mapPlayableToPracticeQuestion(row, input.interviewType));

  if (fromBank.length > 0) {
    return { questions: fromBank, source: "playable" };
  }
  return {
    questions: input.localFallback.slice(0, count).map(mapLocalToPracticeQuestion),
    source: "local",
  };
}

function buildPlayableOrFilter(interviewType: InterviewType): string {
  const keywords = [...new Set([...(TYPE_KEYWORDS[interviewType] ?? []), "interview"])];
  const clauses: string[] = [];
  for (const kw of keywords) {
    const escaped = kw.replace(/%/g, "");
    clauses.push(`topic.ilike.%${escaped}%`);
    clauses.push(`subject.ilike.%${escaped}%`);
    clauses.push(`category.ilike.%${escaped}%`);
  }
  return clauses.join(",");
}

export async function fetchPracticeWorkspaceQuestions(input: {
  interviewType: InterviewType;
  role: string;
  difficulty: "easy" | "medium" | "hard";
  count?: number;
}): Promise<{ questions: PracticeWorkspaceQuestion[]; source: PracticeQuestionSource }> {
  const count = input.count ?? 4;
  const localFallback = getLocalMockQuestions({
    type: interviewTypeToLocalBankType(input.interviewType),
    count,
    role: input.role,
    difficulty: input.difficulty,
  });

  try {
    const difficultyUpper = input.difficulty.toUpperCase();
    let query = supabase
      .from(PLAYABLE_QUESTIONS_VIEW)
      .select("id,question_text,topic,subject,category,tags,difficulty,exam_type")
      .limit(Math.max(count * 6, 24));

    const orFilter = buildPlayableOrFilter(input.interviewType);
    if (orFilter) {
      query = query.or(orFilter);
    }

    const { data, error } = await query;
    if (error || !data || data.length === 0) {
      return { questions: localFallback.map(mapLocalToPracticeQuestion), source: "local" };
    }

    const preferredDifficulty = data.filter(
      (row) => String(row.difficulty ?? "").toUpperCase() === difficultyUpper,
    );
    const pool = preferredDifficulty.length >= count ? preferredDifficulty : data;

    return resolvePracticeQuestions({
      playable: pool as Array<PlayableQuestion & { category?: string | null; tags?: string[] | null }>,
      interviewType: input.interviewType,
      localFallback,
      count,
    });
  } catch {
    return { questions: localFallback.map(mapLocalToPracticeQuestion), source: "local" };
  }
}
