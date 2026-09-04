// src/store/authStore.ts
//
// Single source of truth for auth state.
//
// SECURITY PURPOSE:
// - Centralize auth/session/profile state
// - Avoid duplicate auth listeners
// - Avoid persisting JWT/session/user data in Zustand storage
// - Keep role/plan/credits DB-derived, not localStorage-derived
// - BYOK is removed — server-managed AI credentials only
//
// Compatibility fields:
// - isLoading
// - isAuthenticated
// - clearAuth()
// - setProfile()
// - setUser()
// - setIsLoading()
// - updateProfile()

import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import posthog from "posthog-js";

import { supabase } from "@/lib/supabase/client";
import { readCachedAuthSession } from "@/lib/supabase/sessionCache";
import { profilesDB, userRolesDB } from "@/lib/supabase/database";
import { useOverlayStore } from "@/store/overlayStore";
import { normalizePreferredModel } from "@/lib/ai/modelOptions";
import { ACCOUNT_SUSPENDED_MESSAGE, isAccountSuspendedAuthError } from "@/lib/errors";
import { classifyLoginFailure } from "@/lib/auth/loginFailure";
import { isOAuthProviderEnabled } from "@/lib/auth/oauthProviders";
import { isElectronApp } from "@/lib/platform/isElectron";
import { clearBYOKVault } from "@/lib/security/byokVault";
import { logger, LogEvents } from "@/lib/logger";
import { syncPrivacyPrefsFromProfile } from "@/lib/privacy/privacyPrefs";
import { clearStoredRefCode, normalizeRefCode } from "@/lib/referrals";
import {
  isSignupAlreadyRegisteredResponse,
  signupAlreadyRegisteredError,
} from "@/lib/auth/signupOutcome";
import { resetTransientOverlaySessionStores } from "@/lib/session/resetOverlaySessionStores";
import {
  classifyUnexpectedSignedOut,
  hasRecentLogoutBroadcast,
  isInvalidRefreshTokenError,
  isNonRetryableAuthError,
  isSchemaConfigError,
  markExplicitLogoutBroadcast,
  redirectAfterCrossTabSignOut,
  redirectToSessionExpiredLogin,
  subscribeCrossTabLogoutBroadcast,
  SESSION_EXPIRED_MESSAGE,
  SIGNED_OUT_ELSEWHERE_MESSAGE,
  SIGNED_OUT_ELSEWHERE_REASON,
} from "@/lib/auth/sessionErrors";
import { authAbsoluteUrl } from "@/lib/auth/appOrigin";
import { isUserEmailConfirmed } from "@/lib/auth/emailVerification";
import { buildOAuthCallbackUrl } from "@/lib/auth/oauthCallbackUrl";
import {
  clearTabLocalLogout,
  isTabLocalLogout,
  softClearTabSession,
} from "@/lib/auth/tabLocalLogout";
import {
  AUTH_ACCOUNT_FRIENDLY_ERROR,
  AUTH_SESSION_TIMEOUT_MS_ELECTRON,
  AUTH_SESSION_TIMEOUT_MS_WEB,
  PROFILE_COLD_RETRY_DELAY_MS,
  PROFILE_FETCH_TIMEOUT_MS,
  ROLE_CHECK_TIMEOUT_MS,
  asLoginCredentials,
  canRetryAccountRecovery,
  classifyAccountLoadFailure,
  createInFlightMap,
  deriveAccountPhase,
  isTimeoutError,
  shouldKeepHydrateOnSessionCheckFailure,
  shouldLoadAccountOnAuthEvent,
  shouldSkipSoftProfileRefresh,
  userFacingAccountError,
  withTimeout,
  type AccountPhase,
} from "@/lib/auth/accountBootstrap";
import { ensureSupabaseWarmed } from "@/lib/supabase/ensureWarmed";
import type {
  SupabaseSession,
  SupabaseUser,
  ProfileRow,
  AuthProvider,
} from "@/types";

export type AuthStatus =
  | "idle"
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "error";

export type { AccountPhase };

export type LoadProfileOptions = {
  /** Bypass cache and fetch even if a recent profile exists. */
  force?: boolean;
  /** Revalidate without flipping the shell into an initial-loading state. */
  background?: boolean;
};

const AUTH_SESSION_TIMEOUT_MS = isElectronApp()
  ? AUTH_SESSION_TIMEOUT_MS_ELECTRON
  : AUTH_SESSION_TIMEOUT_MS_WEB;

const PROFILE_ERROR_MESSAGE = AUTH_ACCOUNT_FRIENDLY_ERROR;

const roleInFlight = createInFlightMap<{ resolved: boolean; isAdmin: boolean; isModerator: boolean }>();

/**
 * Resolve admin role with one retry on timeout/network failure.
 * Non-retryable auth errors fail closed (not admin, resolved).
 * After a failed retry, fail closed so Free-user routes are never blocked;
 * admin routes can Retry. Privileged access is always server-enforced.
 */
async function resolveAdminRole(
  userId: string
): Promise<{ resolved: boolean; isAdmin: boolean; isModerator: boolean }> {
  return roleInFlight.run(userId, async () => {
    const startedAt = Date.now();
    logger.info(LogEvents.AUTH_ROLE_LOAD_STARTED, {
      operation: "role.load",
      attempt: 1,
    });

    await ensureSupabaseWarmed();

    const attempt = () =>
      withTimeout(
        userRolesDB.hasRole(userId, "admin"),
        ROLE_CHECK_TIMEOUT_MS,
        "Role check",
      );

    try {
      const isAdmin = await attempt();
      let isModerator = false;
      if (isAdmin) {
        isModerator = true;
      } else {
        try {
          isModerator = await withTimeout(
            userRolesDB.hasRole(userId, "moderator"),
            ROLE_CHECK_TIMEOUT_MS,
            "Moderator role check",
          );
        } catch {
          isModerator = false;
        }
      }
      logger.info(LogEvents.AUTH_ROLE_LOAD_SUCCEEDED, {
        operation: "role.load",
        attempt: 1,
        durationMs: Date.now() - startedAt,
        outcome: "succeeded",
        authState: isAdmin ? "admin" : isModerator ? "moderator" : "non_admin",
      });
      return { resolved: true, isAdmin, isModerator };
    } catch (err) {
      if (isNonRetryableAuthError(err)) {
        const schemaErr = isSchemaConfigError(err);
        logger.warn(LogEvents.AUTH_ROLE_LOAD_FAILED, {
          operation: "role.load",
          attempt: 1,
          durationMs: Date.now() - startedAt,
          outcome: "failed",
          retryable: false,
          recoveryAction: schemaErr ? "schema_config_error" : "fail_closed",
          diagnosticCode: schemaErr ? "ROLE_SCHEMA_ERROR" : undefined,
        });
        console.warn(
          "[authStore] Admin role check: non-retryable auth error",
          getErrorMessage(err),
        );
        return { resolved: true, isAdmin: false, isModerator: false };
      }
      if (isTimeoutError(err)) {
        logger.warn(LogEvents.AUTH_ROLE_LOAD_TIMED_OUT, {
          operation: "role.load",
          attempt: 1,
          durationMs: Date.now() - startedAt,
          outcome: "timed_out",
          retryable: true,
        });
      } else {
        logger.warn(LogEvents.NETWORK_RETRY, {
          operation: "role.load",
          attempt: 1,
          retryable: true,
        });
      }
      console.warn("[authStore] Admin role check failed; retrying once:", err);
      try {
        const isAdmin = await attempt();
        let isModerator = false;
        if (isAdmin) {
          isModerator = true;
        } else {
          try {
            isModerator = await withTimeout(
              userRolesDB.hasRole(userId, "moderator"),
              ROLE_CHECK_TIMEOUT_MS,
              "Moderator role check",
            );
          } catch {
            isModerator = false;
          }
        }
        logger.info(LogEvents.AUTH_ROLE_LOAD_SUCCEEDED, {
          operation: "role.load",
          attempt: 2,
          durationMs: Date.now() - startedAt,
          outcome: "succeeded",
          authState: isAdmin ? "admin" : isModerator ? "moderator" : "non_admin",
        });
        return { resolved: true, isAdmin, isModerator };
      } catch (retryErr) {
        const retryTimedOut = isTimeoutError(retryErr);
        const schemaErr = isSchemaConfigError(retryErr);
        logger.error(
          retryTimedOut
            ? LogEvents.AUTH_ROLE_LOAD_TIMED_OUT
            : LogEvents.AUTH_ROLE_LOAD_FAILED,
          {
            operation: "role.load",
            attempt: 2,
            durationMs: Date.now() - startedAt,
            outcome: retryTimedOut ? "timed_out" : "failed",
            retryable: false,
            recoveryAction: schemaErr ? "schema_config_error" : "fail_closed",
            diagnosticCode: schemaErr ? "ROLE_SCHEMA_ERROR" : undefined,
          },
        );
        console.warn(
          "[authStore] Admin role check retry failed; failing closed (non-admin):",
          retryErr,
        );
        return { resolved: true, isAdmin: false, isModerator: false };
      }
    }
  });
}

export interface AuthState {
  status: AuthStatus;
  accountPhase: AccountPhase;
  session: SupabaseSession | null;
  user: SupabaseUser | null;
  profile: ProfileRow | null;
  isProfileLoaded: boolean;
  error: string | null;
  isAdmin: boolean;
  isModerator: boolean;
  /** True only after a successful user_roles read (admin or not). Abort/timeout leave this false. */
  isAdminResolved: boolean;
  isOnboarded: boolean;
  planId: string;
  credits: number;
  recoveryAttempts: number;

  // Derived and synced through dset()
  isLoading: boolean;
  isAuthenticated: boolean;
}

export interface AuthActions {
  initialize: () => Promise<void>;

  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (
    email: string,
    password: string,
    fullName: string,
    referralCode?: string | null,
  ) => Promise<void>;
  signInWithOAuth: (provider: AuthProvider) => Promise<void>;
  signOut: () => Promise<void>;
  clearAuth: () => Promise<void>;

  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;

  loadProfile: (options?: LoadProfileOptions) => Promise<boolean>;
  retryAccountLoad: () => Promise<boolean>;
  updateProfile: (updates: Partial<ProfileRow>) => Promise<void>;
  setProfile: (profile: ProfileRow | null) => void;
  refreshCredits: () => Promise<void>;

  setUser: (user: SupabaseUser | null) => void;
  setSession: (session: SupabaseSession | null) => void;
  setError: (error: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  reset: () => void;
}

export type AuthStore = AuthState & AuthActions;

function buildInitialAuthState(): AuthState {
  const cached = readCachedAuthSession();

  if (cached) {
    return {
      status: "loading",
      accountPhase: "ACCOUNT_LOADING",
      session: cached.session as unknown as SupabaseSession,
      user: cached.user as unknown as SupabaseUser,
      profile: null,
      isProfileLoaded: false,
      error: null,
      isAdmin: false,
      isModerator: false,
      isAdminResolved: false,
      isOnboarded: false,
      planId: "free",
      credits: 0,
      recoveryAttempts: 0,
      isLoading: true,
      isAuthenticated: false,
    };
  }

  return {
    status: "loading",
    accountPhase: "INITIALIZING",
    session: null,
    user: null,
    profile: null,
    isProfileLoaded: false,
    error: null,
    isAdmin: false,
    isModerator: false,
    isAdminResolved: false,
    isOnboarded: false,
    planId: "free",
    credits: 0,
    recoveryAttempts: 0,
    isLoading: true,
    isAuthenticated: false,
  };
}

const INITIAL_STATE: AuthState = buildInitialAuthState();

let unsubAuthListener: (() => void) | null = null;

/**
 * Prevents concurrent initialize() calls.
 * React StrictMode mounts → unmounts → mounts in development which can
 * fire the useEffect twice before the first run completes. This flag
 * ensures only one bootstrap sequence runs at a time.
 */
let _bootstrapping = false;

/** Dedupes concurrent profile loads for the same user. */
let inFlightProfileLoad: {
  userId: string;
  promise: Promise<boolean>;
  abort: AbortController;
} | null = null;
let inFlightCreditsRefresh: Promise<void> | null = null;
let profileLoadGeneration = 0;

/** Dedupes concurrent email/password sign-in attempts. */
let inFlightSignIn: Promise<void> | null = null;

/**
 * True while signInWithEmail owns profile loading. SIGNED_IN from GoTrue must
 * not start a second account initialization.
 */
let _signingIn = false;

/** Ignore SIGNED_OUT while we locally clear a stale session before password grant. */
let _ignoreSignedOut = false;

/** Ignore SIGNED_OUT while this tab owns an explicit Log out click. */
let _explicitLogoutInProgress = false;

/** Access token already hydrated into account context — skip duplicate SIGNED_IN. */
let _hydratedAccessToken: string | null = null;

const PROFILE_CACHE_TTL_MS = 30_000;
const BACKGROUND_PROFILE_TTL_MS = 120_000;
let profileCache: { userId: string; profile: ProfileRow; cachedAt: number } | null = null;

/** One quiet background revalidate after soft-timeout keep — cleared on success. */
let softFailBackgroundRevalidateScheduled = false;

/**
 * Budgets session-check soft-keeps per bootstrap so hung hydrates cannot
 * soft-loop forever on private routes.
 */
let sessionCheckSoftKeepCount = 0;

function sleepMs(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("aborted"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error("aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function clearProfileLoadState(): void {
  inFlightProfileLoad = null;
  inFlightCreditsRefresh = null;
  profileCache = null;
  profileLoadGeneration += 1;
  roleInFlight.clear();
  _hydratedAccessToken = null;
}

export function getProfileCacheAgeMs(now = Date.now()): number | null {
  if (!profileCache) return null;
  return Math.max(0, now - profileCache.cachedAt);
}

/** Apply role flags without blocking profile resolution. */
function applyAdminRoleResult(
  userId: string,
  roleResult: { resolved: boolean; isAdmin: boolean; isModerator: boolean },
  set: (fn: (state: AuthStore) => void) => void,
  get: () => AuthStore,
): void {
  if (!roleResult.resolved) return;
  if (get().user?.id !== userId) return;
  set((state) => {
    state.isAdmin = roleResult.isAdmin;
    state.isModerator = roleResult.isModerator;
    state.isAdminResolved = true;
  });
}

/** Kick off (or join) the shared role load — never awaited by Free-user routing. */
function scheduleAdminRoleResolve(
  userId: string,
  set: (fn: (state: AuthStore) => void) => void,
  get: () => AuthStore,
): void {
  void resolveAdminRole(userId).then((roleResult) => {
    applyAdminRoleResult(userId, roleResult, set, get);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab-local logout (independent tabs)
//
// Logout clears auth UI state for THIS tab only (sessionStorage flag) and does
// not remove the shared Supabase localStorage session, so other open tabs keep
// working. Opening a new tab still inherits the shared login.
// ─────────────────────────────────────────────────────────────────────────────

async function clearStaleLocalSession(): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Best-effort: server session may already be gone.
  }
  logger.info(LogEvents.AUTH_SESSION_CLEARED, {
    operation: "session.clear",
    recoveryAction: "clear_stale_session",
    outcome: "succeeded",
  });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return "Something went wrong.";
}

function isPostHogEnabled(): boolean {
  return Boolean(import.meta.env.VITE_POSTHOG_KEY);
}

function identifyPostHogUser(user: SupabaseUser): void {
  if (!isPostHogEnabled()) {
    return;
  }

  try {
    posthog.identify(user.id, {
      email: user.email,
    });
  } catch {
    // PostHog may be unavailable in development or blocked by browser privacy tools.
  }
}

function resetPostHog(): void {
  if (!isPostHogEnabled()) {
    return;
  }

  try {
    posthog.reset();
  } catch {
    // Ignore PostHog reset failures.
  }
}

function getProfileBoolean(
  row: Record<string, unknown>,
  key: string,
  fallback = false
): boolean {
  const value = row[key];

  return typeof value === "boolean" ? value : fallback;
}

function getProfileString(
  row: Record<string, unknown>,
  key: string,
  fallback: string
): string {
  const value = row[key];

  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback;
}

function getProfileNumber(
  row: Record<string, unknown>,
  key: string,
  fallback: number
): number {
  const value = row[key];

  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function syncOverlayFromProfile(row: Record<string, unknown>): void {
  try {
    const overlay = useOverlayStore.getState();

    const opacity = row.overlay_opacity;

    if (typeof opacity === "number" && Number.isFinite(opacity)) {
      overlay.setStealthOpacity(opacity);
    }

    const position = row.overlay_position;

    if (typeof position === "string" && position.trim().length > 0) {
      const parsed = JSON.parse(position) as {
        x?: unknown;
        y?: unknown;
      };

      if (
        typeof parsed.x === "number" &&
        Number.isFinite(parsed.x) &&
        typeof parsed.y === "number" &&
        Number.isFinite(parsed.y)
      ) {
        overlay.setPosition({
          x: parsed.x,
          y: parsed.y,
        });
      }
    }
  } catch {
    // Overlay store or saved position may be unavailable/invalid.
  }
}

export const useAuthStore = create<AuthStore>()(
  devtools(
    persist(
      immer((set, get) => {
        const dset = (recipe: (draft: AuthStore) => void) => {
          set((draft) => {
            recipe(draft);

            draft.accountPhase = deriveAccountPhase({
              status: draft.status,
              hasUser: Boolean(draft.user),
              isProfileLoaded: draft.isProfileLoaded,
            });
            draft.isLoading =
              draft.accountPhase === "INITIALIZING" ||
              draft.accountPhase === "ACCOUNT_LOADING";
            draft.isAuthenticated = draft.status === "authenticated";
          });
        };

        return {
          ...INITIAL_STATE,

          initialize: async () => {
            if (_bootstrapping) {
              logger.warn(LogEvents.BOOTSTRAP_DUPLICATE_PREVENTED, {
                operation: "initialize",
                outcome: "skipped",
              });
              console.warn("[authStore] initialize() called while already bootstrapping — skipped (StrictMode guard)");
              return;
            }
            _bootstrapping = true;
            sessionCheckSoftKeepCount = 0;
            logger.info(LogEvents.BOOTSTRAP_STARTED, {
              operation: "initialize",
            });

            if (get().status !== "authenticated" || !get().isProfileLoaded) {
              dset((state) => {
                state.status = "loading";
                state.error = null;
              });
            } else {
              dset((state) => {
                state.error = null;
              });
            }

            try {
              clearBYOKVault();
            } catch {
              // Ignore vault wipe failures.
            }

            const hydrateFromSession = async (
              session: { access_token?: string; user?: SupabaseUser } | null,
              event: string,
            ): Promise<void> => {
              if (!session?.user) {
                dset((state) => {
                  state.status = "unauthenticated";
                  state.session = null;
                  state.user = null;
                });
                return;
              }

              if (!isUserEmailConfirmed(session.user)) {
                await supabase.auth.signOut({ scope: "local" });
                dset((state) => {
                  state.status = "unauthenticated";
                  state.session = null;
                  state.user = null;
                  state.profile = null;
                  state.isProfileLoaded = false;
                });
                return;
              }

              dset((state) => {
                state.session = session as unknown as SupabaseSession;
                state.user = session.user as unknown as SupabaseUser;
              });

              const alreadyReady =
                get().isProfileLoaded && get().user?.id === session.user.id;
              const sameToken =
                Boolean(session.access_token) &&
                _hydratedAccessToken === session.access_token;

              if (
                !shouldLoadAccountOnAuthEvent({
                  event,
                  signingIn: _signingIn,
                  alreadyReadyForUser: alreadyReady,
                  sameAccessToken: sameToken,
                })
              ) {
                if (session.access_token) {
                  _hydratedAccessToken = session.access_token;
                }
                return;
              }

              const profileLoaded = await get().loadProfile();
              if (!profileLoaded) {
                return;
              }

              dset((state) => {
                state.status = "authenticated";
                state.recoveryAttempts = 0;
              });
              if (session.access_token) {
                _hydratedAccessToken = session.access_token;
              }
              identifyPostHogUser(session.user as unknown as SupabaseUser);
            };

            if (!unsubAuthListener) {
              let foreignSignOutHandled = false;
              const handleForeignSignOut = () => {
                if (
                  foreignSignOutHandled ||
                  _ignoreSignedOut ||
                  _explicitLogoutInProgress ||
                  _signingIn ||
                  isTabLocalLogout()
                ) {
                  return;
                }
                if (get().status === "unauthenticated" && !get().user) {
                  return;
                }
                foreignSignOutHandled = true;
                resetPostHog();
                get().reset();
                const signedOutReason = classifyUnexpectedSignedOut({
                  recentLogoutBroadcast: hasRecentLogoutBroadcast(),
                });
                dset((state) => {
                  state.error =
                    signedOutReason === SIGNED_OUT_ELSEWHERE_REASON
                      ? SIGNED_OUT_ELSEWHERE_MESSAGE
                      : SESSION_EXPIRED_MESSAGE;
                });
                if (signedOutReason === SIGNED_OUT_ELSEWHERE_REASON) {
                  redirectAfterCrossTabSignOut();
                } else {
                  redirectToSessionExpiredLogin();
                }
              };

              const { data } = supabase.auth.onAuthStateChange(
                async (event, session) => {
                  if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
                    foreignSignOutHandled = false;
                  }
                  if (event === "SIGNED_OUT") {
                    handleForeignSignOut();
                    return;
                  }

                  if (isTabLocalLogout()) {
                    if (session) {
                      void softClearTabSession(() =>
                        supabase.auth.signOut({ scope: "local" }),
                      );
                    }
                    return;
                  }

                  if (event === "TOKEN_REFRESHED" && session) {
                    dset((state) => {
                      state.session = session as unknown as SupabaseSession;
                    });
                    if (session.access_token) {
                      _hydratedAccessToken = session.access_token;
                    }
                    return;
                  }

                  if (event === "PASSWORD_RECOVERY" && session) {
                    try {
                      const { markPasswordRecoveryFlow } = await import(
                        "@/lib/auth/authDeepLinkRedirect"
                      );
                      markPasswordRecoveryFlow();
                      if (
                        typeof window !== "undefined" &&
                        !window.location.pathname.includes("reset-password")
                      ) {
                        const search = window.location.search;
                        const hash = window.location.hash;
                        window.location.replace(`/reset-password${search}${hash}`);
                        return;
                      }
                    } catch {
                      // continue with in-place recovery session
                    }
                    dset((state) => {
                      state.session = session as unknown as SupabaseSession;
                      state.user = session.user as unknown as SupabaseUser;
                      state.status = "authenticated";
                    });
                    return;
                  }

                  if (
                    event === "INITIAL_SESSION" ||
                    event === "SIGNED_IN" ||
                    event === "USER_UPDATED"
                  ) {
                    await hydrateFromSession(
                      session as {
                        access_token?: string;
                        user?: SupabaseUser;
                      } | null,
                      event,
                    );
                  }
                },
              );

              const unsubLogoutBroadcast = subscribeCrossTabLogoutBroadcast(() => {
                handleForeignSignOut();
              });

              unsubAuthListener = () => {
                data.subscription.unsubscribe();
                unsubLogoutBroadcast();
              };
            }

            try {
              if (isTabLocalLogout()) {
                resetPostHog();
                dset((state) => {
                  state.session = null;
                  state.user = null;
                  state.profile = null;
                  state.status = "unauthenticated";
                  state.error = null;
                });
                logger.info(LogEvents.BOOTSTRAP_COMPLETED, {
                  operation: "initialize",
                  authState: "tab_local_logout",
                  outcome: "succeeded",
                });
                void softClearTabSession(() =>
                  supabase.auth.signOut({ scope: "local" }),
                );
                return;
              }

              const cached = readCachedAuthSession();
              if (cached?.session?.user) {
                await hydrateFromSession(
                  cached.session as {
                    access_token?: string;
                    user?: SupabaseUser;
                  },
                  "INITIAL_SESSION",
                );
              }

              const {
                data: { session: initialSession },
                error,
              } = await withTimeout(
                supabase.auth.getSession(),
                AUTH_SESSION_TIMEOUT_MS,
                "Session check",
              );

              if (error) {
                throw error;
              }

              let session = initialSession;
              // getSession() can return a cached JWT past expires_at without
              // refreshing. Force refresh so revoked tokens fail closed.
              const expiresAtMs =
                typeof session?.expires_at === "number"
                  ? session.expires_at * 1000
                  : null;
              if (session && expiresAtMs != null && expiresAtMs <= Date.now()) {
                const refreshed = await withTimeout(
                  supabase.auth.refreshSession(),
                  AUTH_SESSION_TIMEOUT_MS,
                  "Session refresh",
                );
                if (refreshed.error) {
                  throw refreshed.error;
                }
                session = refreshed.data.session;
              }

              if (
                session?.user &&
                session.access_token !== cached?.session?.access_token
              ) {
                await hydrateFromSession(
                  session as {
                    access_token?: string;
                    user?: SupabaseUser;
                  },
                  "INITIAL_SESSION",
                );
              } else if (!cached?.session?.user) {
                await hydrateFromSession(
                  session as {
                    access_token?: string;
                    user?: SupabaseUser;
                  } | null,
                  "INITIAL_SESSION",
                );
              }

              logger.info(LogEvents.BOOTSTRAP_COMPLETED, {
                operation: "initialize",
                authState: session || cached?.session ? "authenticated" : "anonymous",
                outcome: "succeeded",
              });
              sessionCheckSoftKeepCount = 0;
            } catch (error) {
              if (isInvalidRefreshTokenError(error)) {
                logger.warn(LogEvents.AUTH_SESSION_RECOVERY_INVALID_TOKEN, {
                  outcome: "failed",
                  recoveryAction: "clear_stale_session",
                  retryable: false,
                });
                console.warn(
                  "[authStore] Stale refresh token detected — clearing local session and redirecting to login",
                );
                await clearStaleLocalSession();
                resetPostHog();
                get().reset();
                redirectToSessionExpiredLogin();
              } else if (get().isProfileLoaded && get().user) {
                // Session check timed out but profile is already available — finish READY.
                dset((state) => {
                  state.status = "authenticated";
                  state.error = null;
                });
                logger.warn(LogEvents.BOOTSTRAP_SESSION_SLOW, {
                  outcome: "timed_out",
                  operation: "session.check",
                  recoveryAction: "promote_authenticated_from_loaded_profile",
                  retryable: false,
                });
              } else if (
                shouldKeepHydrateOnSessionCheckFailure({
                  hasUser: Boolean(get().user),
                  status: get().status,
                  isProfileLoaded: get().isProfileLoaded,
                  timedOut: isTimeoutError(error),
                  softKeepCount: sessionCheckSoftKeepCount,
                })
              ) {
                sessionCheckSoftKeepCount += 1;
                logger.warn(LogEvents.BOOTSTRAP_SESSION_SLOW, {
                  outcome: "timed_out",
                  operation: "session.check",
                  recoveryAction: "keep_in_flight_hydrate",
                  retryable: true,
                });
              } else {
                const cachedOnError = readCachedAuthSession();
                if (cachedOnError?.session?.user && isTimeoutError(error)) {
                  logger.warn(LogEvents.BOOTSTRAP_SESSION_SLOW, {
                    outcome: "timed_out",
                    operation: "session.check",
                    recoveryAction: "cached_session",
                    retryable: true,
                  });
                  await hydrateFromSession(
                    cachedOnError.session as {
                      access_token?: string;
                      user?: SupabaseUser;
                    },
                    "INITIAL_SESSION",
                  );
                } else {
                  logger.error(LogEvents.BOOTSTRAP_FAILED, {
                    outcome: "failed",
                    operation: "session.check",
                  });
                  const kind = classifyAccountLoadFailure(error);
                  dset((state) => {
                    state.status = "error";
                    state.error = userFacingAccountError(kind);
                  });
                }
              }
            } finally {
              _bootstrapping = false;
            }
          },

          signInWithEmail: async (email, password) => {
            clearTabLocalLogout();
            if (inFlightSignIn) {
              return inFlightSignIn;
            }

            const run = async (): Promise<void> => {
            dset((state) => {
              state.status = "loading";
              state.error = null;
            });

            const credentials = asLoginCredentials(email, password);

            _signingIn = true;
            _ignoreSignedOut = true;
            try {
              try {
                // Drop a stale recovered session so password grant is the only
                // /auth/v1/token request. scope:local does not hit the server.
                await supabase.auth.signOut({ scope: "local" });
              } catch {
                // Best-effort — password grant still proceeds.
              }

            const { data, error } = await supabase.auth.signInWithPassword({
              email: credentials.email,
              password: credentials.password,
            });

            if (error) {
              const classified = classifyLoginFailure(error);
              dset((state) => {
                state.status = "unauthenticated";
                state.session = null;
                state.user = null;
                state.error = classified.message;
              });

              throw Object.assign(new Error(classified.message), {
                code: classified.code,
              });
            }

            if (!data.user || !isUserEmailConfirmed(data.user)) {
              try {
                await supabase.auth.signOut({ scope: "local" });
              } catch {
                // Best-effort — block protected routes without a verified JWT.
              }
              const classified = classifyLoginFailure({
                code: "email_not_confirmed",
                message: "Email not confirmed",
              });
              dset((state) => {
                state.status = "unauthenticated";
                state.session = null;
                state.user = null;
                state.profile = null;
                state.isProfileLoaded = false;
                state.error = classified.message;
              });
              throw Object.assign(new Error(classified.message), {
                code: classified.code,
              });
            }

            dset((state) => {
              state.session = data.session as unknown as SupabaseSession;
              state.user = data.user as unknown as SupabaseUser;
            });
            if (data.session?.access_token) {
              _hydratedAccessToken = data.session.access_token;
            }

            const profileLoaded = await get().loadProfile();

            if (!profileLoaded) {
              let banMessage: string | null = null;
              try {
                banMessage = sessionStorage.getItem("clarify_auth_ban_message");
                if (banMessage) sessionStorage.removeItem("clarify_auth_ban_message");
              } catch {
                // Ignore storage failures.
              }

              if (banMessage) {
                throw new Error(banMessage);
              }

              // Password grant already succeeded. Retry profile once before
              // failing the login form (slow Auth init must not look like a bad password).
              if (get().user) {
                const retried = await get().loadProfile({ force: true });
                if (retried) {
                  dset((state) => {
                    state.status = "authenticated";
                    state.recoveryAttempts = 0;
                    state.error = null;
                  });
                  return;
                }
              }

              throw new Error(get().error ?? PROFILE_ERROR_MESSAGE);
            }

            dset((state) => {
              state.status = "authenticated";
              state.recoveryAttempts = 0;
            });
            } finally {
              _signingIn = false;
              _ignoreSignedOut = false;
            }
            };

            inFlightSignIn = run().finally(() => {
              inFlightSignIn = null;
            });
            return inFlightSignIn;
          },

          signUpWithEmail: async (email, password, fullName, referralCode) => {
            clearTabLocalLogout();
            dset((state) => {
              state.status = "loading";
              state.error = null;
            });

            const normalizedEmail = email.trim().toLowerCase();
            const pendingReferral = normalizeRefCode(referralCode);

            const { data, error } = await supabase.auth.signUp({
              email: normalizedEmail,
              password,
              options: {
                data: {
                  full_name: fullName.trim(),
                  ...(pendingReferral
                    ? { pending_referral_code: pendingReferral }
                    : {}),
                },
                emailRedirectTo: authAbsoluteUrl("/auth/callback"),
              },
            });

            if (error) {
              dset((state) => {
                state.status = "error";
                state.error = error.message;
              });

              throw error;
            }

            if (isSignupAlreadyRegisteredResponse(data.user)) {
              const taken = signupAlreadyRegisteredError();
              dset((state) => {
                state.status = "error";
                state.error = taken.message;
                state.session = null;
                state.user = null;
                state.profile = null;
                state.isProfileLoaded = false;
              });
              throw taken;
            }

            if (data.session && data.user && isUserEmailConfirmed(data.user)) {
              dset((state) => {
                state.session = data.session as unknown as SupabaseSession;
                state.user = data.user as unknown as SupabaseUser;
                state.status = "authenticated";
              });

              const profileLoaded = await get().loadProfile();
              if (!profileLoaded) {
                throw new Error(get().error ?? "Failed to load your account profile.");
              }
            } else {
              if (data.session) {
                // Supabase may return a JWT before email confirmation — revoke locally so
                // protected routes and edge APIs cannot be used until the link is clicked.
                await supabase.auth.signOut({ scope: "local" });
              }
              dset((state) => {
                state.session = null;
                state.user = null;
                state.profile = null;
                state.isProfileLoaded = false;
                state.status = "unauthenticated";
              });
            }
          },

          signInWithOAuth: async (provider) => {
            clearTabLocalLogout();
            dset((state) => {
              state.status = "loading";
              state.error = null;
            });

            if (!isOAuthProviderEnabled(provider)) {
              const err = new Error("Unsupported OAuth provider.");
              dset((state) => {
                state.status = "error";
                state.error = err.message;
              });
              throw err;
            }

            const { error } = await supabase.auth.signInWithOAuth({
              provider: provider as any,
              options: {
                redirectTo: buildOAuthCallbackUrl(
                  typeof window !== "undefined" ? window.location.origin : null,
                ),
                scopes: provider === "google" ? "email profile" : undefined,
              },
            });

            if (error) {
              const classified = classifyLoginFailure(error);
              dset((state) => {
                state.status = "error";
                state.error = classified.message;
              });

              throw Object.assign(new Error(classified.message), {
                code: classified.code,
              });
            }
          },

          signOut: async () => {
            dset((state) => {
              state.status = "loading";
              state.error = null;
            });

            clearProfileLoadState();
            clearTabLocalLogout();
            markExplicitLogoutBroadcast();
            resetPostHog();
            try {
              clearStoredRefCode();
            } catch {
              // Ignore referral storage clear failure.
            }
            try {
              clearBYOKVault();
            } catch {
              // Ignore local vault clearing failure.
            }
            // Drop Live/Mock/audio session leftovers so the next account cannot
            // inherit transcript, hints, or capture clients from this tab.
            try {
              resetTransientOverlaySessionStores({
                hideOverlay: true,
                stopTts: true,
                releaseAuthority: true,
              });
            } catch {
              // Best-effort — auth sign-out must continue.
            }
            _explicitLogoutInProgress = true;
            _ignoreSignedOut = true;
            try {
              const { error } = await supabase.auth.signOut();
              if (error) {
                await supabase.auth.signOut({ scope: "local" });
              }
            } catch {
              try {
                await supabase.auth.signOut({ scope: "local" });
              } catch {
                // Best-effort local clear.
              }
            } finally {
              get().reset();
              // Keep suppressing foreign SIGNED_OUT until after the login redirect.
              const release = () => {
                _ignoreSignedOut = false;
                _explicitLogoutInProgress = false;
              };
              if (typeof window !== "undefined") {
                window.setTimeout(release, 0);
              } else {
                release();
              }
            }
          },

          clearAuth: async () => {
            await get().signOut();
          },

          sendPasswordReset: async (email) => {
            const redirectTo = authAbsoluteUrl("/reset-password");

            const { error } = await supabase.auth.resetPasswordForEmail(
              email.trim(),
              {
                redirectTo,
              },
            );

            if (error) {
              throw error;
            }
          },

          updatePassword: async (newPassword) => {
            const { error } = await supabase.auth.updateUser({
              password: newPassword,
            });

            if (error) {
              throw error;
            }
          },

          loadProfile: async (options) => {
            const userId = get().user?.id;

            if (!userId) {
              return false;
            }

            // Dedupe: initialize(), SIGNED_IN and route guards can all trigger a
            // load for the same user within the same tick.
            if (inFlightProfileLoad && inFlightProfileLoad.userId === userId) {
              return inFlightProfileLoad.promise;
            }
            if (inFlightProfileLoad && inFlightProfileLoad.userId !== userId) {
              inFlightProfileLoad.abort.abort();
              inFlightProfileLoad = null;
            }

            const ttlMs = options?.force
              ? 0
              : options?.background
                ? BACKGROUND_PROFILE_TTL_MS
                : PROFILE_CACHE_TTL_MS;
            const cached = profileCache;
            if (
              ttlMs > 0 &&
              shouldSkipSoftProfileRefresh({
                userId,
                cacheUserId: cached?.userId ?? null,
                cachedAt: cached?.cachedAt ?? null,
                ttlMs,
              }) &&
              get().isProfileLoaded &&
              get().profile
            ) {
              if (!get().isAdminResolved && !options?.background) {
                scheduleAdminRoleResolve(userId, set, get);
              }
              return true;
            }

            // Surface loading UI when recovering from a prior error state.
            // Background revalidation must keep the current Dashboard visible.
            if (get().status === "error" && !options?.background) {
              set((state) => {
                state.status = "loading";
                state.error = null;
                state.isLoading = true;
              });
            }

            const abort = new AbortController();
            const run = async (): Promise<boolean> => {
            const generation = ++profileLoadGeneration;
            const profileStartedAt = Date.now();
            const correlationId = crypto.randomUUID();
            // Soft-fail recovery: tab focus / TOKEN_REFRESHED must not wipe a
            // working session when a transient profile refetch fails.
            const hadLoadedProfile =
              get().isProfileLoaded && Boolean(get().profile);
            const priorStatus = get().status;

            logger.info(LogEvents.AUTH_PROFILE_LOAD_STARTED, {
              operation: "profile.load",
              attempt: 1,
              correlationId,
            });

            const fetchProfile = () => {
              const attemptAbort = new AbortController();
              const onParentAbort = () => attemptAbort.abort();
              abort.signal.addEventListener("abort", onParentAbort);
              return withTimeout(
                profilesDB.getByIdMaybe(userId, { signal: attemptAbort.signal }),
                PROFILE_FETCH_TIMEOUT_MS,
                "Profile load",
                {
                  signal: attemptAbort.signal,
                  onTimeout: () => attemptAbort.abort(),
                },
              ).finally(() => {
                abort.signal.removeEventListener("abort", onParentAbort);
              });
            };

            try {
              let profile: Awaited<ReturnType<typeof profilesDB.getByIdMaybe>>;

              await ensureSupabaseWarmed();

              try {
                profile = await fetchProfile();
              } catch (firstErr) {
                if (abort.signal.aborted) {
                  throw firstErr;
                }
                // Non-retryable auth errors must not be retried — they will fail
                // immediately again and waste another PROFILE_FETCH_TIMEOUT_MS.
                if (isNonRetryableAuthError(firstErr)) {
                  throw firstErr;
                }
                const timedOut = isTimeoutError(firstErr);
                if (timedOut) {
                  logger.warn(LogEvents.AUTH_PROFILE_LOAD_TIMED_OUT, {
                    operation: "profile.load",
                    attempt: 1,
                    durationMs: Date.now() - profileStartedAt,
                    outcome: "timed_out",
                    retryable: true,
                  });
                } else {
                  logger.warn(LogEvents.NETWORK_RETRY, {
                    operation: "profile.load",
                    attempt: 1,
                    retryable: true,
                  });
                }
                console.warn(
                  "[authStore] Profile load failed; retrying once:",
                  firstErr,
                );
                // Cold PostgREST often needs a pause between back-to-back 15s budgets.
                if (timedOut) {
                  const delayMs =
                    import.meta.env.MODE === "test" ? 0 : PROFILE_COLD_RETRY_DELAY_MS;
                  try {
                    await sleepMs(delayMs, abort.signal);
                  } catch {
                    throw firstErr;
                  }
                }
                try {
                  profile = await fetchProfile();
                } catch (secondErr) {
                  throw secondErr;
                }
              }

              if (!profile) {
                // Orphan auth users (trigger miss / deleted row): repair once.
                logger.warn(LogEvents.AUTH_PROFILE_LOAD_FAILED, {
                  operation: "profile.ensure",
                  outcome: "failed",
                  recoveryAction: "upsert_missing_profile",
                  retryable: true,
                });
                console.warn(
                  "[authStore] Profile not found — ensuring profile row for authenticated user",
                );
                try {
                  const meta = (get().user?.user_metadata ?? {}) as Record<
                    string,
                    unknown
                  >;
                  const email = get().user?.email ?? "";
                  const fullName =
                    (typeof meta.full_name === "string" && meta.full_name) ||
                    (typeof meta.name === "string" && meta.name) ||
                    (email.includes("@") ? email.split("@")[0] : "User");
                  const avatarUrl =
                    typeof meta.avatar_url === "string"
                      ? meta.avatar_url
                      : typeof meta.picture === "string"
                        ? meta.picture
                        : null;

                  profile = await withTimeout(
                    profilesDB.upsert({
                      id: userId,
                      email,
                      full_name: fullName,
                      avatar_url: avatarUrl,
                      onboarding_completed: false,
                    } as Parameters<typeof profilesDB.upsert>[0]),
                    PROFILE_FETCH_TIMEOUT_MS,
                    "Profile ensure",
                    { signal: abort.signal },
                  );
                } catch (ensureErr) {
                  logger.error(LogEvents.AUTH_PROFILE_LOAD_FAILED, {
                    operation: "profile.ensure",
                    outcome: "failed",
                    retryable: false,
                  });
                  throw ensureErr;
                }
              }

              if (!profile) {
                throw new Error(PROFILE_ERROR_MESSAGE);
              }

              const row = profile as unknown as Record<string, unknown>;

              // Ban enforcement: clear the session so banned JWTs cannot linger.
              // ProtectedRoute also blocks if profile is present with is_banned.
              if (getProfileBoolean(row, "is_banned", false)) {
                console.warn("[authStore] Banned account detected — signing out");
                try {
                  sessionStorage.setItem(
                    "clarify_auth_ban_message",
                    ACCOUNT_SUSPENDED_MESSAGE
                  );
                } catch {
                  // Ignore storage failures.
                }
                await get().signOut();
                return false;
              }

              if (get().user?.id !== userId) {
                return false;
              }
              if (generation !== profileLoadGeneration) {
                return hadLoadedProfile;
              }

              profileCache = {
                userId,
                profile: profile as unknown as ProfileRow,
                cachedAt: Date.now(),
              };

              set((state) => {
                if (get().user?.id !== userId) return;
                state.profile = profile as unknown as ProfileRow;
                state.isProfileLoaded = true;
                // Profile success must leave loading — retry/soft-keep can otherwise
                // leave status=loading forever and trap ProtectedRoute on BrandSplash.
                if (state.user) state.status = "authenticated";

                state.error = null;
                state.isOnboarded = getProfileBoolean(
                  row,
                  "onboarding_completed",
                  false
                );
                state.planId = getProfileString(row, "plan_id", "free");
                state.credits = getProfileNumber(row, "credits", 0);
              });

              // Admin/moderator come from user_roles via RPC — never profiles.is_admin.
              if (!(options?.background && get().isAdminResolved)) {
                scheduleAdminRoleResolve(userId, set, get);
              }

              syncOverlayFromProfile(row);
              syncPrivacyPrefsFromProfile(row.privacy_prefs);
              softFailBackgroundRevalidateScheduled = false;
              logger.info(LogEvents.AUTH_PROFILE_LOAD_SUCCEEDED, {
                operation: "profile.load",
                durationMs: Date.now() - profileStartedAt,
                outcome: "succeeded",
                correlationId,
              });
              return true;
            } catch (err) {
              if (
                abort.signal.aborted ||
                generation !== profileLoadGeneration ||
                get().user?.id !== userId
              ) {
                return hadLoadedProfile;
              }
              console.error("[authStore] Failed to load profile:", err);

              // A dead refresh token is an auth failure, not a profile failure:
              // clear it locally instead of parking the user on an error screen.
              if (isInvalidRefreshTokenError(err)) {
                logger.warn(LogEvents.AUTH_SESSION_RECOVERY_INVALID_TOKEN, {
                  operation: "profile.load",
                  outcome: "failed",
                  recoveryAction: "clear_stale_session",
                  retryable: false,
                });
                await clearStaleLocalSession();
                resetPostHog();
                get().reset();
                redirectToSessionExpiredLogin();
                return false;
              }

              // Banned / Auth-disabled accounts often surface as opaque schema errors
              // from the token or profile path — never show SQL to the user.
              if (isAccountSuspendedAuthError(err)) {
                try {
                  sessionStorage.setItem(
                    "clarify_auth_ban_message",
                    ACCOUNT_SUSPENDED_MESSAGE,
                  );
                } catch {
                  // Ignore storage failures.
                }
                await get().signOut();
                return false;
              }

              const timedOut = isTimeoutError(err);
              const kind = classifyAccountLoadFailure(err);

              // Tab switches / token refresh often re-fetch the profile. A
              // transient failure must not replace a working session with the
              // "couldn't load your account" full-page error.
              const stale = profileCache?.userId === userId ? profileCache.profile : null;
              if (
                (hadLoadedProfile || stale) &&
                priorStatus === "authenticated" &&
                !isNonRetryableAuthError(err)
              ) {
                if (stale && !get().profile) {
                  set((state) => {
                    state.profile = stale;
                    state.isProfileLoaded = true;
                    state.status = "authenticated";
                    state.error = null;
                  });
                }
                logger.warn(
                  timedOut
                    ? LogEvents.AUTH_PROFILE_LOAD_TIMED_OUT
                    : LogEvents.AUTH_PROFILE_LOAD_FAILED,
                  {
                    operation: "profile.load",
                    durationMs: Date.now() - profileStartedAt,
                    outcome: timedOut ? "timed_out" : "failed",
                    recoveryAction: "keep_cached_profile",
                    retryable: true,
                  },
                );
                dset((state) => {
                  state.status = "authenticated";
                  state.error = null;
                  state.isProfileLoaded = true;
                });
                // Soft-keep must not leave staff routes stuck without a role resolve.
                if (!get().isAdminResolved) {
                  scheduleAdminRoleResolve(userId, set, get);
                }
                // Quiet recovery — one background force refresh after soft timeout.
                if (
                  !options?.background &&
                  !softFailBackgroundRevalidateScheduled
                ) {
                  softFailBackgroundRevalidateScheduled = true;
                  const delayMs =
                    import.meta.env.MODE === "test" ? 0 : PROFILE_COLD_RETRY_DELAY_MS;
                  globalThis.setTimeout(() => {
                    if (get().user?.id !== userId) {
                      softFailBackgroundRevalidateScheduled = false;
                      return;
                    }
                    void get().loadProfile({ force: true, background: true });
                  }, delayMs);
                }
                return true;
              }

              logger.error(
                timedOut
                  ? LogEvents.AUTH_PROFILE_LOAD_TIMED_OUT
                  : LogEvents.AUTH_PROFILE_LOAD_FAILED,
                {
                  operation: "profile.load",
                  durationMs: Date.now() - profileStartedAt,
                  outcome: timedOut ? "timed_out" : "failed",
                  retryable: false,
                  recoveryAction:
                    kind === "schema_config_failure"
                      ? "schema_config_error"
                      : undefined,
                  diagnosticCode:
                    kind === "schema_config_failure"
                      ? "PROFILE_SCHEMA_ERROR"
                      : kind === "timeout"
                        ? "AUTH_BOOTSTRAP_ERROR"
                        : undefined,
                },
              );

              dset((state) => {
                state.status = "error";
                state.error = userFacingAccountError(kind);
                state.isProfileLoaded = false;
                state.isAdmin = false;
                state.isModerator = false;
                // Profile failed hard — do not claim a definitive non-admin role.
                state.isAdminResolved = false;
              });
              return false;
            }
            };

            const promise = run().finally(() => {
              if (inFlightProfileLoad?.userId === userId) {
                inFlightProfileLoad = null;
              }
            });

            inFlightProfileLoad = { userId, promise, abort };

            return promise;
          },

          retryAccountLoad: async () => {
            if (!canRetryAccountRecovery(get().recoveryAttempts)) {
              return false;
            }
            dset((state) => {
              state.recoveryAttempts += 1;
              state.status = "loading";
              state.error = null;
            });
            if (!get().user?.id) {
              await get().initialize();
              return get().isProfileLoaded;
            }
            return get().loadProfile({ force: true });
          },

          updateProfile: async (updates) => {
            const userId = get().user?.id;

            if (!userId) {
              throw new Error("Not authenticated.");
            }

            const data = await profilesDB.update(userId, updates as any);

            const row = data as unknown as ProfileRow;
            const rowRecord = data as unknown as Record<string, unknown>;

            set((state) => {
              state.profile = row;
              state.isOnboarded = getProfileBoolean(
                rowRecord,
                "onboarding_completed",
                state.isOnboarded
              );
              state.planId = getProfileString(
                rowRecord,
                "plan_id",
                state.planId
              );
              state.credits = getProfileNumber(
                rowRecord,
                "credits",
                state.credits
              );
            });
            syncPrivacyPrefsFromProfile(rowRecord.privacy_prefs);
          },

          setProfile: (profile) => {
            set((state) => {
              state.profile = profile;

              if (profile) {
                const row = profile as unknown as Record<string, unknown>;

                state.isOnboarded = getProfileBoolean(
                  row,
                  "onboarding_completed",
                  state.isOnboarded
                );
                state.planId = getProfileString(row, "plan_id", state.planId);
                state.credits = getProfileNumber(
                  row,
                  "credits",
                  state.credits
                );

                const preferred = row.preferred_model as string | null | undefined;
                if (preferred) {
                  useOverlayStore
                    .getState()
                    .setActiveModel(normalizePreferredModel(preferred));
                }

                syncPrivacyPrefsFromProfile(row.privacy_prefs);
              }
            });
          },

          refreshCredits: async () => {
            const userId = get().user?.id;

            if (!userId) {
              return;
            }

            if (inFlightProfileLoad && inFlightProfileLoad.userId === userId) {
              await inFlightProfileLoad.promise;
              return;
            }

            if (inFlightCreditsRefresh) {
              await inFlightCreditsRefresh;
              return;
            }

            const generation = profileLoadGeneration;
            inFlightCreditsRefresh = (async () => {
              const data = await profilesDB.getByIdMaybe(userId);
              if (!data) return;
              if (generation !== profileLoadGeneration) return;

              const row = data as Record<string, unknown>;
              const nextCredits = getProfileNumber(
                row,
                "credits",
                get().credits
              );

              set((state) => {
                state.credits = nextCredits;

                if (state.profile) {
                  state.profile = {
                    ...state.profile,
                    credits: nextCredits,
                  };
                }
              });
            })().finally(() => {
              inFlightCreditsRefresh = null;
            });

            await inFlightCreditsRefresh;
          },

          setUser: (user) => {
            set((state) => {
              state.user = user;
            });
          },

          setSession: (session) => {
            dset((state) => {
              state.session = session;
              state.user =
                (session?.user as unknown as SupabaseUser | undefined) ?? null;
              state.status = session ? "authenticated" : "unauthenticated";
            });
          },

          setError: (error) => {
            set((state) => {
              state.error = error;
            });
          },

          setIsLoading: () => {
            // no-op: status is the source of truth
          },

          reset: () => {
            clearProfileLoadState();
            try {
              resetTransientOverlaySessionStores({
                hideOverlay: true,
                stopTts: true,
                releaseAuthority: true,
              });
            } catch {
              // Best-effort — auth reset must continue.
            }
            // Never Object.assign(INITIAL_STATE): that snapshot may still hold a
            // boot-time cached session and would resurrect auth after sign-out.
            dset((state) => {
              state.status = "unauthenticated";
              state.accountPhase = "UNAUTHENTICATED";
              state.session = null;
              state.user = null;
              state.profile = null;
              state.isProfileLoaded = false;
              state.error = null;
              state.isAdmin = false;
              state.isModerator = false;
              state.isAdminResolved = false;
              state.isOnboarded = false;
              state.planId = "free";
              state.credits = 0;
              state.recoveryAttempts = 0;
              state.isLoading = false;
              state.isAuthenticated = false;
            });
          },
        };
      }),
      {
        name: "clarify-auth-v1",

        /**
         * SECURITY:
         * Persist ONLY non-privileged UI hints.
         *
         * Do not persist:
         * - session
         * - user
         * - JWT/access token
         * - isAdmin
         * - planId
         * - credits
         */
        partialize: (state) => ({
          isOnboarded: state.isOnboarded,
        }),
      }
    ),
    {
      name: "AuthStore",
    }
  )
);

// ─────────────────────────────────────────────────────────────────────────────
// Selectors
// ─────────────────────────────────────────────────────────────────────────────

export const selectIsAuthenticated = (state: AuthStore) =>
  state.isAuthenticated;

export const selectIsLoading = (state: AuthStore) => state.isLoading;

export const selectUser = (state: AuthStore) => state.user;

export const selectProfile = (state: AuthStore) => state.profile;

export const selectPlanId = (state: AuthStore) => state.planId;

export const selectCredits = (state: AuthStore) => state.credits;

export const selectIsAdmin = (state: AuthStore) => state.isAdmin;

export const selectHasByok = (_state: AuthStore) => false;

export const selectPreferredModel = (state: AuthStore) =>
  state.profile?.preferred_model ?? "gemini-flash";

export const selectSubscriptionActive = (state: AuthStore) => {
  const status = state.profile?.subscription_status;

  return status === "active" || status === "trialing";
};
