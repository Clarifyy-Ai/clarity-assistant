/**
 * Server-authoritative exam remaining time.
 * Prefer persisted expires_at when present; else started_at + time_limit_minutes.
 * Client clock skew cannot extend the attempt: pause must not rewrite started_at.
 */

export function examExpiresAtMs(
  startedAt: string | null | undefined,
  timeLimitMinutes: number | null | undefined,
  expiresAt?: string | null,
): number | null {
  if (expiresAt) {
    const exp = new Date(expiresAt).getTime();
    if (Number.isFinite(exp)) return exp;
  }
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
  expiresAt?: string | null,
): number {
  const limitMins = Number(timeLimitMinutes ?? 0);
  if (!Number.isFinite(limitMins) || limitMins <= 0) return 0;
  const limitSecs = Math.floor(limitMins * 60);
  if (!startedAt && !expiresAt) return limitSecs;
  const expires = examExpiresAtMs(startedAt, limitMins, expiresAt);
  if (expires == null) return limitSecs;
  return Math.max(0, Math.floor((expires - nowMs) / 1000));
}

export function isExamExpired(
  startedAt: string | null | undefined,
  timeLimitMinutes: number | null | undefined,
  nowMs = Date.now(),
  graceMs = 2_000,
  expiresAt?: string | null,
): boolean {
  const expires = examExpiresAtMs(startedAt, timeLimitMinutes, expiresAt);
  if (expires == null) return false;
  return nowMs > expires + graceMs;
}

/** True when an in-progress timed attempt must be submitted (including while paused). */
export function shouldAutoSubmitAttempt(
  status: string | null | undefined,
  startedAt: string | null | undefined,
  timeLimitMinutes: number | null | undefined,
  nowMs = Date.now(),
  expiresAt?: string | null,
): boolean {
  if (status !== "IN_PROGRESS") return false;
  const limitMins = Number(timeLimitMinutes ?? 0);
  if ((!startedAt && !expiresAt) || !Number.isFinite(limitMins) || limitMins <= 0) {
    return false;
  }
  return (
    computeRemainingSeconds(startedAt, timeLimitMinutes, nowMs, expiresAt) <= 0 ||
    isExamExpired(startedAt, timeLimitMinutes, nowMs, 2_000, expiresAt)
  );
}

/** Frozen server-clock origin so bootstrap refreshes do not reset the ticker. */
export type ExamTimerOrigin = {
  startedAt: string | null;
  expiresAt: string | null;
  timeLimitMinutes: number;
};

export function examTimerOriginFromAttempt(attempt: {
  started_at?: string | null;
  expires_at?: string | null;
  time_limit_minutes?: number | null;
} | null | undefined): ExamTimerOrigin | null {
  if (!attempt) return null;
  const timeLimitMinutes = Number(attempt.time_limit_minutes ?? 0);
  if (!Number.isFinite(timeLimitMinutes) || timeLimitMinutes <= 0) return null;
  const startedAt = attempt.started_at ?? null;
  const expiresAt = attempt.expires_at ?? null;
  if (!startedAt && !expiresAt) {
    return { startedAt: null, expiresAt: null, timeLimitMinutes };
  }
  return { startedAt, expiresAt, timeLimitMinutes };
}

export function examTimerOriginKey(origin: ExamTimerOrigin | null | undefined): string {
  if (!origin) return "";
  return `${origin.startedAt ?? ""}|${origin.expiresAt ?? ""}|${origin.timeLimitMinutes}`;
}

export function sameExamTimerOrigin(
  current: ExamTimerOrigin | null | undefined,
  next: ExamTimerOrigin | null | undefined,
): boolean {
  return examTimerOriginKey(current) === examTimerOriginKey(next);
}

export function remainingFromTimerOrigin(
  origin: ExamTimerOrigin | null | undefined,
  nowMs = Date.now(),
): number {
  if (!origin) return 0;
  return computeRemainingSeconds(
    origin.startedAt,
    origin.timeLimitMinutes,
    nowMs,
    origin.expiresAt,
  );
}

/** Timer chrome is safe only when limit metadata exists. */
export function canRenderExamTimer(origin: ExamTimerOrigin | null | undefined): boolean {
  return origin != null && origin.timeLimitMinutes > 0;
}
