import { normalizeScoreStatus } from "@/lib/analytics/scoreStatus";

export type AnalyzableSessionRow = {
  session_id: string;
  score_status?: string | null;
  overall_score?: number | null;
  answered_count?: number | null;
};

/** Unscored sessions that have at least one recorded answer (can call generate-scorecard). */
export function getAnalyzableSessionIds(
  sessions: AnalyzableSessionRow[] | null | undefined,
): string[] {
  if (!sessions?.length) return [];
  const ids: string[] = [];
  for (const session of sessions) {
    const status = normalizeScoreStatus(session.score_status, session.overall_score);
    // Never kick analyze while a scorecard job is still processing.
    if (status === "pending") continue;
    const scored =
      status === "scored" ||
      (typeof session.overall_score === "number" && Number.isFinite(session.overall_score));
    const answered =
      typeof session.answered_count === "number" && session.answered_count > 0;
    if (!scored && answered && session.session_id) {
      ids.push(session.session_id);
    }
  }
  return ids;
}

export function isAnalyzableSession(session: AnalyzableSessionRow): boolean {
  return getAnalyzableSessionIds([session]).length === 1;
}
