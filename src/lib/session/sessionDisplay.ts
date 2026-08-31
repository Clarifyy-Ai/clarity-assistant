export type SessionDurationSource = {
  duration_seconds?: number | null;
  started_at?: string | null;
  ended_at?: string | null;
  status?: string | null;
  lifecycle_status?: string | null;
};

export function formatSessionDuration(session: SessionDurationSource): string {
  if (typeof session.duration_seconds === "number" && session.duration_seconds >= 0) {
    const minutes = Math.floor(session.duration_seconds / 60);
    const seconds = session.duration_seconds % 60;
    if (minutes <= 0) return `${seconds}s`;
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  if (session.started_at && session.ended_at) {
    const ms = new Date(session.ended_at).getTime() - new Date(session.started_at).getTime();
    if (ms > 0) {
      const minutes = Math.floor(ms / 60000);
      return minutes > 0 ? `${minutes}m` : `${Math.floor(ms / 1000)}s`;
    }
  }
  if (session.status === "active" && !session.ended_at) return "In progress";
  return "—";
}

export function resolveOverallScore(
  session: { overall_score?: number | null } | null | undefined,
  scorecard: { overall_score?: number | null } | null | undefined,
): number | null {
  const fromSession = session?.overall_score;
  if (typeof fromSession === "number" && Number.isFinite(fromSession)) return fromSession;
  const fromCard = scorecard?.overall_score;
  if (typeof fromCard === "number" && Number.isFinite(fromCard)) return fromCard;
  return null;
}

export function sessionStatusLabel(session: SessionDurationSource): string {
  const lifecycle = (session.lifecycle_status ?? "").toLowerCase();
  if (lifecycle) return lifecycle.replaceAll("_", " ");
  const status = (session.status ?? "").toLowerCase();
  return status || "unknown";
}
