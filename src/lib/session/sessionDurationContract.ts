export type SessionDurationSource = {
  duration_seconds?: number | null;
  started_at?: string | null;
  ended_at?: string | null;
  status?: string | null;
  lifecycle_status?: string | null;
};

/** Runtime contract for session duration display — reject malformed inputs at the boundary. */
export type SessionDurationInput = SessionDurationSource | null | undefined | unknown;

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

/**
 * Normalize unknown session-like values before duration formatting.
 * Returns null when the input cannot represent a session duration source.
 */
export function normalizeSessionDurationInput(
  input: SessionDurationInput,
): SessionDurationSource | null {
  if (input == null || typeof input !== "object") return null;

  const row = input as Record<string, unknown>;
  const durationRaw = row.duration_seconds;
  const duration_seconds =
    typeof durationRaw === "number" && Number.isFinite(durationRaw) && durationRaw >= 0
      ? Math.floor(durationRaw)
      : durationRaw === null || durationRaw === undefined
        ? null
        : null;

  const started_at = isIsoTimestamp(row.started_at) ? row.started_at : null;
  const ended_at = isIsoTimestamp(row.ended_at) ? row.ended_at : null;
  const status = typeof row.status === "string" ? row.status : null;
  const lifecycle_status =
    typeof row.lifecycle_status === "string" ? row.lifecycle_status : null;

  if (
    duration_seconds == null &&
    !(started_at && ended_at) &&
    !status &&
    !lifecycle_status
  ) {
    return null;
  }

  return {
    duration_seconds,
    started_at,
    ended_at,
    status,
    lifecycle_status,
  };
}
