/**
 * Pure helpers for the authoritative auth → profile → role bootstrap.
 * Keep side-effect free so unit tests can cover timeouts, dedupe, and errors.
 */

export const AUTH_ACCOUNT_FRIENDLY_ERROR =
  "Unable to load your account. Please try again.";

export const AUTH_INVALID_CREDENTIALS_MESSAGE =
  "Incorrect email or password.";

export const AUTH_SESSION_EXPIRED_MESSAGE =
  "Your session has expired. Please sign in again.";

export const AUTH_NETWORK_FAILURE_MESSAGE =
  "Cannot reach the sign-in service. Check your internet connection and try again.";

export const AUTH_SERVER_FAILURE_MESSAGE =
  "Sign-in is temporarily unavailable. Please try again in a moment.";

/** Per-attempt profile read budget (India ↔ us-east cold starts can exceed 10s). */
export const PROFILE_FETCH_TIMEOUT_MS = 15_000;

/** Per-attempt admin role budget — must NOT gate Free-user routing. */
export const ROLE_CHECK_TIMEOUT_MS = 12_000;

export const AUTH_SESSION_TIMEOUT_MS_WEB = 15_000;
export const AUTH_SESSION_TIMEOUT_MS_ELECTRON = 18_000;

/** Delay before a cold-start profile retry after consecutive timeouts. */
export const PROFILE_COLD_RETRY_DELAY_MS = 1_500;

export const MAX_ACCOUNT_RECOVERY_ATTEMPTS = 3;

export type AccountBootstrapPhase =
  | "idle"
  | "session"
  | "profile"
  | "role"
  | "resolved"
  | "failed";

/**
 * Authoritative UI/lifecycle phase for protected routing.
 * status (idle/loading/authenticated/…) remains for backward compatibility.
 */
export type AccountPhase =
  | "INITIALIZING"
  | "AUTHENTICATED"
  | "ACCOUNT_LOADING"
  | "READY"
  | "RECOVERY_REQUIRED"
  | "UNAUTHENTICATED";

export type AccountLoadFailureKind =
  | "invalid_credentials"
  | "auth_server_failure"
  | "network_failure"
  | "expired_session"
  | "missing_profile"
  | "profile_query_failure"
  | "missing_role"
  | "role_query_failure"
  | "restricted_account"
  | "schema_config_failure"
  | "timeout"
  | "unknown";

export interface ResolvedAccountContext {
  userId: string;
  email: string | null;
  planId: string;
  credits: number;
  isOnboarded: boolean;
  isBanned: boolean;
  isAdmin: boolean;
  isAdminResolved: boolean;
  phase: AccountBootstrapPhase;
}

export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Normalize email for authentication without touching the password.
 * The password is returned by reference — never trimmed, cased, or encoded.
 */
export function asLoginCredentials(
  email: string,
  password: string,
): { email: string; password: string } {
  return {
    email: normalizeLoginEmail(email),
    password,
  };
}

export function isTimeoutError(error: unknown): boolean {
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return msg.toLowerCase().includes("timed out");
}

/**
 * Session-check timeout must not clobber an in-flight hydrate from
 * onAuthStateChange (INITIAL_SESSION often races getSession()).
 */
export function shouldKeepHydrateOnSessionCheckFailure(input: {
  hasUser: boolean;
  status: "idle" | "loading" | "authenticated" | "unauthenticated" | "error";
  isProfileLoaded: boolean;
  timedOut: boolean;
}): boolean {
  if (!input.hasUser) return false;
  if (input.status === "authenticated" || input.isProfileLoaded) return true;
  if (
    input.timedOut &&
    (input.status === "loading" || input.status === "idle")
  ) {
    return true;
  }
  return false;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const rec = error as { message?: unknown; code?: unknown };
    const parts = [rec.message, rec.code].filter(
      (part) => typeof part === "string" && part.trim().length > 0,
    );
    return parts.join(" ");
  }
  return "";
}

export function classifyAccountLoadFailure(error: unknown): AccountLoadFailureKind {
  const msg = errorText(error).toLowerCase();

  if (!msg) return "unknown";
  if (
    msg.includes("does not exist") ||
    msg.includes("could not find the") ||
    msg.includes("schema cache") ||
    msg.includes("pgrst204") ||
    msg.includes("pgrst202") ||
    msg.includes("42703") ||
    msg.includes("42p01")
  ) {
    return "schema_config_failure";
  }
  if (msg.includes("timed out")) return "timeout";
  if (
    msg.includes("invalid login credentials") ||
    msg.includes("invalid_credentials") ||
    (msg.includes("invalid_grant") && !msg.includes("refresh token"))
  ) {
    return "invalid_credentials";
  }
  if (
    msg.includes("refresh token") ||
    msg.includes("jwt expired") ||
    msg.includes("session expired") ||
    msg.includes("invalid_grant")
  ) {
    return "expired_session";
  }
  if (msg.includes("banned") || msg.includes("suspended") || msg.includes("disabled")) {
    return "restricted_account";
  }
  if (msg.includes("profile not found") || msg.includes("missing profile")) {
    return "missing_profile";
  }
  if (msg.includes("missing role") || msg.includes("role not found")) {
    return "missing_role";
  }
  if (
    msg.includes("role") &&
    (msg.includes("fail") || msg.includes("denied") || msg.includes("query"))
  ) {
    return "role_query_failure";
  }
  if (
    msg.includes("profile") &&
    (msg.includes("fail") || msg.includes("denied") || msg.includes("query"))
  ) {
    return "profile_query_failure";
  }
  if (
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("load failed") ||
    msg.includes("networkerror")
  ) {
    return "network_failure";
  }
  if (
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("auth server") ||
    msg.includes("internal server")
  ) {
    return "auth_server_failure";
  }
  return "unknown";
}

export function userFacingAccountError(kind: AccountLoadFailureKind): string {
  switch (kind) {
    case "invalid_credentials":
      return AUTH_INVALID_CREDENTIALS_MESSAGE;
    case "expired_session":
      return AUTH_SESSION_EXPIRED_MESSAGE;
    case "restricted_account":
      return "Your account has been suspended. Contact support if you need help.";
    case "network_failure":
      return AUTH_NETWORK_FAILURE_MESSAGE;
    case "auth_server_failure":
      return AUTH_SERVER_FAILURE_MESSAGE;
    case "schema_config_failure":
    case "missing_profile":
    case "profile_query_failure":
    case "missing_role":
    case "role_query_failure":
    case "timeout":
    case "unknown":
    default:
      return AUTH_ACCOUNT_FRIENDLY_ERROR;
  }
}

export function deriveAccountPhase(input: {
  status: "idle" | "loading" | "authenticated" | "unauthenticated" | "error";
  hasUser: boolean;
  isProfileLoaded: boolean;
}): AccountPhase {
  if (input.status === "unauthenticated") return "UNAUTHENTICATED";
  if (input.status === "error") return "RECOVERY_REQUIRED";
  if (input.status === "authenticated") {
    return input.isProfileLoaded ? "READY" : "ACCOUNT_LOADING";
  }
  if (input.status === "idle" || input.status === "loading") {
    if (input.hasUser) return "ACCOUNT_LOADING";
    return "INITIALIZING";
  }
  return "INITIALIZING";
}

/**
 * Decide whether an onAuthStateChange event should start profile/role loading.
 * TOKEN_REFRESHED never reloads the account. SIGNED_IN during an in-flight
 * password login is owned by signInWithEmail.
 */
export function shouldLoadAccountOnAuthEvent(opts: {
  event: string;
  signingIn: boolean;
  alreadyReadyForUser: boolean;
  sameAccessToken: boolean;
}): boolean {
  if (opts.event === "TOKEN_REFRESHED") return false;
  if (opts.event === "SIGNED_OUT") return false;
  if (opts.event === "PASSWORD_RECOVERY") return false;
  if (opts.event === "USER_UPDATED") {
    return !opts.alreadyReadyForUser;
  }
  if (opts.event === "SIGNED_IN") {
    if (opts.signingIn) return false;
    if (opts.sameAccessToken && opts.alreadyReadyForUser) return false;
    return true;
  }
  if (opts.event === "INITIAL_SESSION") {
    if (opts.signingIn) return false;
    return !opts.alreadyReadyForUser;
  }
  return false;
}

export function shouldDetectSessionInUrl(input?: {
  pathname?: string;
  search?: string;
  hash?: string;
}): boolean {
  const pathname =
    input?.pathname ??
    (typeof window !== "undefined" ? window.location.pathname : "");
  const search =
    input?.search ??
    (typeof window !== "undefined" ? window.location.search : "");
  const hash =
    input?.hash ?? (typeof window !== "undefined" ? window.location.hash : "");
  const combined = `${pathname}${search}${hash}`;
  if (
    combined.includes("/auth/callback") ||
    combined.includes("/reset-password")
  ) {
    return true;
  }
  return /(?:[?&#])(code|access_token)=/.test(combined);
}

/**
 * Race a promise against a timeout. Clears the timer when the promise settles
 * so tests and long sessions do not leak timers.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
  options?: { signal?: AbortSignal; onTimeout?: () => void },
): Promise<T> {
  const signal = options?.signal;
  if (signal?.aborted) {
    return Promise.reject(new DOMException(`${label} cancelled`, "AbortError"));
  }

  let timer: ReturnType<typeof setTimeout> | undefined;

  return new Promise<T>((resolve, reject) => {
    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException(`${label} cancelled`, "AbortError"));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => {
      cleanup();
      options?.onTimeout?.();
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`));
    }, ms);

    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

/**
 * Share one in-flight promise per key. Concurrent callers await the same work.
 */
export function createInFlightMap<T>() {
  const map = new Map<string, Promise<T>>();

  return {
    run(key: string, factory: () => Promise<T>): Promise<T> {
      const existing = map.get(key);
      if (existing) return existing;
      const promise = factory().finally(() => {
        if (map.get(key) === promise) map.delete(key);
      });
      map.set(key, promise);
      return promise;
    },
    has(key: string): boolean {
      return map.has(key);
    },
    clear(): void {
      map.clear();
    },
  };
}

export function buildResolvedAccountContext(input: {
  userId: string;
  email?: string | null;
  planId?: string | null;
  credits?: number | null;
  isOnboarded?: boolean;
  isBanned?: boolean;
  isAdmin?: boolean;
  isAdminResolved?: boolean;
  phase?: AccountBootstrapPhase;
}): ResolvedAccountContext {
  return {
    userId: input.userId,
    email: input.email ?? null,
    planId: input.planId?.trim() || "free",
    credits: typeof input.credits === "number" ? input.credits : 0,
    isOnboarded: Boolean(input.isOnboarded),
    isBanned: Boolean(input.isBanned),
    isAdmin: Boolean(input.isAdmin),
    isAdminResolved: Boolean(input.isAdminResolved),
    phase: input.phase ?? "resolved",
  };
}

/** Soft profile revalidation should skip when a fresh cache hit exists. */
export function shouldSkipSoftProfileRefresh(opts: {
  userId: string;
  cacheUserId: string | null;
  cachedAt: number | null;
  ttlMs: number;
  nowMs?: number;
}): boolean {
  if (!opts.cacheUserId || opts.cachedAt == null) return false;
  if (opts.cacheUserId !== opts.userId) return false;
  const now = opts.nowMs ?? Date.now();
  return now - opts.cachedAt < opts.ttlMs;
}

export function canRetryAccountRecovery(attempts: number): boolean {
  return attempts < MAX_ACCOUNT_RECOVERY_ATTEMPTS;
}
