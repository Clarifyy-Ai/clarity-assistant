/**
 * Server-authoritative practice/live session lease helpers.
 * Prefer persisted `expires_at`; fall back to started_at + duration_minutes.
 *
 * Hidden-tab wall clock still applies while the session is active (lease can expire
 * in the background). Explicit Pause freezes active elapsed and remaining using
 * paused_at / total_paused_ms (gov-exam style); resume extends expires_at.
 */

export type PracticePauseClock = {
  pausedAt?: string | null;
  totalPausedMs?: number | null;
};

export function practiceExpiresAtMs(input: {
  expiresAt?: string | null;
  startedAt?: string | null;
  durationMinutes?: number | null;
}): number | null {
  if (input.expiresAt) {
    const exp = new Date(input.expiresAt).getTime();
    if (Number.isFinite(exp)) return exp;
  }
  const mins = Number(input.durationMinutes ?? 0);
  if (!input.startedAt || !Number.isFinite(mins) || mins <= 0) return null;
  const start = new Date(input.startedAt).getTime();
  if (!Number.isFinite(start)) return null;
  return start + mins * 60_000;
}

function effectiveNowMs(nowMs: number, pausedAt?: string | null): number {
  if (!pausedAt) return nowMs;
  const pauseMs = Date.parse(pausedAt);
  return Number.isFinite(pauseMs) ? pauseMs : nowMs;
}

function accruedPausedMs(totalPausedMs?: number | null): number {
  const n = Number(totalPausedMs ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Remaining seconds until lease end; 0 when expired. Null when no lease known. */
export function practiceRemainingSeconds(
  input: {
    expiresAt?: string | null;
    startedAt?: string | null;
    durationMinutes?: number | null;
  },
  nowMs = Date.now(),
  pause?: PracticePauseClock,
): number | null {
  const expires = practiceExpiresAtMs(input);
  if (expires == null) return null;
  const effectiveNow = effectiveNowMs(nowMs, pause?.pausedAt);
  return Math.max(0, Math.floor((expires - effectiveNow) / 1000));
}

export function isPracticeLeaseExpired(
  input: {
    expiresAt?: string | null;
    startedAt?: string | null;
    durationMinutes?: number | null;
  },
  nowMs = Date.now(),
  graceMs = 1_000,
  pause?: PracticePauseClock,
): boolean {
  if (pause?.pausedAt) return false;
  const expires = practiceExpiresAtMs(input);
  if (expires == null) return false;
  return nowMs > expires + graceMs;
}

/**
 * Active elapsed seconds (wall time minus accumulated pause).
 * While paused, freezes at the pause instant so resume does not jump.
 */
export function practiceElapsedSeconds(
  startedAt: string | null | undefined,
  nowMs = Date.now(),
  fallbackElapsed = 0,
  pause?: PracticePauseClock,
): number {
  if (!startedAt) return Math.max(0, Math.floor(fallbackElapsed));
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return Math.max(0, Math.floor(fallbackElapsed));
  const effectiveNow = effectiveNowMs(nowMs, pause?.pausedAt);
  const pausedAccrued = accruedPausedMs(pause?.totalPausedMs);
  return Math.max(0, Math.floor((effectiveNow - start - pausedAccrued) / 1000));
}

/** Extend lease end by pause duration (ISO). Returns null if input invalid. */
export function extendExpiresAtIso(
  expiresAt: string | null | undefined,
  pauseMs: number,
): string | null {
  if (!expiresAt || !Number.isFinite(pauseMs) || pauseMs <= 0) {
    return expiresAt ?? null;
  }
  const exp = Date.parse(expiresAt);
  if (!Number.isFinite(exp)) return expiresAt;
  return new Date(exp + pauseMs).toISOString();
}

/** Duration of the current open pause window (0 if not paused). */
export function currentPauseDurationMs(
  pausedAt: string | null | undefined,
  nowMs = Date.now(),
): number {
  if (!pausedAt) return 0;
  const start = Date.parse(pausedAt);
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, nowMs - start);
}

export type PracticeLeaseOutcome =
  | { kind: "ok"; expiresAt: string | null }
  | { kind: "expired"; terminalReason: string }
  | { kind: "transient"; code: string; status: number | null; message: string };

/** Classify start-session restore/heartbeat results and thrown API errors. */
export function classifyPracticeLeaseResult(
  result: {
    reason?: string | null;
    lifecycle_status?: string | null;
    terminal_reason?: string | null;
    expires_at?: string | null;
    found?: boolean;
  } | null,
  err?: unknown,
): PracticeLeaseOutcome {
  if (err) {
    const api = err as { code?: string; status?: number; message?: string };
    const code = String(api.code ?? "").toUpperCase();
    const status = typeof api.status === "number" ? api.status : null;
    if (
      code === "SESSION_EXPIRED" ||
      (status === 409 && /expired/i.test(String(api.message ?? "")))
    ) {
      return { kind: "expired", terminalReason: "SESSION_TIMEOUT" };
    }
    return {
      kind: "transient",
      code: code || "SERVICE_UNAVAILABLE",
      status,
      message: String(api.message ?? "Temporarily unavailable"),
    };
  }

  if (!result) {
    return {
      kind: "transient",
      code: "SERVICE_UNAVAILABLE",
      status: null,
      message: "No response from session service",
    };
  }

  if (
    result.reason === "SESSION_EXPIRED" ||
    result.lifecycle_status === "EXPIRED"
  ) {
    return {
      kind: "expired",
      terminalReason: result.terminal_reason ?? "SESSION_TIMEOUT",
    };
  }

  return { kind: "ok", expiresAt: result.expires_at ?? null };
}
