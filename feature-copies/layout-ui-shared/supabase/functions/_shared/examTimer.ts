/**
 * Server-authoritative exam remaining time (mirrors src/lib/gov-exam/examTimer.ts).
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
