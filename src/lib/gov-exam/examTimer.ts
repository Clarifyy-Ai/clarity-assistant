/**
 * Server-authoritative exam remaining time.
 * Remaining seconds are derived from started_at + time_limit_minutes.
 * Client clock skew cannot extend the attempt: pause must not rewrite started_at.
 */

export function examExpiresAtMs(
  startedAt: string | null | undefined,
  timeLimitMinutes: number | null | undefined,
): number | null {
  const limitMins = Number(timeLimitMinutes ?? 0);
  if (!startedAt || !Number.isFinite(limitMins) || limitMins <= 0) return null;
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return null;
  return start + limitMins * 60_000;
}

export function computeRemainingSeconds(
  startedAt: string | null | undefined,
  timeLimitMinutes: number | null | undefined,
  nowMs = Date.now(),
): number {
  const limitMins = Number(timeLimitMinutes ?? 0);
  if (!Number.isFinite(limitMins) || limitMins <= 0) return 0;
  const limitSecs = Math.floor(limitMins * 60);
  if (!startedAt) return limitSecs;
  const expires = examExpiresAtMs(startedAt, limitMins);
  if (expires == null) return limitSecs;
  return Math.max(0, Math.floor((expires - nowMs) / 1000));
}

export function isExamExpired(
  startedAt: string | null | undefined,
  timeLimitMinutes: number | null | undefined,
  nowMs = Date.now(),
  graceMs = 2_000,
): boolean {
  const expires = examExpiresAtMs(startedAt, timeLimitMinutes);
  if (expires == null) return false;
  return nowMs > expires + graceMs;
}

/** True when an in-progress timed attempt must be submitted (including while paused). */
export function shouldAutoSubmitAttempt(
  status: string | null | undefined,
  startedAt: string | null | undefined,
  timeLimitMinutes: number | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (status !== "IN_PROGRESS") return false;
  const limitMins = Number(timeLimitMinutes ?? 0);
  if (!startedAt || !Number.isFinite(limitMins) || limitMins <= 0) return false;
  return (
    computeRemainingSeconds(startedAt, timeLimitMinutes, nowMs) <= 0 ||
    isExamExpired(startedAt, timeLimitMinutes, nowMs)
  );
}
