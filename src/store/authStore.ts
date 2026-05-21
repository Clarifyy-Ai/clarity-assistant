// src/store/authStore.ts
//
// Single source of truth for auth state.
//
// SECURITY PURPOSE:
// - Centralize auth/session/profile state
// - Avoid duplicate auth listeners
// - Avoid persisting JWT/session/user data in Zustand storage
// - Keep role/plan/credits DB-derived, not localStorage-derived
// - Keep BYOK keys encrypted in browser vault and in-memory only
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
import { useOverlayStore } from "@/store/overlayStore";

import {
  loadBYOKVault,
  saveBYOKVault,
  clearBYOKVault,
} from "@/lib/security/byokVault";

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

export interface BYOKKeys {
  openai?: string;
  anthropic?: string;
  gemini?: string;
}

export interface AuthState {
  status: AuthStatus;
  session: SupabaseSession | null;
  user: SupabaseUser | null;
  profile: ProfileRow | null;
  isProfileLoaded: boolean;
  byokKeys: BYOKKeys;
  error: string | null;
  isAdmin: boolean;
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

  loadProfile: () => Promise<void>;
  updateProfile: (updates: Partial<ProfileRow>) => Promise<void>;
  setProfile: (profile: ProfileRow | null) => void;
  refreshCredits: () => Promise<void>;

  setBYOKKey: (provider: keyof BYOKKeys, key: string) => void;
  clearBYOKKey: (provider: keyof BYOKKeys) => void;

  setUser: (user: SupabaseUser | null) => void;
  setSession: (session: SupabaseSession | null) => void;
  setError: (error: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  reset: () => void;
}

export type AuthStore = AuthState & AuthActions;

const INITIAL_STATE: AuthState = {
  status: "idle",
  session: null,
  user: null,
  profile: null,
  isProfileLoaded: false,
  byokKeys: {},
  error: null,
  isAdmin: false,
  isOnboarded: false,
  planId: "free",
  credits: 0,

  isLoading: true,
  isAuthenticated: false,
};

let unsubAuthListener: (() => void) | null = null;

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

function sanitizeBYOKKey(key: string): string {
  return key.trim();
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
            if (unsubAuthListener) {
              unsubAuthListener();
              unsubAuthListener = null;
            }

            dset((state) => {
              state.status = "loading";
              state.error = null;
            });

            try {
              const vault = await loadBYOKVault();

              if (Object.keys(vault).length > 0) {
                set((state) => {
                  state.byokKeys = vault;
                });
              }
            } catch (error) {
              console.warn("[authStore] BYOK vault hydration failed:", error);
            }

            try {
              const {
                data: { session },
                error,
              } = await supabase.auth.getSession();

              if (error) {
                throw error;
              }

              if (session) {
                dset((state) => {
                  state.session = session as unknown as SupabaseSession;
                  state.user = session.user as unknown as SupabaseUser;
                });

                await get().loadProfile();

                dset((state) => {
                  state.status = "authenticated";
                });

                identifyPostHogUser(session.user as unknown as SupabaseUser);
              } else {
                dset((state) => {
                  state.status = "unauthenticated";
                });
              }
            } catch (error) {
              dset((state) => {
                state.status = "error";
                state.error = getErrorMessage(error);
              });
            }

            const { data } = supabase.auth.onAuthStateChange(
              async (event, session) => {
                if (event === "SIGNED_IN" && session) {
                  dset((state) => {
                    state.session = session as unknown as SupabaseSession;
                    state.user = session.user as unknown as SupabaseUser;
                  });

                  await get().loadProfile();

                  dset((state) => {
                    state.status = "authenticated";
                  });

                  identifyPostHogUser(
                    session.user as unknown as SupabaseUser
                  );
                }

                if (event === "SIGNED_OUT") {
                  resetPostHog();
                  get().reset();
                }

                if (event === "TOKEN_REFRESHED" && session) {
                  dset((state) => {
                    state.session = session as unknown as SupabaseSession;
                  });
                }

                if (event === "USER_UPDATED" && session) {
                  dset((state) => {
                    state.session = session as unknown as SupabaseSession;
                    state.user = session.user as unknown as SupabaseUser;
                  });

                  await get().loadProfile();
                }

                if (event === "PASSWORD_RECOVERY" && session) {
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
          },

          signInWithEmail: async (email, password) => {
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

            dset((state) => {
              state.session = data.session as unknown as SupabaseSession;
              state.user = data.user as unknown as SupabaseUser;
              state.status = "authenticated";
            });

            await get().loadProfile();
          },

          signUpWithEmail: async (email, password, fullName) => {
            dset((state) => {
              state.status = "loading";
              state.error = null;
            });

            const { data, error } = await supabase.auth.signUp({
              email: email.trim(),
              password,
              options: {
                data: {
                  full_name: fullName.trim(),
                },
                emailRedirectTo: `${window.location.origin}/auth/callback`,
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

              await get().loadProfile();
            } else {
              dset((state) => {
                state.status = "unauthenticated";
              });
            }
          },

          signInWithOAuth: async (provider) => {
            dset((state) => {
              state.status = "loading";
              state.error = null;
            });

            const { error } = await supabase.auth.signInWithOAuth({
              provider: provider as any,
              options: {
                redirectTo: `${window.location.origin}/auth/callback`,
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

            await supabase.auth.signOut();

            try {
              clearBYOKVault();
            } catch {
              // Ignore local vault clearing failure.
            }

            get().reset();
          },

          clearAuth: async () => {
            await get().signOut();
          },

          sendPasswordReset: async (email) => {
            const { error } = await supabase.auth.resetPasswordForEmail(
              email.trim(),
              {
                redirectTo: `${window.location.origin}/reset-password`,
              }
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
              return;
            }

            const [profileResult, roleResult] = await Promise.all([
              supabase.from("profiles").select("*").eq("id", userId).single(),
              supabase
                .from("user_roles")
                .select("role")
                .eq("user_id", userId)
                .eq("role", "admin")
                .maybeSingle(),
            ]);

            if (profileResult.error || !profileResult.data) {
              console.error(
                "[authStore] Failed to load profile:",
                profileResult.error?.message
              );

              set((state) => {
                state.isProfileLoaded = false;
              });

              return;
            }

            const row = profileResult.data as Record<string, unknown>;
            const hasAdminRole = Boolean(roleResult.data);

            set((state) => {
              state.profile = profileResult.data as unknown as ProfileRow;
              state.isProfileLoaded = true;
              state.isAdmin = hasAdminRole;
              state.isOnboarded = getProfileBoolean(
                row,
                "onboarding_completed",
                false
              );
              state.planId = getProfileString(row, "plan_id", "free");
              state.credits = getProfileNumber(row, "credits", 0);
            });

            syncOverlayFromProfile(row);
          },

          updateProfile: async (updates) => {
            const userId = get().user?.id;

            if (!userId) {
              throw new Error("Not authenticated.");
            }

            const payload: Partial<ProfileRow> & {
              updated_at: string;
            } = {
              ...updates,
              updated_at: new Date().toISOString(),
            };

            const { data, error } = await supabase
              .from("profiles")
              .update(payload as any)
              .eq("id", userId)
              .select()
              .single();

            if (error) {
              throw error;
            }

            const row = data as unknown as ProfileRow;
            const rowRecord = data as Record<string, unknown>;

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
              }
            });
          },

          refreshCredits: async () => {
            const userId = get().user?.id;

            if (!userId) {
              return;
            }

            const { data, error } = await supabase
              .from("profiles")
              .select("credits")
              .eq("id", userId)
              .single();

            if (error || !data) {
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

          setBYOKKey: (provider, key) => {
            const sanitizedKey = sanitizeBYOKKey(key);

            set((state) => {
              state.byokKeys[provider] = sanitizedKey;
            });

            void saveBYOKVault({
              ...get().byokKeys,
              [provider]: sanitizedKey,
            }).catch((error) => {
              console.error("[authStore] BYOK persist failed:", error);
            });
          },

          clearBYOKKey: (provider) => {
            set((state) => {
              delete state.byokKeys[provider];
            });

            const nextKeys = {
              ...get().byokKeys,
            };

            delete nextKeys[provider];

            void saveBYOKVault(nextKeys).catch((error) => {
              console.error("[authStore] BYOK clear failed:", error);
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
            dset((state) => {
              Object.assign(state, INITIAL_STATE);

              state.status = "unauthenticated";
              state.isLoading = false;
              state.isAuthenticated = false;
              state.byokKeys = {};
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
         * - byokKeys
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

export const selectHasByok = (state: AuthStore) =>
  Boolean(
    state.byokKeys.openai ||
      state.byokKeys.anthropic ||
      state.byokKeys.gemini
  );

export const selectPreferredModel = (state: AuthStore) =>
  state.profile?.preferred_model ?? "gpt-4o";

export const selectSubscriptionActive = (state: AuthStore) => {
  const status = state.profile?.subscription_status;

  return status === "active" || status === "trialing";
};
