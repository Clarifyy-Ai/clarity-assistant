export type SessionDurationSource = {
  duration_seconds?: number | null;
  started_at?: string | null;
  ended_at?: string | null;
  status?: string | null;
  lifecycle_status?: string | null;
};

/**
 * Format a session's duration for display.
 * Contract: pass a session-like object (or null/undefined). Never pass a bare number.
 * Null / missing / malformed duration → "—".
 */
export function formatSessionDuration(
  session: SessionDurationSource | null | undefined,
): string {
  if (session == null || typeof session !== "object") {
    return "—";
  }

  const rawDuration = session.duration_seconds;
  if (typeof rawDuration === "number" && Number.isFinite(rawDuration) && rawDuration >= 0) {
    const totalSeconds = Math.floor(rawDuration);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes <= 0) return `${seconds}s`;
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  if (session.started_at && session.ended_at) {
    const ms =
      new Date(session.ended_at).getTime() - new Date(session.started_at).getTime();
    if (Number.isFinite(ms) && ms > 0) {
      const minutes = Math.floor(ms / 60000);
      return minutes > 0 ? `${minutes}m` : `${Math.floor(ms / 1000)}s`;
    }
  }

  if (session.status === "active" && !session.ended_at) return "In progress";
  return "—";
}

export function resolveOverallScore(
  session: { overall_score?: number | null } | null | undefined,
  scorecard: {
    overall_score?: number | null;
    evaluation_status?: string | null;
    score_status?: string | null;
  } | null | undefined,
): number | null {
  const evalStatus = String(scorecard?.evaluation_status ?? "").toLowerCase().trim();
  const scoreStatus = String(scorecard?.score_status ?? "").toLowerCase().trim();

  // Authoritative path: completed scorecard only (never invent from session).
  if (evalStatus === "completed" || scoreStatus === "scored") {
    const fromCard = scorecard?.overall_score;
    if (typeof fromCard === "number" && Number.isFinite(fromCard)) return fromCard;
    return null;
  }

  // Scorecard present but not completed → unscored (do not fall back to session).
  if (
    scorecard &&
    (evalStatus ||
      scoreStatus === "not_scored" ||
      scoreStatus === "failed" ||
      scoreStatus === "pending" ||
      scoreStatus === "processing")
  ) {
    return null;
  }

  // Legacy sessions with no scorecard row may still carry overall_score.
  const fromSession = session?.overall_score;
  if (typeof fromSession === "number" && Number.isFinite(fromSession)) return fromSession;
  return null;
}

export function sessionStatusLabel(session: SessionDurationSource): string {
  const lifecycle = (session.lifecycle_status ?? "").toLowerCase();
  if (lifecycle) return lifecycle.replaceAll("_", " ");
  const status = (session.status ?? "").toLowerCase();
  return status || "unknown";
}
