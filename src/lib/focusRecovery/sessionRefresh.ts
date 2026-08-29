import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import {
  isInvalidRefreshTokenError,
  redirectToSessionExpiredLogin,
} from "@/lib/auth/sessionErrors";
import { useAuthStore } from "@/store/authStore";

export interface SessionRefreshResult {
  session: Session | null;
  refreshed: boolean;
  expired: boolean;
  probeFailed: boolean;
}

const SESSION_SKEW_MS = 60_000;

let inFlight: Promise<SessionRefreshResult> | null = null;
/** True when the current inFlight was started with forceRefresh. */
let inFlightForced = false;

export function isSessionNearExpiry(
  expiresAtSeconds: number | null | undefined,
  now = Date.now(),
  skewMs = SESSION_SKEW_MS,
): boolean {
  if (expiresAtSeconds == null || !Number.isFinite(expiresAtSeconds)) return false;
  return expiresAtSeconds * 1000 <= now + skewMs;
}

function toResult(
  session: Session | null,
  extras: Partial<SessionRefreshResult> = {},
): SessionRefreshResult {
  return {
    session,
    refreshed: false,
    expired: false,
    probeFailed: false,
    ...extras,
  };
}

/**
 * One session refresh at a time. Soft callers coalesce. A forceRefresh caller
 * never joins a soft in-flight (that would skip refresh and reattach a stale JWT).
 * Multiple forceRefresh callers still share a single refresh.
 */
export async function ensureAuthSession(options?: {
  forceRefresh?: boolean;
  now?: number;
}): Promise<SessionRefreshResult> {
  const forceRefresh = options?.forceRefresh === true;

  if (inFlight) {
    // Soft → join any in-flight. Force → join only another force.
    if (!forceRefresh || inFlightForced) {
      return inFlight;
    }
    // Soft in-flight cannot satisfy forceRefresh — wait, then start a force pass.
    try {
      await inFlight;
    } catch {
      /* continue to force refresh */
    }
  }

  inFlightForced = forceRefresh;
  inFlight = runEnsure({ ...options, forceRefresh })
    .finally(() => {
      inFlight = null;
      inFlightForced = false;
    });
  return inFlight;
}

export function __resetSessionRefreshForTests(): void {
  inFlight = null;
  inFlightForced = false;
}

async function runEnsure(options?: {
  forceRefresh?: boolean;
  now?: number;
}): Promise<SessionRefreshResult> {
  const now = options?.now ?? Date.now();
  const prior = useAuthStore.getState();

  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) {
      if (isInvalidRefreshTokenError(error)) {
        return expireLocalSession();
      }
      return toResult(prior.session as unknown as Session | null, {
        probeFailed: true,
      });
    }

    if (!session) {
      if (prior.status === "authenticated" && prior.session) {
        return expireLocalSession();
      }
      return toResult(null, { expired: prior.status === "authenticated" });
    }

    applySession(session, false);

    const needsRefresh =
      options?.forceRefresh ||
      isSessionNearExpiry(session.expires_at, now);

    if (!needsRefresh) {
      return toResult(session);
    }

    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error) {
      if (isInvalidRefreshTokenError(refreshed.error)) {
        return expireLocalSession();
      }
      return toResult(session, { probeFailed: true });
    }

    if (!refreshed.data.session) {
      return expireLocalSession();
    }

    applySession(refreshed.data.session, true);
    return toResult(refreshed.data.session, { refreshed: true });
  } catch (err) {
    if (isInvalidRefreshTokenError(err)) {
      return expireLocalSession();
    }
    return toResult(prior.session as unknown as Session | null, {
      probeFailed: true,
    });
  }
}

function applySession(session: Session, overwriteUser: boolean): void {
  const state = useAuthStore.getState();
  if (state.status === "unauthenticated") return;
  useAuthStore.setState((current) => {
    current.session = session as unknown as typeof current.session;
    if (overwriteUser && session.user) {
      current.user = session.user as unknown as typeof current.user;
    } else if (!current.user && session.user) {
      current.user = session.user as unknown as typeof current.user;
    }
  });
}

function expireLocalSession(): SessionRefreshResult {
  const state = useAuthStore.getState();
  if (state.status !== "unauthenticated") {
    state.reset();
    redirectToSessionExpiredLogin();
  }
  return toResult(null, { expired: true });
}
