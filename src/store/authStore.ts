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
import { isOAuthProviderEnabled } from "@/lib/auth/oauthProviders";
import { isElectronApp } from "@/lib/platform/isElectron";
import { clearBYOKVault } from "@/lib/security/byokVault";
import { logger, LogEvents } from "@/lib/logger";
import { syncPrivacyPrefsFromProfile } from "@/lib/privacy/privacyPrefs";
import {
  isInvalidRefreshTokenError,
  isNonRetryableAuthError,
  redirectToSessionExpiredLogin,
} from "@/lib/auth/sessionErrors";
import { buildAuthRedirectUrl } from "@/lib/auth/redirectUrl";
import {
  clearTabLocalLogout,
  isTabLocalLogout,
  markTabLocalLogout,
  softClearTabSession,
} from "@/lib/auth/tabLocalLogout";

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

const AUTH_SESSION_TIMEOUT_MS = isElectronApp() ? 10_000 : 8_000;

/**
 * Per-attempt budget for the profile read.
 * us-east-1 round-trips from India commonly take 1–2s; 2s caused false timeouts.
 */
const PROFILE_FETCH_TIMEOUT_MS = 8_000;

/** Role lookup is non-blocking for routing; align with profile budget. */
const ROLE_CHECK_TIMEOUT_MS = 8_000;

const PROFILE_ERROR_MESSAGE =
  "We're having trouble loading your profile. Please try again.";

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    }),
  ]);
}


/**
 * Resolve admin role with one retry on abort/timeout/network failure.
 * Non-retryable auth errors are propagated immediately.
 * Unresolved result must NOT be treated as "not admin".
 */
async function resolveAdminRole(
  userId: string
): Promise<{ resolved: boolean; isAdmin: boolean }> {
  const startedAt = Date.now();
  logger.info(LogEvents.AUTH_ROLE_LOAD_STARTED, {
    operation: "role.load",
    attempt: 1,
  });

  const attempt = () =>
    withTimeout(
      userRolesDB.hasRole(userId, "admin"),
      ROLE_CHECK_TIMEOUT_MS,
      "Role check"
    );

  try {
    const isAdmin = await attempt();
    logger.info(LogEvents.AUTH_ROLE_LOAD_SUCCEEDED, {
      operation: "role.load",
      attempt: 1,
      durationMs: Date.now() - startedAt,
      outcome: "succeeded",
      authState: isAdmin ? "admin" : "non_admin",
    });
    return { resolved: true, isAdmin };
  } catch (err) {
    const timedOut = getErrorMessage(err).toLowerCase().includes("timed out");
    // Do not retry auth failures — they will fail again immediately.
    if (isNonRetryableAuthError(err)) {
      logger.warn(LogEvents.AUTH_ROLE_LOAD_FAILED, {
        operation: "role.load",
        attempt: 1,
        durationMs: Date.now() - startedAt,
        outcome: "failed",
        retryable: false,
        recoveryAction: "skip_retry",
      });
      console.warn("[authStore] Admin role check: non-retryable auth error", getErrorMessage(err));
      return { resolved: false, isAdmin: false };
    }
    if (timedOut) {
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
      logger.info(LogEvents.AUTH_ROLE_LOAD_SUCCEEDED, {
        operation: "role.load",
        attempt: 2,
        durationMs: Date.now() - startedAt,
        outcome: "succeeded",
        authState: isAdmin ? "admin" : "non_admin",
      });
      return { resolved: true, isAdmin };
    } catch (retryErr) {
      const retryTimedOut = getErrorMessage(retryErr)
        .toLowerCase()
        .includes("timed out");
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
          recoveryAction: "leave_unresolved",
        },
      );
      console.warn(
        "[authStore] Admin role check retry failed; leaving unresolved:",
        retryErr
      );
      // Leave unresolved so gates show loading instead of false Access Denied.
      return { resolved: false, isAdmin: false };
    }
  }
}

export interface AuthState {
  status: AuthStatus;
  session: SupabaseSession | null;
  user: SupabaseUser | null;
  profile: ProfileRow | null;
  isProfileLoaded: boolean;
  error: string | null;
  isAdmin: boolean;
  /** True only after a successful user_roles read (admin or not). Abort/timeout leave this false. */
  isAdminResolved: boolean;
  isOnboarded: boolean;
  planId: string;
  credits: number;

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
    fullName: string
  ) => Promise<void>;
  signInWithOAuth: (provider: AuthProvider) => Promise<void>;
  signOut: () => Promise<void>;
  clearAuth: () => Promise<void>;

  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;

  loadProfile: () => Promise<boolean>;
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
      status: "authenticated",
      session: cached.session as unknown as SupabaseSession,
      user: cached.user as unknown as SupabaseUser,
      profile: null,
      isProfileLoaded: false,
      error: null,
      isAdmin: false,
      isAdminResolved: false,
      isOnboarded: false,
      planId: "free",
      credits: 0,
      isLoading: false,
      isAuthenticated: true,
    };
  }

  return {
    status: "loading",
    session: null,
    user: null,
    profile: null,
    isProfileLoaded: false,
    error: null,
    isAdmin: false,
    isAdminResolved: false,
    isOnboarded: false,
    planId: "free",
    credits: 0,
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
let inFlightProfileLoad: { userId: string; promise: Promise<boolean> } | null = null;

const PROFILE_CACHE_TTL_MS = 30_000;
let profileCache: { userId: string; profile: ProfileRow; cachedAt: number } | null = null;

function clearProfileLoadState(): void {
  inFlightProfileLoad = null;
  profileCache = null;
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

            draft.isLoading =
              draft.status === "idle" || draft.status === "loading";
            draft.isAuthenticated = draft.status === "authenticated";
          });
        };

        return {
          ...INITIAL_STATE,

          initialize: async () => {
            // ── Bootstrap guard ──────────────────────────────────────────────
            // React StrictMode fires effects twice (mount→unmount→mount) in
            // development. The second call arrives before the first completes,
            // so we guard with a module-level flag rather than a store flag
            // (store state updates are async and would arrive too late).
            if (_bootstrapping) {
              logger.warn(LogEvents.BOOTSTRAP_DUPLICATE_PREVENTED, {
                operation: "initialize",
                outcome: "skipped",
              });
              console.warn("[authStore] initialize() called while already bootstrapping — skipped (StrictMode guard)");
              return;
            }
            _bootstrapping = true;
            logger.info(LogEvents.BOOTSTRAP_STARTED, {
              operation: "initialize",
            });

            if (unsubAuthListener) {
              unsubAuthListener();
              unsubAuthListener = null;
            }

            const hadCachedSession =
              get().status === "authenticated" && Boolean(get().session);

            if (!hadCachedSession) {
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
              // Wipe any legacy BYOK vault remnants from older clients.
              clearBYOKVault();
            } catch {
              // Ignore vault wipe failures.
            }

            // ── NOTE: Do NOT call loadProfile() here based on cached session. ──
            // The cached session may hold a stale/revoked refresh token.
            // Always wait for getSession() to confirm the token is valid before
            // starting profile or role queries. Calling loadProfile() before
            // getSession() completes causes:
            //   (a) duplicate profile load (once here, once after getSession),
            //   (b) profile/role requests failing with 401 on a stale token,
            //   (c) repeated timeout warnings that look like an auth loop.

            // This tab opted out of the shared session (independent logout).
            // Skip hydrating from getSession(); still attach the normal listener
            // so an intentional login in this tab can recover.
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
            } else {
              try {
                const {
                  data: { session },
                  error,
                } = await withTimeout(
                  supabase.auth.getSession(),
                  AUTH_SESSION_TIMEOUT_MS,
                  "Session check",
                );

                if (error) {
                  throw error;
                }

                if (session) {
                  dset((state) => {
                    state.session = session as unknown as SupabaseSession;
                    state.user = session.user as unknown as SupabaseUser;
                  });

                  const profileLoaded = await get().loadProfile();
                  // Do not return early on profile failure — listener registration and
                  // bootstrap lock release must still run below.
                  if (profileLoaded) {
                    dset((state) => {
                      state.status = "authenticated";
                    });

                    logger.info(LogEvents.BOOTSTRAP_COMPLETED, {
                      operation: "initialize",
                      authState: "authenticated",
                      outcome: "succeeded",
                    });
                    identifyPostHogUser(session.user as unknown as SupabaseUser);
                  }
                } else {
                  dset((state) => {
                    state.status = "unauthenticated";
                  });
                  logger.info(LogEvents.BOOTSTRAP_COMPLETED, {
                    operation: "initialize",
                    authState: "anonymous",
                    outcome: "succeeded",
                  });
                }
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
                } else {
                  logger.error(LogEvents.BOOTSTRAP_FAILED, {
                    outcome: "failed",
                    operation: "session.check",
                  });
                  dset((state) => {
                    state.status = "error";
                    state.error = getErrorMessage(error);
                  });
                }
              }
            }

            try {
              // Register the auth listener before releasing the bootstrap lock so a
              // StrictMode double-mount cannot start a second initialize() that races
              // listener registration.
              const { data } = supabase.auth.onAuthStateChange(
                async (event, session) => {
                  if (event === "SIGNED_IN" && session) {
                    // Cross-tab storage sync must not undo independent logout.
                    // Intentional login clears the flag before calling signIn*.
                    if (isTabLocalLogout()) {
                      void softClearTabSession(() =>
                        supabase.auth.signOut({ scope: "local" }),
                      );
                      return;
                    }
                    dset((state) => {
                      state.session = session as unknown as SupabaseSession;
                      state.user = session.user as unknown as SupabaseUser;
                    });

                    const profileLoaded = await get().loadProfile();
                    if (!profileLoaded) {
                      return;
                    }

                    dset((state) => {
                      state.status = "authenticated";
                    });

                    identifyPostHogUser(
                      session.user as unknown as SupabaseUser
                    );
                  }

                  if (event === "SIGNED_OUT") {
                    if (isTabLocalLogout()) {
                      return;
                    }
                    resetPostHog();
                    get().reset();
                  }

                  if (event === "TOKEN_REFRESHED" && session) {
                    if (isTabLocalLogout()) {
                      void softClearTabSession(() =>
                        supabase.auth.signOut({ scope: "local" }),
                      );
                      return;
                    }
                    dset((state) => {
                      state.session = session as unknown as SupabaseSession;
                    });
                    // Re-check ban on refresh so a mid-session admin ban takes effect.
                    void get().loadProfile();
                  }

                  if (event === "USER_UPDATED" && session) {
                    if (isTabLocalLogout()) {
                      return;
                    }
                    dset((state) => {
                      state.session = session as unknown as SupabaseSession;
                      state.user = session.user as unknown as SupabaseUser;
                    });

                    void get().loadProfile();
                  }

                  if (event === "PASSWORD_RECOVERY" && session) {
                    if (isTabLocalLogout()) {
                      return;
                    }
                    dset((state) => {
                      state.session = session as unknown as SupabaseSession;
                      state.user = session.user as unknown as SupabaseUser;
                      state.status = "authenticated";
                    });
                  }
                }
              );

              unsubAuthListener = () => {
                data.subscription.unsubscribe();
              };
            } finally {
              // Release after listener attach so deliberate re-init (OAuth / password
              // reset) can run, but concurrent StrictMode boots stay serialized.
              _bootstrapping = false;
            }
          },

          signInWithEmail: async (email, password) => {
            clearTabLocalLogout();
            dset((state) => {
              state.status = "loading";
              state.error = null;
            });

            const { data, error } = await supabase.auth.signInWithPassword({
              email: email.trim(),
              password,
            });

            if (error) {
              dset((state) => {
                state.status = "error";
                state.error = error.message;
              });

              throw error;
            }

            // Keep status "loading" until the profile (and ban check) resolves so a
            // suspended account is never briefly treated as authenticated.
            dset((state) => {
              state.session = data.session as unknown as SupabaseSession;
              state.user = data.user as unknown as SupabaseUser;
            });

            const profileLoaded = await get().loadProfile();

            if (!profileLoaded) {
              let banMessage: string | null = null;
              try {
                banMessage = sessionStorage.getItem("clarify_auth_ban_message");
                if (banMessage) sessionStorage.removeItem("clarify_auth_ban_message");
              } catch {
                // Ignore storage failures.
              }

              throw new Error(
                banMessage ?? get().error ?? PROFILE_ERROR_MESSAGE
              );
            }

            dset((state) => {
              state.status = "authenticated";
            });

          },

          signUpWithEmail: async (email, password, fullName) => {
            clearTabLocalLogout();
            dset((state) => {
              state.status = "loading";
              state.error = null;
            });

            const normalizedEmail = email.trim().toLowerCase();

            const { data, error } = await supabase.auth.signUp({
              email: normalizedEmail,
              password,
              options: {
                data: {
                  full_name: fullName.trim(),
                },
                emailRedirectTo: buildAuthRedirectUrl({
                  path: "/auth/callback",
                  configuredAppUrl: import.meta.env.VITE_APP_URL,
                  appEnv: import.meta.env.VITE_APP_ENV,
                  windowOrigin:
                    typeof window !== "undefined" ? window.location.origin : null,
                }),
              },
            });

            if (error) {
              dset((state) => {
                state.status = "error";
                state.error = error.message;
              });

              throw error;
            }

            if (data.session) {
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
              dset((state) => {
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
                redirectTo: buildAuthRedirectUrl({
                  path: "/auth/callback",
                  configuredAppUrl: import.meta.env.VITE_APP_URL,
                  appEnv: import.meta.env.VITE_APP_ENV,
                  windowOrigin:
                    typeof window !== "undefined" ? window.location.origin : null,
                }),
                scopes: provider === "google" ? "email profile" : undefined,
              },
            });

            if (error) {
              dset((state) => {
                state.status = "error";
                state.error = error.message;
              });

              throw error;
            }
          },

          signOut: async () => {
            dset((state) => {
              state.status = "loading";
              state.error = null;
            });

            // Tab-local only: keep shared localStorage session so other tabs stay signed in.
            clearProfileLoadState();
            markTabLocalLogout();
            resetPostHog();
            try {
              clearBYOKVault();
            } catch {
              // Ignore local vault clearing failure.
            }
            await softClearTabSession(() =>
              supabase.auth.signOut({ scope: "local" }),
            );
            get().reset();
          },

          clearAuth: async () => {
            await get().signOut();
          },

          sendPasswordReset: async (email) => {
            const redirectTo = buildAuthRedirectUrl({
              path: "/reset-password",
              configuredAppUrl: import.meta.env.VITE_APP_URL,
              appEnv: import.meta.env.VITE_APP_ENV,
              windowOrigin:
                typeof window !== "undefined" ? window.location.origin : null,
            });

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

          loadProfile: async () => {
            const userId = get().user?.id;

            if (!userId) {
              return false;
            }

            // Dedupe: initialize(), SIGNED_IN and route guards can all trigger a
            // load for the same user within the same tick.
            if (inFlightProfileLoad && inFlightProfileLoad.userId === userId) {
              return inFlightProfileLoad.promise;
            }

            const cached = profileCache;
            if (
              cached &&
              cached.userId === userId &&
              Date.now() - cached.cachedAt < PROFILE_CACHE_TTL_MS &&
              get().isProfileLoaded &&
              get().profile
            ) {
              return true;
            }

            // Surface loading UI when recovering from a prior error state.
            if (get().status === "error") {
              set((state) => {
                state.status = "loading";
                state.error = null;
                state.isLoading = true;
              });
            }

            const run = async (): Promise<boolean> => {
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

            const fetchProfile = () =>
              withTimeout(
                profilesDB.getByIdMaybe(userId),
                PROFILE_FETCH_TIMEOUT_MS,
                "Profile load",
              );

            try {
              let profile: Awaited<ReturnType<typeof profilesDB.getByIdMaybe>>;
              // Role lookup runs in parallel — it must never add latency to routing.
              const rolePromise = resolveAdminRole(userId);

              try {
                profile = await fetchProfile();
              } catch (firstErr) {
                // Non-retryable auth errors must not be retried — they will fail
                // immediately again and waste another PROFILE_FETCH_TIMEOUT_MS.
                if (isNonRetryableAuthError(firstErr)) {
                  throw firstErr;
                }
                const timedOut = getErrorMessage(firstErr)
                  .toLowerCase()
                  .includes("timed out");
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
                profile = await fetchProfile();
              }

              const roleResult = await rolePromise;

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

              profileCache = {
                userId,
                profile: profile as unknown as ProfileRow,
                cachedAt: Date.now(),
              };

              set((state) => {
                if (get().user?.id !== userId) return;
                state.profile = profile as unknown as ProfileRow;
                state.isProfileLoaded = true;
                if (state.status === "error") state.status = "authenticated";

                state.error = null;
                if (roleResult.resolved) {
                  state.isAdmin = roleResult.isAdmin;
                  state.isAdminResolved = true;
                }
                // Unresolved role check: leave prior flags; do not set isAdmin=false.
                state.isOnboarded = getProfileBoolean(
                  row,
                  "onboarding_completed",
                  false
                );
                state.planId = getProfileString(row, "plan_id", "free");
                state.credits = getProfileNumber(row, "credits", 0);
              });

              // Transient role abort left unresolved — retry once more in background
              // so a real admin is not stuck behind a permanent loading gate.
              if (!roleResult.resolved && !get().isAdminResolved) {
                setTimeout(() => {
                  void (async () => {
                    if (get().user?.id !== userId || get().isAdminResolved) return;
                    const retry = await resolveAdminRole(userId);
                    if (get().user?.id !== userId || !retry.resolved) return;
                    set((state) => {
                      state.isAdmin = retry.isAdmin;
                      state.isAdminResolved = true;
                    });
                  })();
                }, 750);
              }

              syncOverlayFromProfile(row);
              syncPrivacyPrefsFromProfile(row.privacy_prefs);
              logger.info(LogEvents.AUTH_PROFILE_LOAD_SUCCEEDED, {
                operation: "profile.load",
                durationMs: Date.now() - profileStartedAt,
                outcome: "succeeded",
                correlationId,
              });
              return true;
            } catch (err) {
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

              const timedOut = getErrorMessage(err)
                .toLowerCase()
                .includes("timed out");

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
                },
              );

              dset((state) => {
                state.status = "error";
                state.error = PROFILE_ERROR_MESSAGE;
                state.isProfileLoaded = false;
                state.isAdmin = false;
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

            inFlightProfileLoad = { userId, promise };

            return promise;
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

            const data = await profilesDB.getByIdMaybe(userId);
            if (!data) {
              return;
            }

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
            // Never Object.assign(INITIAL_STATE): that snapshot may still hold a
            // boot-time cached session and would resurrect auth after sign-out.
            dset((state) => {
              state.status = "unauthenticated";
              state.session = null;
              state.user = null;
              state.profile = null;
              state.isProfileLoaded = false;
              state.error = null;
              state.isAdmin = false;
              state.isAdminResolved = false;
              state.isOnboarded = false;
              state.planId = "free";
              state.credits = 0;
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
