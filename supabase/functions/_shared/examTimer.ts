/**
 * Server-authoritative exam remaining time (mirrors src/lib/gov-exam/examTimer.ts).
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
