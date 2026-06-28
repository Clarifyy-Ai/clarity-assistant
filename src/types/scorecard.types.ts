// ─────────────────────────────────────────────────────────────────────────────
// scorecard.types.ts — Domain types and DB mappers for session scorecards.
// ─────────────────────────────────────────────────────────────────────────────

export interface QuestionScore {
  question_id: string;
  question_text: string;
  order_index: number;
  score: number;
  confidence_score: number;
  star_used: boolean;
  key_strength: string;
  key_weakness: string;
  coach_tip: string;
}

/** Extended fields stored in scorecards.details JSONB. */
export interface ScorecardDetails {
  confidence_score?: number;
  clarity_score?: number;
  structure_score?: number;
  relevance_score?: number;
  question_scores?: QuestionScore[];
  filler_count?: number;
  filler_rate?: number;
  top_filler_words?: Array<{ word: string; count: number }>;
  wpm_avg?: number;
  wpm_trend?: string;
  coach_note?: string;
  star_adherence?: number;
  pdf_url?: string | null;
}

/** Application-level scorecard used by hooks and UI. */
export interface Scorecard {
  id: string;
  session_id: string;
  user_id: string;
  overall_score: number;
  confidence_score: number;
  clarity_score: number;
  structure_score: number;
  relevance_score: number;
  question_scores: QuestionScore[];
  filler_count: number;
  filler_rate: number;
  top_filler_words: Array<{ word: string; count: number }>;
  wpm_avg: number;
  wpm_trend: string;
  strengths: string[];
  improvements: string[];
  coach_note: string;
  star_adherence: number;
  is_shared: boolean;
  share_token: string | null;
  pdf_url: string | null;
  generated_at: string;
}

/** Row shape from public.scorecards (includes migration columns). */
export interface ScorecardRow {
  id: string;
  user_id: string;
  session_id: string | null;
  overall_score: number | null;
  communication: number | null;
  technical: number | null;
  problem_solving: number | null;
  confidence: number | null;
  feedback: string | null;
  strengths: string[] | null;
  improvements: string[] | null;
  created_at: string;
  details?: ScorecardDetails | null;
  share_token?: string | null;
  is_shared?: boolean | null;
  generated_at?: string | null;
}

function parseDetails(raw: unknown): ScorecardDetails {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as ScorecardDetails;
  }
  return {};
}

export function mapRowToScorecard(row: ScorecardRow): Scorecard {
  const details = parseDetails(row.details);

  return {
    id: row.id,
    session_id: row.session_id ?? "",
    user_id: row.user_id,
    overall_score: row.overall_score ?? 0,
    confidence_score: details.confidence_score ?? row.confidence ?? 0,
    clarity_score: details.clarity_score ?? row.communication ?? 0,
    structure_score: details.structure_score ?? row.problem_solving ?? 0,
    relevance_score: details.relevance_score ?? row.technical ?? 0,
    question_scores: details.question_scores ?? [],
    filler_count: details.filler_count ?? 0,
    filler_rate: details.filler_rate ?? 0,
    top_filler_words: details.top_filler_words ?? [],
    wpm_avg: details.wpm_avg ?? 0,
    wpm_trend: details.wpm_trend ?? "stable",
    strengths: row.strengths ?? [],
    improvements: row.improvements ?? [],
    coach_note: details.coach_note ?? row.feedback ?? "",
    star_adherence: details.star_adherence ?? 0,
    is_shared: row.is_shared ?? false,
    share_token: row.share_token ?? null,
    pdf_url: details.pdf_url ?? null,
    generated_at: row.generated_at ?? row.created_at,
  };
}

export function mapScorecardToInsert(scorecard: Scorecard): ScorecardRow {
  const details: ScorecardDetails = {
    confidence_score: scorecard.confidence_score,
    clarity_score: scorecard.clarity_score,
    structure_score: scorecard.structure_score,
    relevance_score: scorecard.relevance_score,
    question_scores: scorecard.question_scores,
    filler_count: scorecard.filler_count,
    filler_rate: scorecard.filler_rate,
    top_filler_words: scorecard.top_filler_words,
    wpm_avg: scorecard.wpm_avg,
    wpm_trend: scorecard.wpm_trend,
    coach_note: scorecard.coach_note,
    star_adherence: scorecard.star_adherence,
    pdf_url: scorecard.pdf_url,
  };

  return {
    id: scorecard.id,
    user_id: scorecard.user_id,
    session_id: scorecard.session_id,
    overall_score: scorecard.overall_score,
    communication: scorecard.clarity_score,
    technical: scorecard.relevance_score,
    problem_solving: scorecard.structure_score,
    confidence: scorecard.confidence_score,
    feedback: scorecard.coach_note,
    strengths: scorecard.strengths,
    improvements: scorecard.improvements,
    created_at: scorecard.generated_at,
    details,
    share_token: scorecard.share_token,
    is_shared: scorecard.is_shared,
    generated_at: scorecard.generated_at,
  };
}
