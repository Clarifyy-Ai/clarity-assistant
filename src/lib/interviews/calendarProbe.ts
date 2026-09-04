/** Google Calendar availability probe cache + hang guards. */

export const SYNC_PROBE_TTL_MS = 5 * 60 * 1000;
export const CALENDAR_PROBE_TIMEOUT_MS = 8_000;

export const CALENDAR_UNAVAILABLE_MSG =
  "Google Calendar sync is not configured on this environment.";

export const CALENDAR_VERIFICATION_PENDING_MSG =
  "Calendar sync not available yet (Google verification pending). You can still schedule interviews.";

export type CalendarProbeReason =
  | "not_configured"
  | "verification_pending"
  | "ok";

export type CalendarProbeResult = {
  available: boolean;
  unavailable: boolean;
  inconclusive?: boolean;
  connectAllowed: boolean;
  publicOauth: boolean;
  reason: CalendarProbeReason;
};

type ProbeCache = {
  available: boolean;
  checkedAt: number;
  unavailable: boolean;
  connectAllowed: boolean;
  publicOauth: boolean;
  reason: CalendarProbeReason;
};

type Inflight = {
  startedAt: number;
  promise: Promise<CalendarProbeResult>;
};

let syncProbeCache: ProbeCache | null = null;
let syncProbeInflight: Inflight | null = null;

export function isCalendarUnavailableError(
  err: Error & { code?: string; status?: number },
): boolean {
  if (isCalendarOauthNotPublicError(err)) return false;
  if (err.status === 501 || err.code === "NOT_CONFIGURED") return true;
  const msg = (err.message ?? "").toLowerCase();
  return (
    msg.includes("501") ||
    msg.includes("not configured") ||
    msg.includes("coming soon") ||
    (msg.includes("not available") && !msg.includes("verification pending"))
  );
}

export function isCalendarOauthNotPublicError(
  err: Error & { code?: string; status?: number },
): boolean {
  return err.code === "OAUTH_NOT_PUBLIC" || err.code === "NOT_AUTHORIZED";
}

export function shouldCacheProbeFailure(
  err: Error & { code?: string; status?: number },
): boolean {
  if (err.status === 401 || err.status === 403) return false;
  return isCalendarUnavailableError(err);
}

export function isStaleProbeInflight(
  startedAt: number,
  now = Date.now(),
  timeoutMs = CALENDAR_PROBE_TIMEOUT_MS,
): boolean {
  return now - startedAt >= timeoutMs;
}

export function clearSyncProbeCache(): void {
  syncProbeCache = null;
  syncProbeInflight = null;
}

export function getSyncProbeCache(): ProbeCache | null {
  return syncProbeCache;
}

/** Parse Edge probe payload (supports successResponse envelope). */
export function parseCalendarProbePayload(raw: unknown): {
  available: boolean;
  configured: boolean;
  publicOauth: boolean;
  connectAllowed: boolean;
  reason: CalendarProbeReason;
} {
  const root = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const payload = (
    root.data && typeof root.data === "object" ? root.data : root
  ) as Record<string, unknown>;

  const configured =
    payload.configured !== false && payload.available !== false;
  const publicOauth = payload.publicOauth === true;
  // Fail closed: Connect only when Edge explicitly allows it.
  const connectAllowed =
    typeof payload.connectAllowed === "boolean"
      ? payload.connectAllowed
      : false;

  let reason: CalendarProbeReason;
  if (
    payload.reason === "not_configured" ||
    payload.reason === "verification_pending" ||
    payload.reason === "ok"
  ) {
    reason = payload.reason;
  } else if (!configured) {
    reason = "not_configured";
  } else if (connectAllowed) {
    reason = "ok";
  } else {
    reason = "verification_pending";
  }

  return {
    available: configured,
    configured,
    publicOauth,
    connectAllowed,
    reason,
  };
}

export function raceWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error("Timeout") as Error & { status?: number };
      err.status = 408;
      reject(err);
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function probeSyncAvailabilityCached(
  hasUser: boolean,
  fetchProbe: () => Promise<unknown>,
): Promise<CalendarProbeResult> {
  if (!hasUser) {
    return {
      available: false,
      unavailable: false,
      inconclusive: true,
      connectAllowed: false,
      publicOauth: false,
      reason: "not_configured",
    };
  }

  const now = Date.now();
  if (syncProbeCache && now - syncProbeCache.checkedAt < SYNC_PROBE_TTL_MS) {
    return {
      available: syncProbeCache.available,
      unavailable: syncProbeCache.unavailable,
      connectAllowed: syncProbeCache.connectAllowed,
      publicOauth: syncProbeCache.publicOauth,
      reason: syncProbeCache.reason,
    };
  }

  if (
    syncProbeInflight &&
    !isStaleProbeInflight(syncProbeInflight.startedAt, now)
  ) {
    return syncProbeInflight.promise;
  }
  syncProbeInflight = null;

  const startedAt = Date.now();
  const promise = (async (): Promise<CalendarProbeResult> => {
    try {
      const raw = await raceWithTimeout(fetchProbe(), CALENDAR_PROBE_TIMEOUT_MS);
      const parsed = parseCalendarProbePayload(raw);
      syncProbeCache = {
        available: parsed.available,
        checkedAt: Date.now(),
        unavailable: !parsed.configured,
        connectAllowed: parsed.connectAllowed,
        publicOauth: parsed.publicOauth,
        reason: parsed.reason,
      };
      return {
        available: parsed.available,
        unavailable: !parsed.configured,
        connectAllowed: parsed.connectAllowed,
        publicOauth: parsed.publicOauth,
        reason: parsed.reason,
      };
    } catch (err) {
      const e = err as Error & { code?: string; status?: number };
      const unavailable = isCalendarUnavailableError(e);
      if (shouldCacheProbeFailure(e)) {
        syncProbeCache = {
          available: false,
          checkedAt: Date.now(),
          unavailable,
          connectAllowed: false,
          publicOauth: false,
          reason: "not_configured",
        };
      }
      if (e.status === 401 || e.status === 403) {
        return {
          available: false,
          unavailable: false,
          inconclusive: true,
          connectAllowed: false,
          publicOauth: false,
          reason: "verification_pending",
        };
      }
      return {
        available: false,
        unavailable,
        connectAllowed: false,
        publicOauth: false,
        reason: unavailable ? "not_configured" : "verification_pending",
      };
    } finally {
      if (syncProbeInflight?.promise === promise) {
        syncProbeInflight = null;
      }
    }
  })();

  syncProbeInflight = { startedAt, promise };
  return promise;
}
